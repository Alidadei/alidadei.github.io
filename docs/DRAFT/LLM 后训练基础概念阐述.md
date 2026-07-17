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

不同 LLM 通常都会有自己的输入模板，例如下面这个仅用于解释结构的示意模板：

```text
<角色开始>system
你是一个助手。<角色结束>
<角色开始>user
解释什么是 KL。<角色结束>
<角色开始>assistant
```

不同模型使用的控制 token 和换行方式可能完全不同。如果训练时使用一种模板，推理时换成另一种，模型看到的输入分布就变了，效果可能明显下降。这里的特殊 token 并不是可有可无的“装饰”：模型在训练中已经学会用它们判断一段消息由谁发出、在哪里结束、接下来该轮到谁说话。

## LLM 的输出解码（重要）

这一部分模型在吐出下一个 token 的时候存在一个转换过程：首先，为词表中每个 token 给出一个原始打分，叫做 **logit**；然后把这个分数转换成概率，最终再根据概率进行解码（选择 token）输出。

### Logits 与概率

**logit** 反映的是当前预测位置与词表中每个候选 token 的**匹配程度**。典型语言模型会用当前位置的隐藏向量 $h_t$ 与每个 token 对应的输出权重 $w_i$ 做线性计算得：
$$
z_i=h_t^\top w_i+b_i
$$

其中 $z_i$ 是第 $i$ 个 token 的 logit，因而可以把 logit 粗略理解为“候选 token 打分”，但它并不一定是余弦相似度。打分越高，只能说明模型在当前上下文中越偏向这个 token。

接着，softmax 把 logits 变成概率：
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

### Logprob：概率的对数

`logprob` 就是 $\log p$。因为概率 $p$ 在 0 到 1 之间，所以 logprob 不大于 0，因此 `logp = -0.1` 比 `logp = -5` 代表更高的概率；同时，整段回答的 logprob 是各 token logprob 之和：

$$
\log p_\theta(y\mid x)
=\sum_{t=1}^{T}\log p_\theta(y_t\mid x,y_{<t})
$$

这样既把乘法变成了加法，也避免很多极小概率相乘造成的数值下溢。PPO 的新旧策略概率比、DPO 的 chosen/rejected 比较、KL 的采样估计都会用到 logprob。

还要注意：token 越多，logprob 相加的项就越多，整段总 logprob 往往也越负。不同长度的回答进行比较时，是否做长度归一化会改变指标含义，不能把未经说明的“sequence score”直接当作公平质量分。

### Entropy

即大模型输出的信息熵/分布熵，完全符合信息论的定义。

对于已经生成到第 $t$ 个位置的前缀 $s_t=(x,y_{<t})$，模型下一个 token 的分布熵为：

$$
H_t
=H\bigl(\pi_\theta(\cdot\mid s_t)\bigr)
=-\sum_{v\in\mathcal V}
\pi_\theta(v\mid s_t)\log\pi_\theta(v\mid s_t)
$$

其中 $\mathcal V$ 是整个词表，$\pi_\theta(v\mid s_t)$ 是词表中 token $v$ 在当前位置的概率，其实就是把“每个 token 的概率 × 它携带的不确定性”加起来：概率越平均，模型越拿不准，entropy 越高；概率越集中，模型越确定，entropy 越低。

其实**一条已经采样出来的回答对应的 $-\log p_\theta(y\mid x)$ 叫 surprisal（自信息，也常译为惊奇度），并非严格的信息熵**。因为 信息熵 描述的是“还没抽样之前，整个概率分布有多不确定”，而 surprisal 描述的是“已经抽到这个结果后，它有多出乎意料”。工程中常把这个叫做entropy。“我也不确定，需要考证”

工程日志里常说的“一条回答的 entropy”，一般是沿着这条回答，在每个生成位置都计算一次上面的分布熵，然后取平均：

$$
\bar H(y\mid x)
=\frac{1}{T}\sum_{t=1}^{T}
H\bigl(\pi_\theta(\cdot\mid x,y_{<t})\bigr)
$$

这也是当前 [TRL GRPOTrainer](https://huggingface.co/docs/trl/grpo_trainer) 记录 `entropy` 时采用的口径：对生成回答中的 token prediction entropy 求平均。若要写“所有可能回答构成的完整分布熵”，则还要对所有可能的回答取期望：

$$
H(Y\mid x)
=\mathbb E_{Y\sim p_\theta(\cdot\mid x)}
\left[-\log p_\theta(Y\mid x)\right]
$$

根据信息熵的定义，对于离散概率分布，熵在均匀分布时最大。因此，当词表中所有 token 的概率完全相同时，单个位置的理论最大熵为 $\log N$，其中 $N=|\mathcal V|$ 是词表大小；当某个 token 的概率为 1 时，理论最小熵为 0。机器学习公式通常使用自然对数，此时单位是 nat。

- 熵高：概率分散，模型在多个 token 之间犹豫；
- 熵低：概率集中，少数 token 占据大部分概率。

熵不是“答案质量”，也不是可以直接当作事实置信度的万能指标：一个模型可以非常确定地答错，也可以在多个都合理的措辞之间保持高熵。为了在训练中鼓励探索，有些方法会在需要最小化的 policy loss 里减去 entropy bonus：

$$
\mathcal L_{\mathrm{total}}
=\mathcal L_{\mathrm{policy}}-\alpha\bar H,
\qquad \alpha>0
$$

因为优化器要把 loss 降低，所以这个负号会鼓励模型维持更高的熵，避免策略过早塌缩成近乎固定的回答；反过来，$\alpha$ 太大也会让输出过于随机。熵正则的作用可参考 [Ahmed 等人的研究](https://proceedings.mlr.press/v97/ahmed19a.html)。

### KL divergence

KL 散度衡量两个概率分布有多不一样，其定义为：

$$
D_{\mathrm{KL}}(P\|Q)
=\sum_x P(x)\log\frac{P(x)}{Q(x)}
$$

其中 $P(x)$ 和 $Q(x)$ 表示两个分布对同一个结果 $x$ 分配的概率；$x$ 可以是一枚 token，也可以是一整条回答。公式前面的 $P(x)$ 还意味着：KL 是按照分布 $P$ 来进行概率加权平均的，所以参数顺序一换，关注的区域也会跟着变化。

它有三个重要性质：

1.  $D_{\mathrm{KL}}(P\|Q)\ge 0$；
2. 两个分布相同时为 0；
3. 它不对称，通常 $D_{\mathrm{KL}}(P\|Q)\ne D_{\mathrm{KL}}(Q\|P)$。

#### Forward KL 与 reverse KL

“正向”和“反向”的叫法依赖谁被当成目标分布，脱离参数顺序就容易争错。

如果约定 $P$ 是目标或 reference、$Q$ 是待学习策略，那么常见称呼是：

- forward KL：$D_{\mathrm{KL}}(P\|Q)$；
- reverse KL：$D_{\mathrm{KL}}(Q\|P)$。

可以把目标分布 $P$ 想象成地图上的两座“概率山峰”：一座山代表简洁直接的回答，另一座山代表详细严谨的回答，两类回答都合理；我们现在让模型分布 $Q$ 去拟合这张地图。

```text
目标分布 P：       /\                 /\
                 模式 A              模式 B
```

- **Mode-covering（覆盖模式）**：forward KL 按 $P$ 加权。如果模式 B 明明在 $P$ 中有不少概率，但 $Q$ 在那里几乎为 0，$\log(P/Q)$ 就会变得很大，因此 $Q$ 宁可把分布铺宽一点，也不愿漏掉其中一座山。形象地说，它追求的是“两个答案流派我都得照顾到”。
- **Mode-seeking（寻找模式）**：reverse KL 按 $Q$ 加权。如果 $Q$ 已经集中在模式 A 附近，它几乎不会采到模式 B，自然也很少为“漏掉 B”付出代价；与此同时，两座山之间又是 $P$ 的低概率山谷，把概率铺过去反而会受罚。因此 $Q$ 更容易只守住其中一座高峰。形象地说，它追求的是“先选一个最像样的流派站稳”。

相关方向差异可见 [Ghasemipour 等人的分析](https://proceedings.mlr.press/v100/ghasemipour20a.html)。不过，mode-covering / mode-seeking 只是帮助理解的典型直觉，具体行为还受模型能力、支持集、优化方式和有限样本影响，不能当成必然结论。

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

#### Reference KL 与 old-policy ratio 不同

- $\pi_\theta$ 对 $\pi_{\mathrm{ref}}$ 的 KL：限制模型长期偏离训练起点；
- $\pi_\theta/\pi_{\mathrm{old}}$ 的概率比：限制这一次优化相对采样策略变化太大。

reference 和 old policy 可能初始时参数相同，但职责不同。

### 解码输出——“如何按概率选词”

解码（decoding）是总称，决定模型最终怎样从词表中选出下一个 token；**采样（sampling）则专指其中带随机抽取的分支**，贪婪解码虽然也在选 token，但通常不叫 sampling。它们的关系可以画成：

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

如果不使用 top-k/top-p，那么整个词表中每个非零概率 token 理论上都有机会被抽中，包括概率极低的长尾 token；temperature、top-k 和 top-p 的主要作用，正是控制这种随机性最终能“放开到什么程度”。

#### Temperature

温度 $T$ 本质是作用在 logits 上的一个参数：

$$
p_i(T)=\frac{\exp(z_i/T)}{\sum_j\exp(z_j/T)},\qquad T>0
$$

- $T=1$：不改变原始 softmax；
- $0<T<1$：分布更尖，头部 token 更容易被选中；
- $T>1$：分布更平，低概率 token 更有机会被选中。

数学上不能直接把 $T=0$ 代进公式。很多推理接口把 `temperature=0` 特殊解释为“不采样，走贪婪解码”，这是一种软件约定。

关于温度的更多详细解读可以参考之前的一篇博客：[Temperature 的数学本质 | Harry Yu](https://alidadei.github.io/zh/blog/temperature-math/)

最后再区分一下 **entropy bonus 和 temperature**：entropy 是对当前既定概率分布“不确定程度”的度量，；temperature 是推理时主动改变这个分布形状的参数。

Top-k

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

temperature、top-k 和 top-p 可以一起使用：在常见的采样管线中，temperature 会先改变概率差距，进而影响哪些 token 能进入 top-p 集合；top-k 和 top-p 同时开启时，最终候选通常是经过两道筛选后剩下的部分。具体处理顺序由推理框架实现决定，因此复现实验时不能只记录一个参数。

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
- **Reward**：奖励模型给出的分数，或者规则、程序验证器返回的分数。

因此，**模型每次输出的 token 是 action**，Policy 是某一个 token，也不是某一条已经生成完的回答，而是模型决定“在当前上下文里，下一个 token 各有多大概率”的整套规则。写成 $\pi_\theta(a_t\mid s_t)$ 时，表示模型在状态 $s_t$ 下输出具体 token $a_t$ 的概率。这套对应关系也可参考[这篇关于 LLM 强化学习的说明](https://zhuanlan.zhihu.com/p/1990178700575130664)。

#### 当前策略、旧策略与参考策略

这三个词不能混用：

- **当前策略（current policy）**：此刻正在更新的 $\pi_\theta$，更新当前模型也就等于更新它在各种上下文中的下一 token 概率分布。
- **行为策略（behavior policy）**：指真正采集这批数据时的策略，论文里常记作 $\mu$ 或 $\pi_b$，但符号并不统一，必须以当前论文的定义为准。
- **旧策略（old policy）**：PPO/GRPO 中通常会保存 rollout 时策略的快照或当时的 logprob，并记作 $\pi_{\mathrm{old}}$，用来计算新旧概率比；对这一批 rollout 来说，它通常就是行为策略。数据复用与概率比的详细关系见之前的博客：[LLM RL 中数据复用引发的 off-policy 问题与解决方法 | Harry Yu](https://alidadei.github.io/zh/blog/off_policy_and_importance_ratio/)。
- **参考策略（reference policy）**：通常是冻结的 SFT 模型或训练起点，用来约束当前模型不要偏离太远。

旧策略会随着 rollout 批次更新；参考策略往往长期不变，这俩一个负责回答“这批数据是谁生成的”，另一个负责约束“模型不要离初始行为多远”。

### On-policy、off-policy、online 与 offline

#### On-policy

训练数据由当前策略或与它非常接近的策略新鲜生成。策略更新后，旧数据很快就不再代表当前策略，因此通常不能无限重复利用。

#### Off-policy

训练可以使用其他策略产生的数据，或较早策略留下的数据。要让更新仍然合理，算法可能使用重要性采样、价值学习或其他校正机制。

#### Online 与 offline

- **online** 强调训练期间还在不断与环境交互、生成新数据；
- **offline** 强调训练只使用事先固定的数据集，不再向环境采新样本。

它们与 on/off-policy 有关系，但不是严格同义词。`online` 说的是“数据是否边练边采”，`on-policy` 说的是“数据分布是否来自当前策略”。例如 PPO 常先用旧策略快照生成一批新回答，再把这批回答切成 minibatch 训练几个 epoch（更新模型）；在这几个 epoch 中，当前策略已经发生变化（模型被更新了），所以工程上常说它是近似 on-policy、但允许有限的数据陈旧度。

[OpenAI Spinning Up 的算法分类](https://spinningup.openai.com/en/latest/spinningup/rl_intro2.html) 将 PPO 列为 on-policy 方法，并强调这类方法不能随意使用旧策略数据。



### Reward、return、value 与 advantage

这四个量处在同一条链上，但含义不同。

#### Reward：这一步或这次结果得了多少分

奖励 $r_t$ 可以来自：

- 人工规则，例如格式正确加分；
- 可验证程序，例如单元测试通过率、数学答案是否匹配；
- 学出来的奖励模型；
- 另一个模型充当 judge；
- 多个信号的加权组合。

按照 reward 的主要产生方式，LLM 强化学习又经常分成两类：

- **RLHF（Reinforcement Learning from Human Feedback）**：先收集人类对回答的偏好，再训练一个 reward model 模仿这种偏好，最后用它给新回答打分。它更适合“哪个回答更有帮助、表达更好、更加安全”这类难以写出唯一正确规则的主观标准。经典 [InstructGPT](https://arxiv.org/abs/2203.02155) 走的就是“人类排序—奖励模型—PPO”这条路线。
- **RLVR（Reinforcement Learning with Verifiable Rewards）**：不靠奖励模型猜人类更喜欢哪个回答，而是用规则或程序直接验证结果。例如数学题可以核对最终答案，代码题可以编译并运行测试用例。这样得到的 reward 更客观，但前提是任务确实存在可靠、可自动验证的判分方法。[DeepSeek-R1](https://arxiv.org/abs/2501.12948) 就使用了数学答案验证、代码测试和格式规则等奖励。

最简单的区分方法是问一句：“这个 reward 到底是谁算出来的？”从人类偏好中学出来的 reward model 打分，通常属于 RLHF；由明确规则或程序验证器直接判分，通常属于 RLVR。这是一种常见的工程分类，不代表所有论文都会严格按这两个名字划界。

RLHF 和 RLVR 主要回答“reward 从哪里来”，PPO 和 GRPO 则回答“拿到 reward 后怎样更新 policy”，它们不是同一层的分类。例如，RLVR 完全可以使用 GRPO 来更新模型。

奖励是优化目标的代理，不等于“真实质量”。奖励函数漏掉的条件，模型就可能钻空子。DeepMind 将这类现象总结为 [specification gaming](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)；在 LLM 语境中也常叫 **reward hacking**。

#### Return：从现在到结束一共拿到多少奖励

折扣回报通常写作：

$$
G_t=\sum_{k=t}^{T}\gamma^{k-t}r_k
$$

$\gamma$ 是折扣因子。若任务只在最终答案给一次奖励，而且不做折扣，那么每个位置看到的最终 return 可以是同一个终局分数。

#### Value：从这个状态出发，平均还能拿多少回报

$$
V^\pi(s)=\mathbb E_\pi[G_t\mid s_t=s]
$$

value 是预测的未来回报，可作为基线来降低梯度方差。PPO 常额外训练一个 **critic / value model** 估计它。critic 不是奖励函数，也不负责判断回答对不对；它是在估计“按当前策略继续走，通常能拿几分”。

#### Advantage：这次动作比基线好多少

$$
A^\pi(s,a)=Q^\pi(s,a)-V^\pi(s)
$$

优势为正，表示这次动作比该状态下的平均水平好；为负，表示比平均水平差。策略梯度直接使用的往往是 advantage，而不是原始 reward。

PPO 常结合 critic 和 [GAE](https://arxiv.org/abs/1506.02438) 在偏差与方差之间折中。GRPO 的关键做法则是：不训练 critic，而用同一 prompt 的一组回答分数构造相对基线。

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
- 使用 GAE 等时序信用分配方法；
- 把任务拆成可验证的阶段；
- 收集能形成对照的多条轨迹。

这些方法只是增加信息或降低估计噪声，不会“自动找出真正原因”。如果奖励本身错了，再精细的信用分配也只会更精确地优化错误目标。

### Reward model 与偏好概率

奖励模型常把 prompt 和回答映射成一个标量 $r_\phi(x,y)$。经典偏好建模常使用 Bradley–Terry 形式：

$$
P(y_w\succ y_l\mid x)
=\sigma\bigl(r_\phi(x,y_w)-r_\phi(x,y_l)\bigr)
$$

如果 chosen 的分数比 rejected 高得多，模型就认为 chosen 更可能被偏好。训练数据只提供相对顺序，因此奖励分数本身没有天然的“80 分就是优秀”尺度；换模型或换数据后，绝对值通常不能直接横比。

奖励模型还可能继承标注偏差，并在策略生成超出训练分布的回答时失准。这也是为什么奖励模型需要留出集检查、对抗测试，以及对最终策略进行独立评估。[从人类偏好学习的早期工作](https://arxiv.org/abs/1706.03741) 和 [InstructGPT](https://arxiv.org/abs/2203.02155) 都采用了“偏好比较—学习奖励—再优化策略”的基本思路。

#### Verifier 与 judge 不完全等价

- **Verifier** 通常检查可客观验证的条件，例如编译是否成功、测试是否通过、最终答案是否匹配。
- **Judge** 常由另一个模型按评分标准评价开放式回答，仍可能受提示、位置、长度和模型偏好的影响。

Verifier 也不是绝对不会出错：测试可能覆盖不全，答案抽取可能有漏洞，格式规则也可能被投机利用。只是当验证条件定义完整时，它通常比开放式主观打分更可审计。

### Policy gradient

策略梯度的核心式子可以写成：

$$
\nabla_\theta J(\theta)
=\mathbb E\!\left[
\sum_t \nabla_\theta\log\pi_\theta(a_t\mid s_t)\,\hat A_t
\right]
$$

大白话解释：

- 如果这次动作的优势 $\hat A_t$ 为正，就提高模型以后在相似状态下生成该 token 的概率；
- 如果优势为负，就降低这个概率；
- 优势绝对值越大，更新信号通常越强。

`log probability` 出现在式子里，是因为序列概率由许多条件概率相乘；取对数后可以把它们变成相加，求导也更方便。策略梯度的基础推导可参考 [Spinning Up 的说明](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html)。

#### REINFORCE

REINFORCE 是最基础的蒙特卡洛策略梯度：采完整轨迹，用实际回报更新策略。它概念简单，但回报噪声大、梯度方差高，通常要加 baseline 才更稳定。

#### PPO

[PPO](https://arxiv.org/abs/1707.06347) 的常见 clipped 目标是：

$$
L^{\mathrm{clip}}(\theta)
=\mathbb E_t\left[
\min\left(
r_t(\theta)\hat A_t,
\operatorname{clip}(r_t(\theta),1-\epsilon,1+\epsilon)\hat A_t
\right)
\right]
$$

其中：

$$
r_t(\theta)
=\frac{\pi_\theta(a_t\mid s_t)}
{\pi_{\mathrm{old}}(a_t\mid s_t)}
=\exp\!\left(
\log\pi_\theta(a_t\mid s_t)
-\log\pi_{\mathrm{old}}(a_t\mid s_t)
\right)
$$

$r_t$ 衡量当前策略与采样时旧策略对同一个 token 的概率变化。裁剪的作用是：概率比变化超过一定范围后，不再让这个样本继续提供同方向的额外收益，从而抑制过猛更新。它不是一道硬墙，不能保证所有实际概率比都严格落在区间内。

LLM 版 PPO 通常包含：

- 一个可训练 policy / actor；
- 一个 old policy 快照，用于概率比；
- 一个 value / critic，用于估计优势；
- 一个 reference policy，用 KL 约束偏离；
- 奖励模型、规则或其他 reward source。

所以“PPO 的 critic 负责打奖励分”是错误说法：奖励源和 critic 是两种角色。

#### GRPO

[DeepSeekMath](https://arxiv.org/abs/2402.03300) 提出的 Group Relative Policy Optimization（GRPO）保留了 PPO 式的策略更新思路，但省去独立 critic。对同一个 prompt 采样 $G$ 个回答，得到奖励 $R_1,\ldots,R_G$，原始论文中的组内标准化优势可简化写成：

$$
\hat A_i
=\frac{R_i-\operatorname{mean}(R_1,\ldots,R_G)}
{\operatorname{std}(R_1,\ldots,R_G)+\varepsilon}
$$

直觉是：不问“这个回答绝对得了几分”，而问“它在同一道题的这一组候选里，比平均水平高还是低”。好于组平均的回答得到正优势，差于平均的得到负优势。

这带来几个直接结论：

- GRPO 的 **group** 是同一 prompt 下的一组 completion；
- 组内奖励全相同时，几乎没有相对学习信号；
- 组太小会让均值和标准差估计更噪；组变大则增加生成成本；
- 不训练 critic 能省去一套价值模型，但不能省去 rollout、奖励计算和策略更新。

今天不同框架里名为“GRPO”的实现，可能已经修改了长度归一化、KL 项、裁剪方式、优势标准化和损失聚合。比如当前 [TRL GRPOTrainer 文档](https://huggingface.co/docs/trl/grpo_trainer) 就提供多种 loss 选项。因此讨论实验时应写明具体公式、框架版本和参数，不能只写“用了 GRPO”。

### DPO：不用在线 rollout 的直接偏好优化

[Direct Preference Optimization](https://arxiv.org/abs/2305.18290) 使用固定的 chosen/rejected 数据，直接提高 chosen 相对 rejected 的偏好概率。其常见损失写作：

$$
\mathcal L_{\mathrm{DPO}}
=-\mathbb E\left[
\log\sigma\left(
\beta\log\frac{\pi_\theta(y_w\mid x)}{\pi_{\mathrm{ref}}(y_w\mid x)}
-\beta\log\frac{\pi_\theta(y_l\mid x)}{\pi_{\mathrm{ref}}(y_l\mid x)}
\right)
\right]
$$

它比较两件事：当前策略相对参考策略，把 chosen 提高了多少；又把 rejected 提高了多少。前者应比后者更大。

DPO 的主要关系可以概括为：

- 它需要偏好对和 reference policy；
- 标准训练过程不显式拟合一个独立 reward model；
- 标准训练过程不要求边优化边用当前策略生成新回答；
- 它不是“没有奖励思想”，而是利用理论变换把隐含奖励与最优策略关系写进分类式损失。

理论推导中的 $\beta$ 控制相对 reference 的约束强度：在“期望奖励减去 $\beta$ 倍 KL”的写法下，较大的 $\beta$ 意味着更重视靠近 reference。不过在具体代码中，$\beta$ 同时进入损失尺度，且不同变体可能重新参数化；跨框架比较时必须先核对公式。

### Best-of-N 与拒绝采样

**Best-of-N** 是对同一 prompt 生成 $N$ 个候选，再由 reward model、verifier 或规则选出分数最高的一个。

- 如果只是把最好的候选返回给用户，它是一种推理时计算换质量的方法；
- 如果把选出的候选收集起来继续做 SFT，常被称为拒绝采样微调或 rejection sampling fine-tuning；
- 如果候选分数再被转换成优势并直接更新策略，就进入 PPO/GRPO 一类强化学习流程。

所以“生成多个答案再选最好”本身不是 policy gradient。它是否属于训练、怎样训练，要看选完以后做了什么。[Llama 2 技术报告](https://arxiv.org/abs/2307.09288) 展示了拒绝采样与 RLHF 迭代结合的实际流程。



### 一张易混概念对照表

| 容易混淆的词 | 最短区分 |
| --- | --- |
| token / word | token 是 tokenizer 定义的单位，不必等于自然语言里的词 |
| autoregressive / greedy | 前者是按前缀逐步预测；后者是每步取最大概率的一种解码 |
| temperature / entropy bonus | 前者改推理采样；后者进入训练目标并改权重 |
| reward / return | reward 是某一步或终局得分；return 是从当前位置起累计的奖励 |
| reward / advantage | reward 是原始分数；advantage 是相对基线好多少 |
| reward / loss | reward 通常希望越大越好；loss 交给优化器最小化。实现中常把要最大化的目标取负，但二者不一定只是简单差一个负号 |
| reward model / critic | 前者评价回答；后者预测未来回报并提供基线 |
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
8. **同一 rollout 重用了几次？** 数据越旧，当前策略与行为策略的偏差通常越大。
9. **怎样独立评估？** 不能只看训练 reward；还要看留出任务、格式、长度、旧能力、安全性与人工抽检。

如果一份报告不能回答这些问题，仅凭“用了某某算法”通常不足以复现实验，也不足以判断结果来自哪里。

## 参考资料

以下以原始论文、研究机构技术报告和主流框架官方文档为主，最后检索于 2026 年 7 月 17 日。链接用于追溯定义与事实，不表示不同来源的全部工程选择都完全一致；未固定版本的框架文档以后仍可能变化。

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

- Hugging Face TRL：[GRPO Trainer](https://huggingface.co/docs/trl/grpo_trainer)
- NVIDIA Megatron Core：[Parallelism Strategies Guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)

### 站内延伸阅读

- [Temperature 的数学本质 | Harry Yu](https://alidadei.github.io/zh/blog/temperature-math/)
- [LLM RL 中数据复用引发的 off-policy 问题与解决方法 | Harry Yu](https://alidadei.github.io/zh/blog/off_policy_and_importance_ratio/)
