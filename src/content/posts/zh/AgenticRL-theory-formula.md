---
title: 'Agentic RL 基础理论&代码速递-基于TRL库源码解读'
date: 2026-06-17
tags:
  - LLM
  - Agentic RL
  - TRL
categories: ['note', 'ai', 'transformer']
lang: zh
---

## Part 1: SFT

### 核心代码

```
Label Masking: labels[:prompt_len] = -100
CrossEntropyLoss(ignore_index=-100) → 只对 assistant 部分算 loss
```

**pretraining 教模型通用知识和如何说话，SFT 主要教模型“听话”。** pretraining 阶段模型会对所有 token 逐个计算交叉熵损失（每个位置都学）；但到了 SFT 阶段，就**仅在 特定 回答语料部分**计算这个 loss（prompt 部分用 `labels[:prompt_len] = -100` 屏蔽，`ignore_index=-100` 跳过），为的就是让模型只学“怎么回答”，不去动它已有的通用知识——即在保留预训练能力的前提下，补充指令跟随的能力。

### SFT 的局限

- 只会模仿，不会判断：无法区分好回答和坏回答
- 分布外崩溃：没见过的问题格式导致质量断崖

---

## Part 2: RLHF 架构

### 四种模型

| 模型 | 作用 |
|------|------|
| Actor (Policy) | 被训练的模型 |
| Reference | 冻结的 SFT 模型，通常利用 |
| Critic (Value) | 估计状态价值，算 GAE advantage |
| Reward Model | 打分（~300M，比 Actor 小） |

### Reward Model Loss

```
loss_RM = -log σ(r_chosen - r_rejected)
```

RM 输出: (batch_size, 1)，一个 scalar 分数。TRL 实现: 一次 forward pass，chosen 和 rejected 拼成 batch，`torch.chunk` 拆分。

### RLHF vs PPO vs DPO vs GRPO

RLHF 是方法论，PPO/DPO/GRPO 是实现方式。RLHF 不绑定具体算法。

---

## Part 3: DPO

**核心思想**：DPO 把 RLHF 的两步（先训 Reward Model，再用 RL 优化策略）压成一步——直接用偏好数据训练策略，不需要单独的 RM。理论依据是最优策略 π* 与参考策略 π_ref 之间存在闭式解，于是 reward 可写成 log 概率比 r(x,y) = β·log(π_θ(y)/π_ref(y))，代回偏好排序目标后整个优化退化成一个二分类损失。一句话：**用偏好数据直接对齐，跳过显式的 reward 建模**。

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

## Part 4: GRPO&PPO

GRPO 和 PPO 共用同一个 **Clipped Surrogate Objective**（截断式代理损失）：

```
L^CLIP = E[ min( r(θ)·A,  clip(r(θ), 1-ε, 1+ε)·A ) ]
```

其中 `r(θ) = π_new / π_old` 是新旧策略的概率比，`A` 是 advantage，`clip` 把 r 限制在 `[1-ε, 1+ε]`（如 [0.8, 1.2]）防止单步更新过大。

**两者的区别只在 advantage 的来源**：
- **PPO**：用 Critic（Value 网络）估状态价值 V(s)，`A = R − V(s)`，需**额外训练一个和 Actor 同等大小的 Critic**。
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

其中 `β × per_token_kl` 是 KL 惩罚项，把当前策略拉回参考策略附近、防止跑偏。`per_token_kl` 用下文 **k3 estimator** 计算（KL 的无偏估计），逐 token 算、最后取 mask 内均值。

#### k3 estimator——KL 的无偏估计

先铺垫两个概念：

- **无偏估计**：估计量在大量重复采样下的**期望**等于真实值。不要求单个样本等于真实值——单次可以偏高或偏低，只要期望对得上就算无偏。
- **KL 散度**：衡量两个分布的差异，`KL(P||Q) = Σ P(x)·log(P(x)/Q(x))`。这里 `KL(π_current || π_ref)` 衡量当前策略偏离参考策略的程度，越大越“跑偏”。

问题在于：按定义算 KL 要对**整个词汇表**求和，开销巨大。k3 的思路是用一个可由已采样 token 计算的表达式，使其期望恰好等于真实 KL（无偏），从而用 Monte Carlo 样本近似，不必遍历词表。

#### 为什么 k3 是 KL 的无偏估计

对于某个 token `y`（给定前文 context，两个模型分别认为下一个 token 恰好是 y 的概率）：

- `logp_current = log π_current(y)` — 当前策略下 y 的对数概率
- `logp_ref = log π_ref(y)` — 参考策略下 y 的对数概率
- `x = ref_logp - current_logp = log(π_ref(y) / π_current(y))`

KL 散度定义：`KL(π_current || π_ref) = E_{y ~ π_current}[log(π_current(y) / π_ref(y))]`

其中 `E_{y ~ π_current}[·]` 读作”y 服从分布 π_current 时的期望”，即 `Σ π_current(y) × [·]`。

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

**”无偏”的含义**：类比：硬币正面记 1.1、反面记 -0.1，单次读数永远不是 0.5，但期望 = 0.5，所以无偏估计为0.5。

**实际计算**：训练时对 completion 中每个 token 位置分别算 `per_token_kl`，最后 `mean()`。代码中是一行向量化操作。y 是已生成的具体 token——用已发生的样本近似期望（Monte Carlo 估计），不对整个词汇表求和。

```python
x = ref_logp - current_logp
per_token_kl = exp(x) - x - 1       # KL(π_current || π_ref) 的无偏估计
```

- x≈0（没偏离）→ exp(0)-0-1 = 0
- x>0（π_ref(y) > π_current(y)，偏离了）→ 整项 > 0，单样本给出正的 KL 贡献

---

### Part 5: GRPO Advantage 计算

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

## Part 6: Agent GRPO 完整流程

```
① 生成      prompt → model.generate() → completion (含 tool_calls)
② 工具循环  _tool_call_loop: 检测 tool_calls → 执行 tool → 插入结果 → 继续生成 → final completion
③ 打分      _calculate_rewards() → 多个 reward func → 组内标准化 → advantages
④ 算 loss   _compute_loss: log_ratio → coef_1/coef_2 → per_token_loss → loss
⑤ 更新      loss.backward() → optimizer.step()
```

### tool_mask

标记哪些 token 是模型生成的(mask==1)，哪些是 tool 返回的(mask==0)。tool 返回的 token 不参与 loss。

### 普通 GRPO vs Agent GRPO

```
普通:  prompt → generate → completion → reward
Agent: prompt → generate → tool_call → execute → result → generate → answer → reward
```

唯一区别是多了一层 `_tool_call_loop`。

---

## Part 7: Reward 设计

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
| RM Loss | `-log σ(r_chosen - r_rejected)` | reward_trainer.py |
| DPO Loss | `-log σ(β × [log(ratio_chosen) - log(ratio_rejected)])` | dpo_trainer.py |
| GRPO Advantage | `(r - mean_group) / (std_group + 1e-4)` | grpo_trainer.py:2171-2173 |
| Clipped Loss | `-min(coef_1×adv, clamp(coef_1,1-ε,1+ε)×adv)` | grpo_trainer.py:2553-2561 |
| KL (k3) | `exp(ref_logp-curr_logp) - (ref_logp-curr_logp) - 1` | grpo_trainer.py:2541-2542 |
| Sigmoid | `σ(x) = 1 / (1 + e^(-x))` | — |
| Log Ratio | `log_ratio = curr_logp - old_logp` | grpo_trainer.py:2524 |

> **log_ratio 的 curr 和 old**：`old_logp` = 策略更新前（生成数据时）θ_N 的 log 概率，`curr_logp` = 策略更新后（算 loss 时）θ_{N+1} 的 log 概率。二者是同一 token 序列在同一个模型的两个不同版本下的 log 概率。差值 `log(π_new / π_old)` 是 importance sampling 的校正权重——旧策略采的样本，用新旧概率比来修正梯度方向。同一 token 在旧策略下概率低但新策略下概率高 → ratio > 1 → 梯度放大（新策略”有意”在学）；反之 ratio < 1 → 梯度缩小。

## reference

[(60 封私信 / 80 条消息) 看完能和外婆解释的PPO, DPO, GRPO强化学习 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/1984387073625593089)

https://github.com/huggingface/trl.git

