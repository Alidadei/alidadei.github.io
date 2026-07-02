---
title: 'LLM 后训练 基础理论&代码-基于TRL库源码解读'
date: 2026-06-17
tags:
  - LLM
  - Agentic RL
  - TRL
categories: ['note', 'ai', 'llm']
knowledge: ['ai/llm/rl']
maturity: 当下热点
lang: zh
---

## 引言

LLM 后训练（Post-training）指的是在预训练（pre-training）完成之后，对模型进行有监督微调（SFT）和偏好对齐（如 DPO、RLHF/PPO、GRPO）的阶段。

预训练让模型学会语言建模和通用知识——对下一个 token 做预测、在大量文本中建立语法、事实和推理能力。后训练则在预训练基础上，进一步让模型学会"听话"：遵循指令、对齐人类偏好、使用外部工具等，一个好的后训练流程能充分释放预训练能力，而糟糕的后训练甚至可能破坏预训练学到的知识。

目前主流后训练流程通常是 **SFT → [RM] → RL/DPO** 三步走（经典 RLHF 路线），或者 **SFT → GRPO** 两步走（跳过单独的 reward model，直接用组内比较代替）。

本文介绍以上几个常见后训练方法，同时对照 TRL 库的实际代码进行解读，方便随时复习。

## SFT

SFT是有监督微调的缩写，也就是需要给模型一个ground truth（GT）进行训练。对于LLM来说，GT一般是一段标准回复语（比如：客服针对某个问题的回答或者是某个工具调用的标准模板）。

### 核心代码

```
Label Masking: labels[:prompt_len] = -100
CrossEntropyLoss(ignore_index=-100) → 只对 assistant 部分算 loss
```

**pretraining 教模型通用知识和如何说话，SFT 主要教模型”听话”。** pretraining 阶段模型会对所有 token 逐个计算交叉熵损失（每个位置都学）。

**交叉熵损失公式**：给定一个位置 t，模型输出词表 V 上的概率分布 p，真实目标是 one-hot 向量 y（目标 token 为 1，其余为 0）：
$$
\text{CE}_t = -\sum_{i=1}^{|V|} y_i \cdot \log(p_i) = -\log(p_{\text{target\_token}})
$$

对于自回归语言模型，输入序列有 L 个 token，模型在每个位置 t 预测下一个 token，loss 是所有位置的平均：

$$
\mathcal{L}_{\text{CE}} = \frac{1}{L} \sum_{t=1}^{L} \text{CE}_t = -\frac{1}{L} \sum_{t=1}^{L} \log(p_{\text{target\_token}})
$$

**算的是谁和谁的交叉熵损失？** 模型输出的预测概率分布（softmax 后的 logits）与 **学习内容 token 的 one-hot 分布**之间的交叉熵。等价于让模型在每个位置给”正确的下一个 token”分配尽可能高的概率。pretraining 对所有训练语料的位置都计算损失，SFT 只对特定内容（比如： assistant 回复）部分计算损失。

但到了 SFT 阶段，就**仅在 特定 回答语料部分**计算这个 loss（prompt 部分用 `labels[:prompt_len] = -100` 屏蔽，`ignore_index=-100` 跳过），为的就是让模型只学“怎么回答”，不去动它已有的通用知识——即在保留预训练能力的前提下，补充指令跟随的能力。

### SFT 的局限

- 只会模仿，不会判断：无法区分好回答和坏回答
- 分布外崩溃：没见过的问题格式会导致质量断崖

---

## DPO

**核心思想**：DPO 是 Direct Preference Optimization（直接偏好优化）的简写，其直接用偏好数据训练策略，不需要单独的 RM。理论依据是最优策略 π* 与参考策略 π_ref 之间存在闭式解，于是 reward 可写成 log 概率比 r(x,y) = β·log(π_θ(y)/π_ref(y))，代回偏好排序目标后整个优化退化成一个二分类损失。一句话：**用偏好数据直接对齐，跳过显式的 reward 建模**。

### 核心公式

```
loss_DPO =-log σ(β × [log(ratio_chosen)- log(ratio_rejected)])
         =-log σ(β × [log(π_θ(chosen)/π_ref(chosen))- log(π_θ(rejected)/π_ref(rejected))])
```

### 拆解

先明确符号：`π_θ` 是当前正在训练的策略，`π_ref` 是冻结的参考策略（通常是 SFT 模型，作 KL 锚点）；`chosen` 是人工标注为“更好”的回答，`rejected` 是同一 prompt 下标注为“更差”的回答——成对出现。

```
ratio_chosen   = π_θ(chosen) / π_ref(chosen)     ← chosen 的概率提升比
ratio_rejected = π_θ(rejected) / π_ref(rejected)  ← rejected 的概率提升比
log_diff       = log(ratio_chosen) - log(ratio_rejected)
loss           = -log σ(β × log_diff)
```

### 直觉

"让模型觉得 chosen 回答比训练前变好的程度，远大于 rejected 回答比训练前变好的程度。"

### 为什么取 log

1. **数值稳定**：概率连乘 → log 连加，避免 underflow
2. **比值变差值**：`log(a/b) = log(a) - log(b)`

### 为什么取负号

目标是让 `σ(β·log_diff)` 尽量大（chosen 相对提升超过 rejected），但优化器只能**最小化** loss。加负号 `-log σ(...)` 把“最大化”翻转成“最小化”，于是梯度下降 loss 等价于最大化 chosen 的相对优势。这也解释了训练时 loss 常常是负的——模型在“做对方向”。

### β 的作用

- β 大: 容忍 chosen 和 rejected 差距小
- β 小: 要求 chosen 明显优于 rejected

### DPO 的缺陷

**离线训练**: 偏好数据是预采集的，模型的生成分布在变，数据覆盖不到。这就是"离线 vs 在线"的核心区别。

---

## GRPO&PPO

**PPO（Proximal Policy Optimization，近端策略优化）** 是 RLHF 中最常用的强化学习算法，核心思路是在每次策略更新时加一个”信任区域”约束——不让新策略比旧策略偏离太多。它通过一个 Clipped Surrogate Objective 来实现这个约束：概率比 r(θ) 超出 [1-ε, 1+ε] 范围的部分被截断，从而防止单步更新过大导致崩溃。

**GRPO（Group Relative Policy Optimization，组相对策略优化）** 是 DeepSeek 提出的 PPO 变体，核心改动是去掉 Critic（价值网络），改用组内标准化来计算 advantage。对同一 prompt 采样 G 个回答，这组回答的 reward 均值作为 baseline，每个回答的 reward 减去这个均值再除以标准差，就得到了 advantage。

|            | PPO | GRPO |
|------------|-----|------|
| Advantage 来源 | Critic 网络 V(s) | 组内标准化 (r - μ)/σ |
| 额外模型 | 需要训练一个和 Actor 同等大小的 Critic | 无 |
| 显存开销 | 高（需同时加载 ~2 个 LLM） | 低（只需 1 个 LLM） |
| 关系 | 原始 RLHF 方案 | PPO 的简化变体，去掉 Critic |

一句话总结：**GRPO = PPO 的 loss + 组内比较代替 Critic，省一个大模型、省显存。**

GRPO 和 PPO 共用同一个 **Clipped Surrogate Objective**（截断式代理损失）：

```
L^CLIP = E[ min( r(θ)·A,  clip(r(θ), 1-ε, 1+ε)·A ) ]
```

其中 `r(θ) = π_new / π_old` 是新旧策略的概率比，`A` 是 advantage，`clip` 把 r 限制在 `[1-ε, 1+ε]`（如 [0.8, 1.2]）防止单步更新过大。

**两者的区别只在 advantage 的来源**：
- **PPO**：用 Critic（Value 网络）估状态价值 V(s)，`A = R − V(s)`，需**额外训练一个和 Actor（被训练的LLM） 同等大小的 Critic模型（一般也是个LLM）**。
- **GRPO**：**去掉 Critic**，对同一 prompt 采样 G 个回答，组内标准化（减均值、除标准差）得到 advantage——用组统计替代 Critic 的 baseline。
- 一句话：GRPO = PPO 的 loss + 组内比较代替 Critic，省一个大模型、省显存。

### GRPO _compute_loss 实际代码（grpo_trainer.py:2553-2561）

```python
coef_1 = exp(log_ratio)                                  # r(θ) = π_current / π_old
coef_2 = clamp(coef_1, 1 - ε_low, 1 + ε_high)           # 限制在 [0.8, 1.2]

per_token_loss1 = coef_1 × advantages                     # 原始 loss
per_token_loss2 = coef_2 × advantages                     # clipped loss
per_token_loss  = -min(per_token_loss1, per_token_loss2) # 取保守的
```

### Clip 的两种情况

- **advantage > 0（好）**: 取 min → 限制 ratio 上限 → 防止概率飙升
- **advantage < 0（差）**: 取 min → 限制 ratio 下限 → 防止概率骤降

### 完整 loss

```
per_token_loss = -min(coef_1×adv, coef_2×adv) + β × per_token_kl
loss = mean(per_token_loss × mask)
```

其中 `β × per_token_kl` 是 KL 惩罚项，作用是把当前策略（正在RL更新的模型）拉回参考策略（RL训练之前的模型）附近、防止跑偏（也就是用KL散度来约束模型不要和训练之前相差太多）。

`per_token_kl` 用下文 **k3 estimator** 计算（KL 的无偏估计），逐 token 算、最后取 mask 内均值。

#### k3 estimator——KL 的无偏估计

先铺垫两个概念：

- **无偏估计**：估计量在大量重复采样下的**期望**等于真实值。不要求单个样本等于真实值——单次可以偏高或偏低，只要期望对得上就算无偏。
- **KL 散度**：衡量两个分布的差异，`KL(P||Q) = Σ P(x)·log(P(x)/Q(x))`。这里 `KL(π_current || π_ref)` 衡量当前策略偏离参考策略的程度，越大越”跑偏”。
- **k3 estimator**：KL 散度的无偏估计量，定义为 `k3 = exp(x) - x - 1`，其中 `x = ref_logp - current_logp`。对比 KL 需要对整个词表求和（遍历数万 token），k3 只依赖模型已生成的单个 token y 的 log 概率，计算开销极低。

问题在于：按定义算 KL 要对**整个词汇表**求和，开销巨大。k3 的思路是用一个可由已采样 token 计算的表达式，使其期望恰好等于真实 KL（无偏），从而用 Monte Carlo 样本近似，不必遍历词表。

#### 为什么 k3 是 KL 的无偏估计

对于某个 token `y`（给定前文 context，两个模型分别认为下一个 token 恰好是 y 的概率）：

- `current_logp = log π_current(y)` — 当前被训练模型生成token y 的对数概率
- `ref_logp= log π_ref(y)` — 训练之前冻结的模型生成token y 的对数概率
- `x = ref_logp - current_logp = log(π_ref(y) / π_current(y))` — 两者的对数概率之差

**KL 散度定义：**`KL(π_current || π_ref) = E_{y ~ π_current}[log(π_current(y) / π_ref(y))]`

**k3 estimator的定义：** 对于当前 token y，令 `x = ref_logp - current_logp = log(π_ref(y) / π_current(y))`，则

$$
\text{k3}(x) = e^{x} - x - 1
$$

其期望等于 KL 散度：

$$
\mathbb{E}_{y \sim \pi_{\text{current}}}[\text{k3}(x)] = \text{KL}(\pi_{\text{current}} || \pi_{\text{ref}})
$$

所以 k3 是 KL 的无偏估计——单次 k3 可能偏高或偏低（取决于采样到的 y），但大量 token 的均值收敛到真实 KL。

其中 `E_{y ~ π_current}[·]` 表示”token y 服从分布 π_current 的期望”，其实就是当前这个token y 是由正在被训练的模型来生成的。

**推导 k3 estimator 的期望**：

```
E[exp(x) - x - 1]
= E[π_ref(y)/π_current(y)] - E[log(π_ref(y)/π_current(y))] - 1
```

关键在第一个期望项——展开为离散期望的定义：

```
E_{y~π_current}[π_ref(y)/π_current(y)]
= Σ π_current(y) × π_ref(y)/π_current(y)    ← 离散期望定义: E[f(y)] = Σ P(y)×f(y)
= Σ π_ref(y)                                ← π_current 约掉
= 1                                          ← 概率分布总和必为 1
```

代回：

```
E[exp(x) - x - 1] = 1 - E[log(π_ref/π_current)] - 1
                   = -E[log(π_ref/π_current)]
                   = E[log(π_current/π_ref)]
                   = KL(π_current || π_ref)   ✓
```

#### **实际计算**：

训练时对 completion 中每个 token 位置分别算 `per_token_kl`，最后 `mean()`。代码中是一行向量化操作。y 是已生成的具体 token——用已发生的样本近似期望（Monte Carlo 估计），不对整个词汇表求和。

**数值例子**：假设一个 completion 有 3 个 token，current 和 ref 的 log 概率如下：

| token | current_logp | ref_logp | x = ref - current | k3 = eˣ - x - 1 |
|-------|-------------|---------|-------------------|----------------|
| “I” | -1.0 | -1.2 | -0.2 | e⁻⁰·² + 0.2 - 1 = **0.0187** |
| “love” | -0.5 | -2.0 | -1.5 | e⁻¹·⁵ + 1.5 - 1 = **0.7231** |
| “AI” | -1.5 | -1.0 | +0.5 | e⁰·⁵ - 0.5 - 1 = **0.1487** |

解释：
- token “I”：current ≈ ref，x ≈ 0，k3 ≈ 0（模型在”答案”的开头对是否回答I的态度和训练前差不多）
- token “love”：current 远高于 ref（x = -1.5，表示 π_current 认为这个词的概率远大于 π_ref），k3 ≈ 0.723（偏离最大）
- token “AI”：current 略低于 ref（x = +0.5），k3 ≈ 0.149，偏离适中

最终 `per_token_kl = mean(0.0187, 0.7231, 0.1487) ≈ 0.2968`。

---

### GRPO Advantage 计算

#### 组内标准化

```
B = batch_size（prompt 数量）
G = num_generations（每个 prompt 生成几个 completion）

rewards: (B×G,) 标量 → view(-1, G) → (B, G) 每行一组

mean_grouped = nanmean(每行) → repeat → (B×G,)
std_rewards  = nanstd(每行)  → repeat → (B×G,)

advantages = (rewards - mean_grouped) / (std_rewards + 1e-4)
```

#### 两步的作用

| 操作 | 作用 |
|------|------|
| de-mean | 组内比较——不同 prompt 不跨组比 |
| 除以 std | 梯度平衡——各组信号强度一致 |

#### 关键数值

- 1e-4: std=0 时防止除零
- nanmean/nanstd: 跳过 NaN（reward 返回 None 的位置）
- G=1: 每组只有一个值，mean=自己，advantage=0，没有学习信号
- G≥2: 必须

---

## Agent GRPO 

### 普通 GRPO vs Agent GRPO

```
普通:  prompt → generate → completion → reward
Agent: prompt → generate → tool_call → execute → result → generate → answer → reward
```

唯一区别是多了一层 `_tool_call_loop`，完整流程如下：

```
① 生成      prompt → model.generate() → completion (含 tool_calls)
② 工具循环  _tool_call_loop: 检测 tool_calls → 执行 tool → 插入结果 → 继续生成 → final completion
③ 打分      _calculate_rewards() → 多个 reward func → 组内标准化 → advantages
④ 算 loss   _compute_loss: log_ratio → coef_1/coef_2 → per_token_loss → loss
⑤ 更新      loss.backward() → optimizer.step()
```

### tool_mask

标记哪些 token 是模型生成的(mask==1)，哪些是 tool 返回的(mask==0)。tool 返回的 token 不参与 loss。

---

## Reward 设计

reward function是RL的灵魂所在，它决定了每次在LLM生成一次回答后，如何进行评估并给出一个粗略的反馈方向（奖励或惩罚，之后critic模型负责决定具体奖励或惩罚多少）。有的算法会专门训练一个Reward Model来充当reward function（比如专门训练一个RM来对齐人类偏好），但是PPO和GRPO通常是自带一个reward function（比如根据作答的正确与错误来决定奖励或惩罚）。

### 三原则

| 原则 | 内容 |
|------|------|
| 1. 正交 | 每个 reward 只管一件事，看 completion 的不同部分 |
| 2. 负>正 | 惩罚 > 奖励，模型更怕被罚 |
| 3. 稠密 | 中间步骤也给信号，不只有最终答案 |

### 正交三技巧

1. **按层级拆分**: structure 看 turn 结构，query 看 tool_call 内容，correctness 看最后 content
2. **检查清单法**: 每个 reward 写一句话，有交集就拆
3. **Ablation 验证**: 关掉一个 reward，看行为是否不同。无明显变化 = 不独立

### 常见坑

| 坑 | 症状 | 解决 |
|----|------|------|
| Reward Hacking | loss 降但表现不变 | 更全面的 reward |
| Reward Sparsity | 信号太稀，学习停滞 | 加中间信号 |
| GRPO Collapse | 组内 std=0，advantage 全 0 | 增大 temperature/G |
| Conflicting Rewards | 信号矛盾，模型震荡 | 确保正交 |

---

## 公式速查表

| 名称 | 公式 | 代码位置 |
|------|------|----------|
| DPO Loss | `-log σ(β × [log(ratio_chosen) - log(ratio_rejected)])` | dpo_trainer.py |
| GRPO Advantage | `(r - mean_group) / (std_group + 1e-4)` | grpo_trainer.py:2171-2173 |
| Clipped Loss | `-min(coef_1×adv, clamp(coef_1,1-ε,1+ε)×adv)` | grpo_trainer.py:2553-2561 |
| KL (k3) | `exp(ref_logp-curr_logp) - (ref_logp-curr_logp) - 1` | grpo_trainer.py:2541-2542 |
| Sigmoid | `σ(x) = 1 / (1 + e^(-x))` | — |
| Log Ratio | `log_ratio = curr_logp - old_logp` | grpo_trainer.py:2524 |

## reference

[(60 封私信 / 80 条消息) 看完能和外婆解释的PPO, DPO, GRPO强化学习 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/1984387073625593089)

https://github.com/huggingface/trl.git

