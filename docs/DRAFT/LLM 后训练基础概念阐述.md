# LLM 后训练“黑话”全解

## 写作动机

我在学习和实践LLM后训练的过程中，发现其中存在许多“黑话”，它们其实是诸多LLM相关的基础概念，但是很容易遇到各种各样不同的说法和口径，有时候不同叫法指的是同一个东西有时候指的却是不同的东西，一开始入门的时候很容易让人觉得晕头转向，因而我便产生了将它们全部梳理一遍的冲动。本文将根据论文和主流框架里相对稳定的共识来解释这些概念，想快速了解的读者可以不必深究公式，只需理解每个公式究竟在“比较谁/优化谁/约束谁”。

## 什么是LLM后训练

大语言模型首先会在海量文本上做**预训练**来吸收必要的知识，其本质是让模型在**自监督**地预测下一个 token 的过程中学会文本中的各种规律并将其压缩进模型参数里——所谓“自监督”，就是正确答案直接来自原文本的下一个 token，不需要人工逐条标注；之后，模型还需要学会贴近人的偏好、遵守某些特定的输出格式或者在特定任务上提高正确率，针对这些能力的训练统称为 **后训练（post-training）**。

“后训练”不是某一种固定算法，也没有全行业唯一的流水线：SFT、DPO、PPO、GRPO 等方法都可能出现在后训练里，一个项目通常会根据场景来选择合适的算法组合。

## 先观全局

**一条经典的训练路线**

```text
原始语料
  ↓ 预训练（预测下一个 token）
基础模型
  ↓ 可选：继续预训练，用领域或目标语言语料继续学习
领域基础模型
  ↓ SFT：用“问题—理想回答”示范教模型如何听从指令进行规范回答
指令模型（Instruct 系列）
  ├─ 固定偏好对（chosen / rejected）────────→ DPO 等离线偏好优化
  └─ 奖励模型或规则 / 验证器 + 新生成的回答 ─→ PPO、GRPO 等在线强化学习
```

OpenAI 的 [InstructGPT 论文](https://arxiv.org/abs/2203.02155) 采用的便是“SFT—偏好排序—奖励模型—强化学习”这条经典路线，不过“继续预训练算不算后训练”目前尚无统一口径：有人按时间顺序把基础预训练后的所有训练都算进去，有人把 continued pretraining 单独列为语料适配。个人更倾向于后一种口径，因为“继续预训练”和 SFT、DPO 这类训练在数据形式和优化目的上都有明显区别，因而本文也把它单独看待。

## LLM 的输入处理

### Token、tokenizer 与词表

#### 模型读到的不是“字”和“词”，而是 token ID

人输入的是字符串，模型实际接收的却是一串整数，也就是 token ID，中间负责转换的工具叫 **tokenizer（分词器）**：

```text
字符串 → token 序列 → token ID 序列 → 向量序列 → Transformer
```

一个 token 可能是一个汉字、一个词或标点，也可能是专门表示“用户消息开始”的控制符（如<message>)，其具体切法完全取决于 tokenizer，不能机械地认为“一个 token 等于一个字”。

**词表（vocabulary）** 就是 token 与 token ID 的对照表，此外，LLM 还有一张 embedding 矩阵，把每个 ID 变成向量。模型输出时，最后一层通常也要给词表中的每个 token 打分，因此 tokenizer、词表、输入 embedding 和输出头必须彼此对得上号。

### Chat template 与特殊 token

不同 LLM 通常都会有自己的输入模板，例如：

```text
<角色开始>system
你是一个助手。<角色结束>
<角色开始>user
解释什么是 KL。<角色结束>
<角色开始>assistant
```

不同模型使用的控制 token 和换行方式可能完全不同。如果训练时使用一种模板，推理时换成另一种，模型看到的输入分布就变了，效果可能明显下降：因为模型在训练中已经学会用它们判断一段消息由谁发出、在哪里结束、接下来该轮到谁说话。

## LLM 的输出解码（重要）

LLM吐出下一个 token 可以简单概括为这样一个过程：首先，对于当前要预测的这个位置为词表中每个 token 给出一个原始打分，叫做 **logit**；然后把这个分数转换成概率，最终再根据概率进行解码（选择 token）输出。

先来一张简单总结：

| 名称        | 例子                | 用途                                     |
| ----------- | ------------------- | ---------------------------------------- |
| logit       | `2.7`               | LLM decode阶段，softmax 前的未归一化分数 |
| probability | `0.42`              | softmax 后的概率，可相加、总和为 1       |
| log-prob    | `log(0.42) ≈ -0.87` | 概率对数，用加减代替乘除，KL 常用        |

### Logits

**logit** 反映的是当前预测位置与词表中每个候选 token 的**匹配程度**，其本质是LLM用隐藏向量 $h_t$ 与每个 token 对应的输出权重 $w_i$ 做**点积（内积）**：
$$
z_i=h_t^\top w_i+b_i
$$

其中 $z_i$ 是第 $i$ 个 token 的 logit，这个数值量化了“当前上下文语义”与“词表中每一个词”在几何语义空间中的**接近程度**。

#### Temperature

我们经常说的LLM“温度” $T$ 本质是作用在 logits 上的一个参数：

$$
p_i(T)=\frac{\exp(z_i/T)}{\sum_j\exp(z_j/T)},\qquad T>0
$$

- $T=1$：不改变原始 softmax；
- $0<T<1$：分布更尖，头部 token 更容易被选中；
- $T>1$：分布更平，低概率 token 更有机会被选中。

数学上不能直接把 $T=0$ 代进公式，所以很多推理接口约定把 `temperature=0` 解释为“不采样，走贪婪解码”。

关于温度的更多详细解读可以参考之前的一篇博客：[Temperature 的数学本质 | Harry Yu](https://alidadei.github.io/zh/blog/temperature-math/)

### probability

softmax 会把 logits 变成概率：
$$
p_i = \frac{\exp(z_i)}{\sum_j \exp(z_j)}
$$

其中$p_i$ 是当前这一步该 token 被输出的概率，所有 $p_i$ 相加等于 1。

如果已经有输入 $x$，模型生成回答 $y=(y_1,\ldots,y_T)$，其中每个 $y_i$ 都是一个 token，那么整段回答的概率可以写成（注意这是天然的条件概率）：

$$
p_\theta(y\mid x)
=\prod_{t=1}^{T}p_\theta(y_t\mid x,y_{<t})
$$

意思很简单：模型生成整段回答的概率 = 第一个 token 的概率，乘上“已有第一个 token 时第二个 token 的概率”……一直乘到最后一个 token 的条件概率。

### Logprob：对数概率

`logprob` 就是 $\log p$。因为概率 $p$ 在 0 到 1 之间，所以 logprob 不大于 0，因此 `logp = -0.1` 比 `logp = -5` 代表更高的概率；同时，整段回答的 logprob 是各 token logprob 之和：
$$
\log p_\theta(y\mid x)
=\sum_{t=1}^{T}\log p_\theta(y_t\mid x,y_{<t})
$$

这样**既把乘法变成了加法，也避免很多极小概率相乘造成的数值下溢**。PPO 的新旧策略概率比、DPO 的 chosen/rejected 比较、KL 的采样估计都会用到 logprob。

还要注意：token 越多，logprob 相加的项就越多，整段总 logprob 往往也越负。不同长度的回答进行比较时，是否做长度归一化会改变指标含义，不能把未经说明的“sequence score”直接当作公平质量分。

### Entropy

即大模型输出的信息熵/分布熵，完全符合信息论中熵的性质。

对于已经生成到第 $t$ 个位置的前缀 $s_t=(x,y_{<t})$，模型下一个 token 的分布熵为：

$$
H_t
=H\bigl(\pi_\theta(\cdot\mid s_t)\bigr)
=-\sum_{v\in\mathcal V}
\pi_\theta(v\mid s_t)\log\pi_\theta(v\mid s_t)
$$

其中 $\mathcal V$ 是整个词表，$\pi_\theta(v\mid s_t)$ 是词表中 token $v$ 在当前位置的概率，其实就是把“每个 token 的概率 × 它携带的不确定性”加起来。

**一条 LLM 已经输出的回答对应的 $-\log p_\theta(y\mid x)$，准确来说叫 surprisal（自信息，也常译为惊奇度），不是 entropy 本身。** Surprisal 描述的是“这个**已经发生的结果**有多出乎意料”，严格的entropy 则是**所有可能结果的** surprisal 按照各自概率取平均。[Stanford EE376A 信息论讲义](https://web.stanford.edu/class/ee376a/files/lecture_notes.pdf)把完整回答分布的 entropy 写成：
$$
H(Y\mid x)
=\mathbb E_{Y\sim p_\theta(\cdot\mid x)}
\left[-\log p_\theta(Y\mid x)\right]
$$

所以，如果回答 $y$ 确实是从模型分布中采样出来的，$-\log p_\theta(y\mid x)$ 可以作为估计完整回答分布 entropy 的一个蒙特卡洛样本；但是对于这一条已经输出的回答，这个数本身仍然叫 surprisal。直接把它叫做“这条回答的 entropy”并不准确。

工程日志里的 `entropy` 还要看具体实现，不能只看指标名猜。当前 [TRL GRPOTrainer](https://huggingface.co/docs/trl/main/en/grpo_trainer) 记录的是“生成回答中各 token 预测分布的平均 entropy”：沿着回答，在每个生成位置计算一次整个词表概率分布的 entropy，再对有效 token 求平均。若只看一条token数量为 $T$ 的回答，可以写成：

$$
\bar H_{\mathrm{token}}(y\mid x)
=\frac{1}{T}\sum_{t=1}^{T}
H\bigl(\pi_\theta(\cdot\mid x,y_{<t})\bigr)
$$

根据信息论：对于离散概率分布，熵在均匀分布时最大。因此，当词表中所有 token 的概率完全相同时，单个位置的理论最大熵为 $\log N$，其中 $N=|\mathcal V|$ 是词表大小；当某个 token 的概率为 1 时，理论最小熵为 0。机器学习公式通常使用自然对数，此时单位是 nat。

- 熵高：概率分散，模型在多个 token 之间犹豫；
- 熵低：概率集中，少数 token 占据大部分概率。

为了在训练中鼓励探索，有些方法会在需要最小化的 policy loss 里减去 entropy bonus：

$$
\mathcal L_{\mathrm{total}}
=\mathcal L_{\mathrm{policy}}-\alpha\bar H,
\qquad \alpha>0
$$

因为优化器要把 loss 降低，所以这个负号会鼓励模型维持更高的熵，避免策略过早塌缩成近乎固定的回答；反过来，$\alpha$ 太大也会让输出过于随机。熵正则的作用可参考 [Ahmed 等人的研究](https://proceedings.mlr.press/v97/ahmed19a.html)。

### KL divergence

KL 散度衡量的是两个概率分布的差异有多大，在这里，“散度divergence”主要指的是信息上的背离/偏离程度，它和物理学中向量场的散度完全不是一个意思（所以我认为这个中文翻译并不好，不如叫”偏离度“呢）。KL divergence的数学公式为：

$$
D_{\mathrm{KL}}(P\|Q)
=\sum_x P(x)\log\frac{P(x)}{Q(x)}
$$

其中 $P(x)$是目标分布， $Q(x)$是待学习的概率分布（策略），KL 是按照目标分布 $P$ 来进行概率加权平均的，所以参数顺序一换，关注的区域也会跟着变化；$x$ 可以是一个 token，也可以是一整条回答。

KLdivergence有三个重要性质：

1.  $D_{\mathrm{KL}}(P\|Q)\ge 0$；
2. 两个分布相同时为 0；
3. 它不对称，通常 $D_{\mathrm{KL}}(P\|Q)\ne D_{\mathrm{KL}}(Q\|P)$。

#### Forward KL 与 reverse KL

“正向”和“反向”的叫法依赖谁被当成目标分布。

如果约定 $P$ 是目标或 reference、$Q$ 是待学习策略，那么常见称呼是：

- forward KL：$D_{\mathrm{KL}}(P\|Q)$；

- reverse KL：$D_{\mathrm{KL}}(Q\|P)$。

先说清楚这里的“峰”是什么。我们把同一个 prompt 的可能回答按某种特征排在横轴上，例如从“简洁”排到“详细”；纵轴是这类回答出现的概率。哪一小片区域的概率明显更高，哪一片就像一座山峰，也叫一个 **mode（模式）**。所以这里的一座峰不是指“一条回答里有个峰”，而是指“一群相似回答形成了一块高概率区域”。

下面直接用数字看差别。假设目标分布 $P$ 认为“简洁正确”和“详细正确”都很好，却很少接受夹在中间、写得别扭的回答：

| 分布 | 简洁正确 A | 别扭混合 | 详细正确 B |
| --- | ---: | ---: | ---: |
| 目标分布 $P$ | 0.495 | 0.01 | 0.495 |
| 候选 $Q_{\text{铺开}}$ | 0.25 | 0.50 | 0.25 |
| 候选 $Q_{\text{只押 A}}$ | 0.98 | 0.01 | 0.01 |

这里故意把待学习分布 $Q$ 限制为只能从这两个候选中选一个。这个限制才是之前那句“表达能力有限”真正想说的事：**不是 $Q$ 想长什么样就能长什么样，而是模型结构、参数或优化结果只允许它在几个不完美的近似里选。** 如果允许 $Q$ 直接等于 $P$，那么两个方向的 KL 都会选 $Q=P$，此时 KL 都是 0，根本不会出现下面的区别。

把表中的数字代入公式，使用自然对数，可以得到：

| 衡量方式 | $Q_{\text{铺开}}$ | $Q_{\text{只押 A}}$ | 更偏向哪个候选 |
| --- | ---: | ---: | --- |
| forward KL：$D_{\mathrm{KL}}(P\|Q)$ | 0.64 | 1.59 | 铺开 |
| reverse KL：$D_{\mathrm{KL}}(Q\|P)$ | 1.61 | 0.63 | 只押 A |

- **Mode-covering（覆盖模式）**：forward KL 按 $P$ 加权。目标分布明明给 B 近一半概率，$Q_{\text{只押 A}}$ 却只给 B 0.01，漏掉 B 的代价很大，所以它宁可选择把概率铺开的候选。
- **Mode-seeking（寻找模式）**：reverse KL 按 $Q$ 加权。$Q_{\text{铺开}}$ 把一半概率压在“别扭混合”上，但目标分布只给这里 0.01，代价很大；只押 A 反而更便宜。只押 B 也可能得到类似结果，并不是 reverse KL 天生偏爱 A。

所以，“forward KL 覆盖多个模式、reverse KL 寻找一个模式”说的是**受到限制、只能近似目标分布时的常见倾向**，不是任何情况下都必然发生的定律。相关分析可见 [Ghasemipour 等人的论文](https://proceedings.mlr.press/v100/ghasemipour20a.html)。

#### 后训练里常见的是哪一个 KL

经典 KL 约束强化学习目标常写成：

$$
\max_\pi\quad
\mathbb E_{y\sim\pi(\cdot\mid x)}[r(x,y)]
-\beta D_{\mathrm{KL}}
\bigl(\pi(\cdot\mid x)\|\pi_{\mathrm{ref}}(\cdot\mid x)\bigr)
$$

按上面的约定，它相对 reference 属于 reverse KL。$\beta$ 越大，理论目标越不愿意远离 reference；$\beta$ 越小，奖励越可能主导更新。

自回归模型中，序列级对数概率比可以拆成 token 级之和：

$$
\log\frac{\pi_\theta(y\mid x)}{\pi_{\mathrm{ref}}(y\mid x)}
=\sum_t
\left[
\log\pi_\theta(y_t\mid x,y_{<t})
-\log\pi_{\mathrm{ref}}(y_t\mid x,y_{<t})
\right]
$$

单个采样 token 的 `logp_current - logp_ref` 可以是负数；这不违反“KL 非负”，因为 KL 的非负性说的是按第一个分布取期望后的整体量。

### 解码输出——“如何按概率选词”

**解码（decoding）**是一个总称，决定模型最终怎样从词表中选出下一个 token；**采样（sampling）则专指其中带随机抽取的分支**，贪婪解码虽然也在选 token，但通常不叫 sampling。它们的关系可以画成：

```text
模型输出 logits
  ├─ 直接取最大值 ─────────────────────────→ greedy decoding
  └─ temperature 调整（可选）
       ↓ softmax 得到概率
     top-k / top-p 截断候选（可选，可组合）
       ↓ 重新归一化
     按剩余概率随机抽取 ───────────────────→ multinomial sampling
```

所以，**多项式采样是最后“按概率抽一次”的动作；temperature、top-k 和 top-p 是抽之前对概率分布做的加工**。可以把它想成抽奖：multinomial sampling 负责真正伸手抽票，temperature 改变每类票的数量差距，top-k/top-p 则先把一部分小概率票拿出箱子。Hugging Face 的 [Generation 文档](https://huggingface.co/docs/transformers/main_classes/text_generation) 也是用 `do_sample` 决定是否随机采样，再用 temperature、top-k、top-p 操作 logits 或候选分布。

#### 贪婪解码（greedy decoding）

每一步都选当前概率最大的 token：

$$
y_t=\arg\max_i p(i\mid x,y_{<t})
$$

优点是简单、通常可复现、没有采样噪声。缺点是它只做当前一步的局部最优选择，并不保证整段序列的联合概率最高，更不保证内容质量最好。

#### 多项式采样（multinomial sampling）

也叫 categorical sampling 或 ancestral sampling：按照模型给出的概率随机抽一个 token，而不是永远选第一名。例如在同一个上下文中，某三个 token 的概率为 0.6、0.3、0.1；若重复独立抽样很多次，频率会大致接近这个比例。

如果不使用 top-k/top-p 过滤，那么整个词表中每个非零概率 token 理论上都有机会被抽中，包括概率极低的长尾 token；top-k 和 top-p 的主要作用，正是控制这种随机性最终能“放开到什么程度”。

#### Top-k

只保留概率最高的 $k$ 个 token，把其他 token 的概率设为 0，再重新归一化并做多项式采样。它的目的很直接：**砍掉低概率长尾，避免一次随机抽样把模型带到非常离谱的 token 上**。

- $k$ 越小，候选越少，输出通常越集中、稳定，但也更容易模板化或重复；
- $k$ 越大，越接近在完整词表上直接采样，输出更多样，但抽到不合适 token 的机会也会增加；
- 当 $k=1$ 时只剩概率最大的 token，结果就退化成贪婪解码。

它的局限也很明显：候选数量永远固定。模型很确定时，第 1 名可能已经占 95%，保留 50 个候选显得过多；模型很不确定时，前 50 个 token 又可能只覆盖很少的总概率。因此，top-k 能控制随机范围，但不能保证事实正确。

#### Top-p / nucleus sampling

从高到低累加概率，保留累计概率首次达到阈值 $p$ 所需的最小候选集合，再重新归一化并做多项式采样。它的目的也是砍掉长尾，但与 top-k 最大的区别在于：**top-p 固定的是要覆盖的概率质量，而不是候选数量**。

- $p$ 较小，候选集合更窄，输出通常更保守、更稳定；
- $p$ 越接近 1，保留的长尾越多，输出通常更多样、也更不可预测；
- $p=1$ 时不做 top-p 截断。

例如某一步的概率从高到低为 `[0.55, 0.25, 0.10, 0.06, 0.04]`：

```text
top-k = 3   → 固定保留前三个：[0.55, 0.25, 0.10]
top-p = 0.8 → 前两个累计刚好达到 0.80，只保留：[0.55, 0.25]
```

换一个上下文后，top-k 仍然保留 3 个，top-p 保留的数量却可能变成 1 个、5 个甚至更多。因此，top-p 会随着模型当前有多确定而自动收缩或放宽候选集合。[Nucleus Sampling 论文](https://arxiv.org/abs/1904.09751) 正是针对开放式文本中低概率长尾与最大概率解码退化的问题提出这种动态概率核；[Nadeem 等人的系统研究](https://aclanthology.org/2020.aacl-main.36/) 则把 top-k、top-p 和 temperature 都视为在开放式生成中调节质量—多样性权衡的采样方法。

temperature、top-k 和 top-p 可以一起使用：在常见的采样管线中，temperature 会先改变概率差距，进而影响哪些 token 能进入 top-p 集合；top-k 和 top-p 同时开启时，最终候选通常是经过两道筛选后剩下的部分。

#### 输出停止条件

LLM 的输出通常在以下任一条件满足时结束：

- 生成 EOS；
- 命中指定 stop sequence；
- 达到 `max_new_tokens`；
- 外部控制器决定停止，例如工具调用协议完成。

解码参数改变的是“怎样从当前模型给出的打分概率中选择或采样 token”。

## 常见概念

下面开始辨析诸多容易让人混淆的各种概念和说法。

### prompt、completion 与 response

这些词看起来简单，却最容易在 batch 统计里产生误会：

- **prompt**：交给模型的输入，可以是问题，也可以包含 system 指令、历史对话、工具结果等。
- **completion**：模型接在 prompt 后面生成的 token 序列，也有可能叫**generation**。
- **response**：在聊天任务里通常指助手回答，常与 completion 混用；但有的系统会从 completion 中去掉控制 token 后才叫 response。
- **sample / example**：一个训练样本。它究竟指“一条 prompt”“一条 prompt-completion”还是“一个 token”，必须看代码或文档，不能只凭变量名猜。

在 GRPO 中，模型面对一条 prompt （问题）往往会生成 $G$ 条 completions（回答），因此“8 条 prompt”和“64 条 completion”完全可能是同一个 rollout batch 的两种统计口径。

### Rollout 与 trajectory

在标准强化学习资料里，**trajectory、episode 和 rollout 经常被当作近义词**，都可指一串状态、动作和奖励。[Spinning Up 的基本概念](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) 就明确把这些词放在一起解释。

为了在 LLM 工程中说得更清楚，可以采用下面这套实用约定：

- **rollout** 更强调“让某个策略实际跑一次并采样”的过程，也常指这次生成本身；对应到大模型来说，就是“补充”的过程。
- **trajectory** 更强调记录下来的完整轨迹，例如状态、token、logprob、奖励、工具调用和环境返回值。

一条普通问答的轨迹可以写成：

$$
\tau=(s_0,a_0,s_1,a_1,\ldots,s_T)
$$

把这些符号换成 LLM 的说法，最常见的单轮生成过程就是：

```text
prompt（初始状态 s₀）
  ── LLM 输出第 1 个 token（动作 a₀）──>
prompt + 第 1 个 token（状态 s₁）
  ── LLM 输出第 2 个 token（动作 a₁）──>
prompt + 已经输出的 token 序列（后续状态）
  ── ……直到输出 stop token ──>
完整生成过程 + reward = 一条 trajectory
```

也就是说，LLM 每输出一个 token，就执行了一次 action；这个 token 被接到原有上下文后，又形成下一步的 state。当模型输出 stop token 后，这次生成结束，也就得到了一条完整 trajectory。若生成因最大长度或外部控制器而提前停止，则以实际停止的位置作为轨迹终点。

如果只在最终答案处打一个分，轨迹中间可能没有显式奖励。Agent 任务的轨迹还可能包含“调用搜索工具—收到结果—继续思考—提交答案”等多轮动作。

### Batch、minibatch、microbatch 与 train_batch

`train_batch` 不是一个跨框架统一的标准术语。看到它时，至少要追问两个问题：

1. 单位是 prompt、completion、trajectory，还是 token？
2. 它指一次前向计算、一次反向累计、一次 optimizer step，还是一整批 rollout？

常见概念如下：

- **microbatch**：单张设备一次前向/反向真正装下的那小批数据；
- **per-device batch**：每张数据并行设备一次训练迭代处理的样本数；
- **gradient accumulation steps**：累积多少个 micro step 后才更新一次参数；
- **global / effective batch**：一次 optimizer update 汇总的全部数据；
- **minibatch**：从较大的 rollout batch 中切出用于若干次优化的小批数据；
- **rollout / generation batch**：一次集中生成并打分的数据；
- **epoch**：把指定数据完整重复训练一遍。PPO 中也常指同一 rollout batch 被切成 minibatch 重用若干轮。

在纯数据并行、没有额外样本复制的简单设置下，若 $B_{\mathrm{device}}$ 明确指“每张设备每个 micro step 的样本数”，那么：

$$
B_{\mathrm{update}}
=B_{\mathrm{device}}
\times N_{\mathrm{data\ parallel}}
\times N_{\mathrm{grad\ accumulation}}
$$

例如每张卡每次处理 4 条 completion，2 个数据并行副本，累积 8 次梯度，那么一次 optimizer update 汇总 $4\times2\times8=64$ 条 completion。

如果 GRPO 每个 prompt 生成 $G=8$ 条 completion，且这 64 条 completion 正好按完整组组织，那么它们只对应 8 条 prompt：

$$
B_{\mathrm{prompt}}=\frac{B_{\mathrm{completion}}}{G}=8
$$

但不同框架可能在 sampler 中先把 prompt 按 $G$ 重复，也可能先取一批互不相同的 prompt，再在生成阶段各扩成 $G$ 条 completion。因此，只看到 `per_device_train_batch_size`，不能断定它代表多少条独立 prompt。TRL 的 [GRPO 配置说明](https://huggingface.co/docs/trl/grpo_trainer) 会额外规定 effective batch 与 `num_generations` 的整除关系，并单独定义 generation batch；NVIDIA Megatron 的 [并行与 global batch 说明](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html) 又采用通用分布式训练口径。公式里的单位必须写出来。

#### Step 也有多种含义

- **generation step**：自回归生成一个 token；
- **micro step**：处理一个 microbatch 并累计一次梯度；
- **optimizer step / update step**：真正调用优化器更新一次参数；
- **environment step**：智能体在环境里执行一次动作。

报告实验时只写“训练了 1000 steps”信息不够。至少还应说明是哪一种 step、有效 batch 的单位、序列长度、生成条数和数据是否复用。

### Policy

写作 $\pi_\theta$，在传统强化学习中指的是 **策略**，表示“在当前状态下，给出的下一步动作的概率分布”。

在 LLM 的强化学习中，可以这样去对应：

- **Policy $\pi_\theta$**：我们正在训练的 LLM 本身。更严格地说，是这个 LLM 在各种上下文下给出的下一 token 概率分布；
- **初始状态 $s_0$**：输入给 LLM 的 prompt；
- **状态 $s_t$**：prompt 加上截至当前已经生成的 token 序列；
- **动作 $a_t$**：LLM 这一步输出的 token，动作空间就是整个词表；
- **Reward**：每次行动后，奖励模型或程序规则对结果给出的分数。

因此，模型每次输出的 token 是 action，**Policy 是模型决定“在当前上下文里，下一个 token 概率”的策略**。写成 $\pi_\theta(a_t\mid s_t)$ 时，表示模型在状态 $s_t$ 下输出具体 token $a_t$ 的概率。这套对应关系也可参考[这篇关于 LLM 强化学习的说明](https://zhuanlan.zhihu.com/p/1990178700575130664)。

#### 当前策略、旧策略与参考策略

先别把“策略”想成一种脱离 LLM 的神秘东西。假设我们拿 `Qwen2.5-7B-Instruct` 的一份 SFT checkpoint 做 PPO：

```text
Qwen2.5-7B-Instruct（SFT 起点）
  ├─ 冻结一份 ─────────────────────────→ reference model
  └─ 复制一份并继续训练 ───────────────→ current policy / actor
       └─ 每次生成一批回答时的时刻切片
            ├─ 真正生成这批回答的模型 ─→ behavior policy
            └─ 固定当时的权重或 logprob → old policy
```

优化器随后继续修改 current policy；但是在用这一批回答训练的几轮里，old policy 对应的权重或 logprob 保持不变，否则新旧概率比就失去了比较基准。

这四个词不能混用：

- **当前策略（current policy）**：就是此刻正在被优化器更新的那个模型，记作 $\pi_\theta$。current policy具有很强的时效性：只要一次反向传播让模型的参数一更新，current policy就变了，它在相同上下文里给出的下一 token 概率也会变化。
- **行为策略（behavior policy）**：就是实际生成这批训练回答的那份模型。在上面的 on-policy 例子里，它是 current policy 在生成时刻的版本；如果回答来自另一个模型或更早的 checkpoint（off-policy），行为策略就是那个模型了。
- **旧策略（old policy）**：就是 current policy 在这批回答生成时的“定格画面”，记作 $\pi_{\mathrm{old}}$。实现可以保留一份模型快照，也可以只保存生成 token 当时的 logprob，用来计算新旧概率比；对这一批 rollout 来说，它通常和行为策略是同一个版本。数据复用与概率比的详细关系见之前的博客：[LLM RL 中数据复用引发的 off-policy 问题与解决方法 | Harry Yu](https://alidadei.github.io/zh/blog/off_policy_and_importance_ratio/)。
- **参考策略（reference policy）**：就是从训练起点冻结下来的那份 Qwen 模型，通常是 SFT checkpoint，记作 $\pi_{\mathrm{ref}}$。它不负责生成本批训练数据，而是通过KL divergence来约束 current policy“不要离起点太远”。

旧策略会随着 rollout 批次更新；参考策略往往长期不变，这俩一个负责回答“这批数据是谁生成的”，另一个负责约束“模型不要离初始行为多远”。

#### old-policy ratio、importance ratio 与 KL divergence

**old-policy ratio 不是 importance ratio 之外的另一个东西，它就是 importance ratio 的一种具体情况。**

重要性采样（importance sampling）的一般概率比写作：

$$
w_t=\frac{\pi_{\mathrm{target}}(a_t\mid s_t)}{\mu(a_t\mid s_t)}
$$

$\mu$ 是真正生成这份数据的 behavior policy，$\pi_{\mathrm{target}}$ 是我们想估计或训练的目标策略。数据明明由 $\mu$ 采出来，却想知道换成目标策略后会怎样，就用这个概率比重新加权。

PPO 的数据通常由 old policy 生成，因此此时 $\mu=\pi_{\mathrm{old}}$，公式就变成了：

$$
r_t(\theta)=\frac{\pi_\theta(a_t\mid s_t)}{\pi_{\mathrm{old}}(a_t\mid s_t)}
$$

这就是大家口中的 **old-policy ratio**。它大于 1，说明 current policy 现在比 old policy 更容易选中这个 action；小于 1，则说明现在更不容易选中。在 LLM 里，$a_t$ 通常就是第 $t$ 个输出 token，$s_t$ 就是 prompt 加上前面已经输出的 token。

所以两者的关系很直接：

- 数据由 old policy 生成时，old-policy ratio 就是这次 PPO 更新使用的 importance ratio；
- 如果数据其实由另一个 behavior policy 生成，分母就应该是那个真正采样的策略 $\mu$，再写 $\pi_{\mathrm{old}}$ 就不一定是正确的校正；
- 单个 token 的 ratio 是两个 token 概率相除；整条回答的 ratio 则是所有 token ratio 的连乘，等价于先把 log-ratio 相加再取指数。

它和 KL divergence 也不是一回事：importance ratio 针对**这一个实际采到的 action**做概率校正，而 KL 是对一整个概率分布的平均偏离程度做衡量。PPO 会裁剪 $\pi_\theta/\pi_{\mathrm{old}}$，让过大的 ratio 不再继续放大这一项训练目标，从而抑制单次更新过猛；这是一种软约束，不保证更新后的 KL 一定小于某个数。LLM 后训练还常计算 $\pi_\theta$ 对 $\pi_{\mathrm{ref}}$ 的 KL，限制模型长期偏离训练起点。相关定义可对照 [PPO 原论文](https://arxiv.org/abs/1707.06347) 与 [OpenAI Spinning Up 的 PPO 说明](https://spinningup.openai.com/en/latest/algorithms/ppo.html)。

### On-policy、off-policy、online 与 offline

#### On-policy

还是以上面的 Qwen 为例：让正在训练的 Qwen 自己新生成一批回答，再用这些回答的 reward 更新它自己，就是 on-policy 的典型做法。模型一旦连续更新，旧回答就越来越不像“当前这份 Qwen”会生成的数据，因此通常不能无限重复利用。

#### Off-policy

如果当前训练的是 Qwen，却拿更早的 Qwen checkpoint、其他 LLM 或历史数据集生成的回答来更新它，就是 off-policy 数据。要让这种更新仍然合理，算法可能使用重要性采样、价值学习或其他校正机制。

#### Online 与 offline

- **online** 强调训练期间还在不断与环境交互、生成新数据；
- **offline** 强调训练只使用事先固定的数据集，不再向环境采新样本。

它们与 on/off-policy 有关系，但不是严格同义词。`online` 说的是“数据是否边练边采”，`on-policy` 说的是“训练数据的概率分布是否来自current policy”。例如 PPO 常先用旧策略快照生成一批新回答，再把这批回答切成 minibatch 训练几个 epoch（更新模型）；在这几个 epoch 中，当前策略已经发生变化（模型被更新了），所以工程上常说它是近似 on-policy。

[OpenAI Spinning Up 的算法分类](https://spinningup.openai.com/en/latest/spinningup/rl_intro2.html) 将 PPO 列为 on-policy 方法，并强调这类方法不能随意使用旧策略数据。

### Reward、return、value 与 advantage

这四个量处在同一条链上，但含义不同。

继续用上面的 Qwen PPO 训练举例。假设 prompt 是一道数学题，current policy 生成完整答案后，判题程序给了 1 分；任务只在结尾打分，$\gamma=1$。为了先讲清四个量，下面直接用最简单的“advantage ≈ return - value”：

```text
current policy（正在训练的 Qwen）生成答案
  → verifier 给最终 reward = 1
  → 这条轨迹中每个位置的 return = 1
  → value model 看到某个回答前缀，预测 value = 0.7
  → 这个位置的 advantage 可粗略理解为 1 - 0.7 = +0.3
  → 更新 current policy，提高以后生成这类 token 的概率
```

这只是最简单的终局奖励例子，但四个词分别落在哪个模型、哪个数字上已经能看出来：reward 来自外部评分，return 是累计分，value 来自 critic 的预测，advantage 则拿实际结果和预测基线作比较。

#### Reward：这一步或这次结果得了多少分

奖励 $r_t$ 可以来自：

- 人工规则，例如格式正确加分；
- 可验证程序，例如单元测试通过率、数学答案是否匹配；
- 专门训练出来的奖励模型；
- ……

按照 reward 的主要产生方式，LLM 强化学习又经常分成两类：

- **RLHF（Reinforcement Learning from Human Feedback）**：先收集人类对回答的偏好，再**专门训练一个 reward model 模仿这种偏好**，最后用它给新回答打分。它更适合“哪个回答更有帮助、表达更好、更加安全”这类难以写出唯一正确规则的主观标准，但缺点就是需要额外去训练一个reward model。经典 [InstructGPT](https://arxiv.org/abs/2203.02155) 走的就是“人类排序—奖励模型—PPO”这条路线。
- **RLVR（Reinforcement Learning with Verifiable Rewards）**：不靠奖励模型猜人类更喜欢哪个回答，而是用规则或程序直接验证结果。例如数学题可以核对最终答案，代码题可以编译并运行测试用例。这样得到的 reward 更客观，但前提是任务确实存在可靠、可自动验证的判分方法。[DeepSeek-R1](https://arxiv.org/abs/2501.12948) 就使用了数学答案验证、代码测试和格式规则等奖励。

⚠️奖励是优化目标的代理，不等于“真实质量”。奖励函数漏掉的条件，模型就可能卡bug，DeepMind 将这类现象总结为 [specification gaming](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)；在 LLM 语境中也常叫 **reward hacking**。

### Reward model 与偏好概率

奖励模型常把 prompt 和回答映射成一个标量 $r_\phi(x,y)$。经典偏好建模常使用 Bradley–Terry 形式：

$$
P(y_w\succ y_l\mid x)
=\sigma\bigl(r_\phi(x,y_w)-r_\phi(x,y_l)\bigr)
$$

这里的 $x$ 是同一个 prompt，$y_w$ 是人类更喜欢的回答（chosen / winner），$y_l$ 是不太喜欢的回答（rejected / loser）。奖励模型先分别给两个回答打分，再用 chosen 的分数减去 rejected 的分数；$\sigma$ 是 sigmoid 函数，负责把这个分数差压到 0～1 之间，变成“chosen 胜过 rejected 的概率”。

例如，chosen 得 3 分，rejected 得 1 分，分数差就是 2，经过 sigmoid 后约为 0.88；如果两者同分，差是 0，得到的概率就是 0.5，也就是模型认为谁赢都差不多。训练数据已经告诉模型 $y_w$ 应该赢，因此训练会推动这个概率变大，也就是把 chosen 的分数拉到 rejected 上方。

这个公式只在意两个分数的**差**，所以奖励分数本身没有天然的“80 分就是优秀”尺度；换模型或换数据后，绝对值通常不能直接横比。

奖励模型还可能继承标注偏差，并在策略生成超出训练分布的回答时失准。这也是为什么奖励模型需要留出集检查、对抗测试，以及对最终策略进行独立评估。[从人类偏好学习的早期工作](https://arxiv.org/abs/1706.03741) 和 [InstructGPT](https://arxiv.org/abs/2203.02155) 都采用了“偏好比较—学习奖励—再优化策略”的基本思路。

#### Return：从现在到结束一共拿到多少奖励

折扣回报通常写作：

$$
G_t=\sum_{k=t}^{T}\gamma^{k-t}r_k
$$

$\gamma$ 是折扣因子。若任务只在最终答案给一次奖励，而且不做折扣，那么每个位置看到的最终 return 可以是同一个终局分数。

**return 不是 LLM 训练新发明的另一种分数，而是强化学习里“从当前位置开始，把后面的 reward 累计起来”的标准叫法。** [OpenAI Spinning Up 的强化学习介绍](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html)也是这样定义 return 的。

你在 LLM 文章里更常看到 reward、很少看到 return，其实很正常。很多单轮 LLM 任务只在完整回答结束后给一个 reward；如果中间没有其他奖励，而且 $\gamma=1$，那么从任意 token 位置往后累计，得到的 return 都等于最后那个 reward。两个数字刚好一样，文章就常直接说“用最终 reward 训练”，不再单独把 return 拎出来讲。

但两者在概念上仍然不同：reward 是某一步收到的分数，return 是从这一步往后收到的分数之和。只要训练里加入 token 级 KL 惩罚、过程奖励，或者 $\gamma<1$，每个位置的 return 就不再等于最后那个 reward。早期 OpenAI 的 [RLHF PPO 实现](https://github.com/openai/lm-human-preferences/blob/master/lm_human_preferences/train_policy.py)就是先构造 token 级 KL reward，在回答末尾再加上 reward model 的分数，然后用这些 reward 计算 advantage 和 return。

#### Value：从这个状态出发，平均还能拿多少回报

$$
V^\pi(s)=\mathbb E_\pi[G_t\mid s_t=s]
$$

value 是预测的未来回报，可作为基线来降低梯度方差。PPO 常额外训练一个 **critic / value model** 估计它，而GRPO则直接用同一 问题下的一组回答的奖励平均值做估计，不用专门训练一个critic模型。

#### Advantage：这次动作比基线好多少

$$
A^\pi(s,a)=Q^\pi(s,a)-V^\pi(s)
$$

优势为正，表示这次动作比该状态下的平均水平好；为负，表示比平均水平差。策略梯度直接使用的往往是 advantage，而不是原始 reward。

PPO 常用 **GAE（Generalized Advantage Estimation，广义优势估计）**来计算 advantage。它先看每个位置的“一步预测误差”：

$$
\delta_t=r_t+\gamma V(s_{t+1})-V(s_t)
$$

这句话翻译成人话就是：**这一步实际拿到的 reward，加上下一个状态预计还能拿到的回报，和当前状态原本预计能拿到的回报，差了多少。** GAE 再把当前位置和后面位置的这些误差按距离逐渐打折后加起来：

$$
\hat A_t^{\mathrm{GAE}}
=\delta_t+(\gamma\lambda)\delta_{t+1}
+(\gamma\lambda)^2\delta_{t+2}+\cdots
$$

$\lambda$ 决定“往后看多远”：越小越依赖 value model 的短期预测，估计通常更稳但偏差可能更大；越接近 1，越依赖后面真实发生的 reward，偏差更小但波动可能更大。所以 GAE 不是一种新 reward，它只是把 reward 和 value 整理成 advantage 的办法。详细推导可见 [GAE 原论文](https://arxiv.org/abs/1506.02438)。

GRPO 的关键做法则是：不训练 critic，而用同一 prompt 的一组回答分数构造相对基线。

#### Outcome reward 与 process reward

- **Outcome reward**：只评价最终答案，例如“最终数值是否正确”。
- **Process reward**：评价中间步骤，例如给每个推理步骤打分。

过程奖励能提供更细的监督信号，但必须真的能可靠评价中间步骤。OpenAI 在数学任务上的 [过程监督研究](https://arxiv.org/abs/2305.20050) 发现过程监督优于该实验中的结果监督；这不能直接推出“所有开放领域任务都一定如此”。其[项目说明](https://openai.com/index/improving-mathematical-reasoning-with-process-supervision/) 也明确把向其他领域泛化列为尚待验证的问题。

### Credit assignment：功劳和责任算给谁

**信用分配（credit assignment）**要回答的是：最终得了 1 分或 0 分，前面哪些动作应该得到功劳，哪些动作应该承担责任？

如果一篇很长的数学推理只有最终答案奖励，最朴素的做法会把同一个优势信号分给整段回答的所有 token。这样模型知道“这整段总体不错或不好”，却很难仅凭这一个分数定位究竟是哪一步关键。

常见缓解方法包括：

- 给中间步骤设置可靠的 process reward；
- 用 value/critic 估计不同前缀的未来回报；
- 把任务拆成可验证的阶段；
- 收集能形成对照的多条轨迹。

这些方法只是增加信息或降低估计噪声，不会“自动找出真正原因”。**如果奖励本身错了，再精细的信用分配也只会更精确地优化错误目标。**

### Policy gradient

也即策略梯度，其核心式子可以写成：

$$
\nabla_\theta J(\theta)
=\mathbb E\!\left[
\sum_t \nabla_\theta\log\pi_\theta(a_t\mid s_t)\,\hat A_t
\right]
$$

这里的 $\theta$ 就是 current policy，也就是那份正在训练的 Qwen 的参数。这个公式更新的是 policy / actor，不会顺手更新冻结的 reference model 或 reward model；PPO 的 value model 另有自己的 value loss。

大白话解释：

- 如果这次动作的优势 $\hat A_t$ 为正，就提高模型以后在相似状态下生成该 token 的概率；
- 如果优势为负，就降低这个概率；
- 优势绝对值越大，更新信号通常越强。

`log probability` 出现在式子里，是因为序列概率由许多条件概率相乘；取对数后可以把它们变成相加，求导也更方便。策略梯度的基础推导可参考 [Spinning Up 的说明](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html)。

### 一张易混概念对照表

| 容易混淆的词 | 最短区分 |
| --- | --- |
| token / word | token 是 tokenizer 定义的单位，不必等于自然语言里的词 |
| autoregressive / greedy | 前者是按前缀逐步预测；后者是每步取最大概率的一种解码 |
| temperature / entropy bonus | 前者改推理采样；后者进入训练目标并改权重 |
| reward / return | reward 是某一步或终局得分；return 是从当前位置起累计的奖励 |
| reward / advantage | reward 是原始分数；advantage 是相对基线好多少 |
| reward / loss | reward 通常希望越大越好；loss 交给优化器最小化；因此reward写到loss中要取负号 |
| reward model / critic | 前者评价当前的action（模型回答）；后者预测未来回报并提供一个比较基线 |
| old policy / reference policy | 前者对应当前 rollout 的采样快照；后者是长期约束锚点 |
| online / on-policy | 前者说是否边训练边采数据；后者说数据是否来自当前策略 |
| rollout / trajectory | 常被混用；工程上可用“采样过程 / 记录结果”帮助区分 |
| PPO clipping / KL | clipping 约束本次新旧概率比的优化激励；KL 常约束策略对参考模型的整体偏离 |
| prompt batch / completion batch | 一条 prompt 可以生成多条 completion，二者数量未必相等 |

## 怎样阅读一份后训练配置

看到一个 SFT、DPO、PPO 或 GRPO 配置时，按下面顺序问，通常比死记参数名更有效：

1. **模型在优化什么损失？** 把实际公式找出来，不只看算法昵称。
2. **数据从哪里来？** 固定数据集，还是当前/旧策略新生成的 rollout？
3. **一条样本是什么？** prompt、completion、pair、trajectory 还是 token？
4. **奖励从哪里来？** 人类偏好模型、AI judge、程序 verifier，还是几者组合？
5. **优势怎样算？** critic、GAE、组内均值，还是整条回答同一个分数？
6. **约束谁和谁？** current-old 的 ratio，还是 current-reference 的 KL？
7. **一次更新实际看多少数据？** 写清设备数、microbatch、梯度累积、group size 和单位。
8. **同一 rollout 重用了几次？** 数据越旧，当前策略与行为策略（behavior/old policy) 的偏差通常越大。
9. **怎样独立评估？** 不能只看训练 reward；还要看留出任务、格式、长度、旧能力、安全性与人工抽检。

如果一份报告不能回答这些问题，仅凭“用了某某算法”通常不足以复现实验，也不足以判断结果来自哪里。

## 参考资料

### 概率与信息论

- Stanford EE376A：[Information Theory Course Notes](https://web.stanford.edu/class/ee376a/files/lecture_notes.pdf)

### Tokenizer、输入与生成

- Holtzman et al., 2020：[The Curious Case of Neural Text Degeneration](https://arxiv.org/abs/1904.09751)
- Nadeem et al., 2020：[A Systematic Characterization of Sampling Algorithms for Open-ended Language Generation](https://aclanthology.org/2020.aacl-main.36/)
- Hugging Face Transformers：[Chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating)、[Generation](https://huggingface.co/docs/transformers/main_classes/text_generation)

### 偏好、强化学习与奖励

- Christiano et al., 2017：[Deep Reinforcement Learning from Human Preferences](https://arxiv.org/abs/1706.03741)
- Ouyang et al., 2022：[Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155)
- Schulman et al., 2017：[Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347)
- Schulman et al., 2015：[High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438)
- Rafailov et al., 2023：[Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
- Shao et al., 2024：[DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300)
- Lightman et al., 2023：[Let's Verify Step by Step](https://arxiv.org/abs/2305.20050)
- OpenAI, 2023：[Improving mathematical reasoning with process supervision](https://openai.com/index/improving-mathematical-reasoning-with-process-supervision/)
- Touvron et al., 2023：[Llama 2: Open Foundation and Fine-Tuned Chat Models](https://arxiv.org/abs/2307.09288)
- Ahmed et al., 2019：[Understanding the impact of entropy on policy optimization](https://proceedings.mlr.press/v97/ahmed19a.html)
- Ghasemipour et al., 2020：[A Divergence Minimization Perspective on Imitation Learning Methods](https://proceedings.mlr.press/v100/ghasemipour20a.html)
- DeepMind, 2020：[Specification gaming: the flip side of AI ingenuity](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)
- OpenAI Spinning Up：[Key Concepts in RL](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html)、[Kinds of RL Algorithms](https://spinningup.openai.com/en/latest/spinningup/rl_intro2.html)、[Policy Optimization](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html)

### 工程口径

- Hugging Face TRL：[PPO Trainer](https://huggingface.co/docs/trl/main/ppo_trainer)、[GRPO Trainer](https://huggingface.co/docs/trl/main/en/grpo_trainer)、[DPO Trainer](https://huggingface.co/docs/trl/main/dpo_trainer)
- NVIDIA Megatron Core：[Parallelism Strategies Guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)

### 站内延伸阅读

- [Temperature 的数学本质 | Harry Yu](https://alidadei.github.io/zh/blog/temperature-math/)
- [LLM RL 中数据复用引发的 off-policy 问题与解决方法 | Harry Yu](https://alidadei.github.io/zh/blog/off_policy_and_importance_ratio/)
