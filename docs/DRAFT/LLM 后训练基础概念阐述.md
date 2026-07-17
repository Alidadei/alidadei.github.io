# LLM 后训练基础概念阐述

大语言模型先在海量文本上做预训练，学会“接下来最可能出现什么 token”；之后，人们还要继续教它听指令、遵守输出格式、贴近人的偏好，或者在可验证任务上提高正确率。这一大段工作通常统称为 **后训练（post-training）**。

“后训练”不是某一种固定算法，也没有全行业唯一的流水线。SFT、奖励模型、DPO、PPO、GRPO 都可能出现在后训练里，但一个项目不必把它们全部用一遍。本文按论文和主流框架里相对稳定的共识解释这些概念；凡是不同论文、不同框架口径不统一的地方，会明确写出来。

第一次阅读时可以跳过公式。每个公式后面的白话解释已经覆盖它想表达的核心；公式的作用只是把“究竟在比较谁、平均谁、约束谁”写得没有歧义。

## 先看全局：一条常见但并非唯一的路线

```text
原始语料
  ↓ 预训练（预测下一个 token）
基础模型
  ↓ 可选：继续预训练，用领域或目标语言语料继续学习
领域基础模型
  ↓ SFT：用“问题—理想回答”示范教模型听指令
指令模型
  ├─ 固定偏好对（chosen / rejected）────────→ DPO 等离线偏好优化
  ├─ 奖励模型或规则 / 验证器 + 新生成的回答 ─→ PPO、GRPO 等在线强化学习
  └─ 一次生成多个候选，筛出较好的回答 ─────→ Best-of-N、拒绝采样，再用于训练或直接返回
```

这张图里最重要的关系是：

- **SFT 数据告诉模型“照着什么样子回答”**；
- **偏好数据告诉模型“两个回答里更喜欢哪一个”**；
- **奖励把回答压成一个或一串分数**；
- **优势（advantage）把分数变成“这个回答比基线好多少”**；
- **策略梯度再根据优势调整模型生成这些 token 的概率**；
- **KL、熵和裁剪等机制负责限制更新幅度或维持探索**。

OpenAI 的 [InstructGPT 论文](https://arxiv.org/abs/2203.02155) 展示了“SFT—偏好排序—奖励模型—强化学习”这条经典路线；[DPO](https://arxiv.org/abs/2305.18290) 则表明，固定偏好数据也可以不显式训练奖励模型、不在优化时在线 rollout，直接优化策略。

“继续预训练算不算后训练”也没有统一口径：有人按时间顺序把基础预训练后的所有训练都算进去，有人把 continued pretraining 单独列为语料适配。本文把它放在总流程里，但与教模型遵循偏好的 alignment 训练分开解释。

## LLM 的输入处理

### Token、tokenizer 与词表

#### 模型读到的不是“字”和“词”，而是 token ID

人输入的是字符串，模型实际接收的是一串整数。中间负责转换的工具叫 **tokenizer（分词器）**：

```text
字符串 → token 序列 → token ID 序列 → 向量序列 → Transformer
```

一个 token 可能是一个汉字、一个词、半个英文单词、标点、空格的一部分，也可能是专门表示“用户消息开始”的控制符。具体切法完全取决于 tokenizer，不能拿“一个 token 等于一个字”当通用换算规则。

**词表（vocabulary）** 就是 token 与整数 ID 的对照表。模型还有一张 embedding 矩阵，把每个 ID 变成向量。模型输出时，最后一层通常也要给词表中的每个 token 打分。因此 tokenizer、词表、输入 embedding 和输出头必须彼此对得上。

#### Tokenizer 是怎样训练出来的

常见流程可以粗略理解为四步：

1. 收集有代表性的语料。语料中有哪些语言、代码和领域文本，会直接影响切词效果。
2. 做有限的规范化和预切分，例如处理空格、Unicode 形式或标点。不同 tokenizer 的选择不同，并非都必须做同样的规范化。
3. 学习子词单元。常见方法包括 BPE 和 Unigram。
4. 按模型需要加入 BOS、EOS、PAD、UNK，以及聊天角色、工具调用等特殊 token；不是每个 tokenizer 都必须具备其中全部类型。

**BPE** 可以大白话理解为：先从较小单元出发，反复把语料中常一起出现的相邻片段合并，直到达到目标词表大小。它让罕见词也能拆成已知子词，最早广泛用于神经机器翻译的工作见 [Sennrich 等人的论文](https://aclanthology.org/P16-1162/)。

**Unigram** 的思路不同：先准备一个较大的候选子词集合，再逐步删去对整体概率贡献较小的候选，留下设定数量的 token。[SentencePiece](https://aclanthology.org/D18-2012/) 同时支持 BPE 和 Unigram，并能直接从原始句子训练，不要求所有语言都先按空格分词。

这里不存在“BPE 永远优于 Unigram”之类的共识。真正要看的是目标语料上的序列长度、语言覆盖、可逆性、训练成本和下游效果。

#### 词表大小怎样确定

没有一个放之四海而皆准的数字。它是几种成本的折中：

- **词表较小**：一段话往往会被切成更多 token，序列变长。对标准稠密注意力来说，长序列的计算和显存成本增长很快；可用上下文里也更容易塞不下内容。
- **词表较大**：序列可能变短，但 embedding、输出头和每一步 softmax 都更大；低频 token 也可能因为训练次数太少而学不好。
- **语言分布不均**：如果训练语料偏向某些语言，其他语言可能被切得很碎。同样一句话，所需 token 数可能明显不同。
- **领域差异**：代码、化学式、医学名词和普通聊天的合理切分并不一样。

假设 token embedding 和输出头使用的向量宽度为 $d$，给词表新增 $K$ 个 token：若输入 embedding 和输出权重共享，新增参数约为 $Kd$；若两者不共享，约为 $2Kd$，这里忽略偏置项。这个公式只说明参数成本，不代表词表越小越好，因为序列长度也会反过来影响训练与推理成本。

合理做法是：先用有代表性的候选语料训练几种词表大小，再在留出数据上比较平均 token 数、长尾语言和领域文本的切分、训练吞吐、模型效果与显存成本。[一项覆盖多种语言和任务的实证研究](https://aclanthology.org/2024.findings-naacl.247/) 也提醒：fertility（一个词平均被切成多少 token）等指标有参考价值，但不能单独替代下游实验。

#### 什么时候需要扩充词表

扩词表不是普通 SFT 的必做步骤。原 tokenizer 已经能表示任何输入时，仅仅因为某个专业词被拆成多个 token，并不自动说明值得扩词。扩词表更常见于以下情况：

- 新增语言被切得极碎，序列成本明显过高；
- 领域中有大量稳定、反复出现的特殊字符串；
- 要加入新的聊天控制符、工具调用标记或模态占位符；
- 有足够继续预训练数据，让新 token 真正学到含义。

一个稳妥的扩词流程是：

1. 保留旧 token 与旧 ID 的对应关系，只把新 token 追加到词表末尾；
2. 同步扩展输入 embedding 和输出头；
3. 初始化新行，可以使用已有子词向量的组合或其他经过验证的初始化方法；
4. 用覆盖新 token 的数据继续预训练或微调；
5. 检查旧能力、目标语言效果、序列长度和部署端 tokenizer 是否一致。

只在 tokenizer 里添加字符串，却不扩展并训练模型权重，新 token 不会凭空获得语义。主流 Transformers 接口的 [`resize_token_embeddings`](https://huggingface.co/docs/transformers/main_classes/model#transformers.PreTrainedModel.resize_token_embeddings) 负责调整 embedding 大小，但“能调整尺寸”不等于“已经学会新 token”。词表扩展的初始化和继续训练也会影响效果，相关对比可见 [Mundra 等人的研究](https://aclanthology.org/2024.conll-1.8/)。

### Chat template 与特殊 token

聊天模型最终仍然只接收一串 token。所谓 `system`、`user`、`assistant` 角色，必须先被模板序列化，例如：

```text
<角色开始>system
你是一个助手。<角色结束>
<角色开始>user
解释什么是 KL。<角色结束>
<角色开始>assistant
```

上面只是示意，不是某个模型的真实模板。不同模型使用的控制 token 和换行方式可能完全不同。

如果训练时使用一种模板，推理时换成另一种，模型看到的输入分布就变了，效果可能明显下降。还要避免 tokenizer 自动加入一次 BOS/EOS，模板又手动加入一次，造成特殊 token 重复。Hugging Face 的 [聊天模板文档](https://huggingface.co/docs/transformers/main/en/chat_templating) 对这一点有直接说明。

### 上下文、注意力掩码与位置

“LLM 会对全部输入做全局注意力”并不是所有模型都成立。原始 Transformer 使用全注意力；但实际模型也可能采用滑动窗口、分块注意力或其他稀疏结构。例如 [Mistral 7B](https://arxiv.org/abs/2310.06825) 使用了滑动窗口注意力。

对典型 decoder-only LLM 来说，关键是 **因果掩码（causal mask）**：第 $t$ 个位置只能看当前位置及其之前的 token，不能偷看后面的答案。

- **训练时**：已知整段正确文本，可以在一次前向计算中并行得到各位置的预测，但每个位置仍受因果掩码约束。
- **推理时**：后一个 token 依赖前一个刚生成的 token，所以必须按顺序生成。KV cache 会保存先前位置的 key/value，避免每一步把旧内容全部重算；它节省重复计算，但不会消除逐 token 的依赖。可参考 [Transformers 的 KV cache 文档](https://huggingface.co/docs/transformers/kv_cache)。

`padding mask` 用来告诉模型哪些位置只是补齐长度的 PAD；`truncation` 决定输入太长时从哪里截断。它们配置错误时，模型可能关注到填充内容，或者把真正需要的提示截掉。

## LLM 的输出与解码

### 从 logits 到下一个 token

模型最后不会直接吐出一句话，而是先为词表中每个 token 给出一个未归一化分数，叫 **logit**。用 softmax 把 logits 变成概率：

$$
p_i = \frac{\exp(z_i)}{\sum_j \exp(z_j)}
$$

$z_i$ 是第 $i$ 个 token 的 logit，$p_i$ 是它作为下一个 token 的概率。所有 $p_i$ 相加等于 1。

如果已经有输入 $x$，模型生成回答 $y=(y_1,\ldots,y_T)$，整段回答的概率可以写成：

$$
p_\theta(y\mid x)
=\prod_{t=1}^{T}p_\theta(y_t\mid x,y_{<t})
$$

意思很简单：第一个 token 的概率，乘上“已有第一个 token 时第二个 token 的概率”，再一直乘下去。

### Logprob：概率的对数

`logprob` 就是 $\log p$。因为概率 $p$ 在 0 到 1 之间，所以 logprob 通常不大于 0：$-0.1$ 比 $-5$ 代表更高的概率。整段回答的 logprob 是各 token logprob 之和：

$$
\log p_\theta(y\mid x)
=\sum_{t=1}^{T}\log p_\theta(y_t\mid x,y_{<t})
$$

这样既把乘法变成了加法，也避免很多极小概率相乘造成数值下溢。PPO 的新旧策略概率比、DPO 的 chosen/rejected 比较、KL 的采样估计都会用到 logprob。

还要注意：token 越多，logprob 相加的项就越多，整段总 logprob 往往也越负。因此比较不同长度的回答时，是否做长度归一化会改变指标含义；不能把未经说明的“sequence score”直接当作公平质量分。

### 自回归不等于“每次选概率最大的词”

**自回归**只说明：每次根据已有上下文预测下一个 token，再把新 token 放回上下文继续预测。到底怎样从概率分布中选 token，是另一个问题，叫 **解码（decoding）**。

#### 贪婪解码（greedy decoding）

每一步都选当前概率最大的 token：

$$
y_t=\arg\max_i p(i\mid x,y_{<t})
$$

优点是简单、通常可复现、没有采样噪声。缺点是它只做当前一步的局部最优选择，并不保证整段序列的联合概率最高，更不保证内容质量最好。

#### 多项式采样（multinomial sampling）

也叫 categorical sampling 或 ancestral sampling：按照模型给出的概率随机抽一个 token，而不是永远选第一名。例如在同一个上下文中，某三个 token 的概率为 0.6、0.3、0.1；若重复独立抽样很多次，频率会大致接近这个比例。

温度、top-k 和 top-p 通常不是三套互斥算法，而是先修改或裁剪概率分布，再从剩余分布做这种随机采样。

#### Temperature

温度 $T$ 作用在 logits 上：

$$
p_i(T)=\frac{\exp(z_i/T)}{\sum_j\exp(z_j/T)},\qquad T>0
$$

- $T=1$：不改变原始 softmax；
- $0<T<1$：分布更尖，头部 token 更容易被选中；
- $T>1$：分布更平，低概率 token 更有机会被选中。

数学上不能直接把 $T=0$ 代进公式。很多推理接口把 `temperature=0` 特殊解释为“不采样，走贪婪解码”，这是软件约定，不是 softmax 在零温度下的普通计算。

温度也不是“事实准确度旋钮”。降低温度通常减少随机性，但如果最高概率答案本来就错，贪婪地重复它不会把错误变正确。

#### Top-k

只保留概率最高的 $k$ 个 token，把其他 token 的概率设为 0，再重新归一化并采样。候选数量固定，但不同上下文中第 $k$ 名的概率可能差很多。

#### Top-p / nucleus sampling

从高到低累加概率，保留累计概率首次达到阈值 $p$ 所需的最小候选集合，再重新归一化并采样。候选数量会随上下文变化：模型很确定时集合较小，不确定时集合较大。[Nucleus Sampling 论文](https://openreview.net/forum?id=rygGQyrFvH) 指出，开放式文本中一味最大化概率容易产生乏味或重复文本，并提出用动态概率核采样。

#### Beam search

Beam search 同时保留若干条当前得分较高的部分序列，再逐步扩展，近似寻找整段得分更高的答案。它在机器翻译、受约束生成等任务里很常见；在开放式聊天中却未必更自然，通常还需要长度惩罚、重复控制等额外设计。它也只是有限宽度的搜索，不保证找到全局最优，更不保证“概率最高”就等于“最符合用户需要”。

#### 停止条件

生成通常在以下任一条件满足时结束：

- 生成 EOS；
- 命中指定 stop sequence；
- 达到 `max_new_tokens`；
- 外部控制器决定停止，例如工具调用协议完成。

解码参数改变的是“怎样从当前模型取样”，不会修改模型权重。训练中的熵正则则会改变权重，两者不要混为一谈。主流生成参数的准确定义可查阅 [Transformers 文本生成文档](https://huggingface.co/docs/transformers/main_classes/text_generation)。

## 常见概念

### Sample、prompt、completion 与 response

这些词看起来简单，却最容易在 batch 统计里产生误会：

- **prompt**：交给模型的条件，可以是问题，也可以包含 system 指令、历史对话、工具结果等。
- **completion**：模型接在 prompt 后面生成的 token 序列。
- **response**：在聊天任务里通常指助手回答，常与 completion 混用；但有的系统会从 completion 中去掉控制 token 后才叫 response。
- **sample / example**：一个训练样本。它究竟指“一条 prompt”“一条 prompt-completion”还是“一个 token”，必须看代码或文档，不能只凭变量名猜。

在 GRPO 中，一条 prompt 往往会生成 $G$ 条 completion。因此“8 条 prompt”和“64 条 completion”完全可能是同一个 rollout batch 的两种统计口径。

### Alignment：目标，不是某一种算法

**Alignment（对齐）**通常指让模型行为更符合指定的人类意图、规则或偏好。SFT、RLHF、RLAIF、DPO 都可以成为实现手段，但没有一个算法与 alignment 画等号。

“对齐”也不是“从此永远正确、安全、公平”的认证。模型究竟对齐到什么，取决于示范数据、偏好标注、宪法或评分规则；不同群体之间还可能存在真实的价值冲突。因此技术报告最好明确写“对齐到哪套目标、由谁提供反馈、怎样评估”，而不是只写“模型已经对齐”。

### 继续预训练、SFT 与偏好学习

#### 继续预训练（continued pretraining）

继续使用“预测下一个 token”的目标，让基础模型阅读更多目标语言、代码或专业领域文本。它主要是在补充语料分布和知识，不等同于教模型遵循问答指令。

#### SFT（监督微调）

SFT 给模型看理想回答，并用交叉熵让模型提高这些目标 token 的概率：

$$
\mathcal L_{\mathrm{SFT}}
=-\sum_t m_t\log p_\theta(y_t\mid x,y_{<t})
$$

$m_t$ 是损失掩码。很多聊天 SFT 只让 assistant 回答位置的 $m_t=1$，不对 system 和 user 的 token 计算损失；但这是一种常见配方，不是“SFT”这个词自带的硬性规定。有些训练会对整段序列计算损失。

训练时把正确前缀直接喂给模型，常叫 **teacher forcing**。推理时模型只能看到自己先前生成的内容，两者有天然差别。

只对回答位置算损失，也不意味着基础知识一定不会遗忘。学习率、训练步数、数据分布和是否混入通用数据仍会影响旧能力。

#### 偏好学习

偏好数据通常长这样：同一个 prompt 下有一个较好的回答 $y_w$（winner/chosen）和一个较差的回答 $y_l$（loser/rejected）。它只告诉模型相对顺序，不必给出绝对分数。

偏好标签可以来自人类、另一个模型，或可验证规则：

- **RLHF**：核心反馈来自人类；
- **RLAIF**：核心反馈来自 AI，例如 [Constitutional AI](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback) 中由模型依据原则提供反馈；
- **RLVR**：奖励来自可验证结果，例如答案匹配、代码测试或格式约束。[Tülu 3 的技术说明](https://allenai.org/blog/tulu-3-technical) 给出了规则验证奖励的实际例子。

这些名字描述的是反馈来源或训练设置，不是互相排斥的单一算法。一个系统可以同时混用人类偏好、AI 反馈和规则验证。

### Policy：LLM 强化学习里的“策略”

策略写作 $\pi_\theta$，表示“在当前状态下，对下一步动作给出概率分布”。在 decoder-only LLM 里，可以这样对应：

- **状态 $s_t$**：prompt 加上已经生成的前缀；
- **动作 $a_t$**：下一个 token；
- **策略 $\pi_\theta(a_t\mid s_t)$**：模型给下一个 token 的概率；
- **一轮交互**：一直生成到 EOS、长度上限或任务结束。

因此，policy 通常就是正在训练的语言模型本身，而不是模型外面另有一个神秘模块。

#### 当前策略、旧策略与参考策略

这三个词不能混用：

- **当前策略（current policy）**：此刻正在更新的 $\pi_\theta$。
- **行为策略（behavior policy）**：真正采集这批数据时使用的策略。
- **旧策略（old policy）**：PPO/GRPO 中常把采样时的策略冻结成一个快照，用来计算新旧概率比。它通常就是该批数据的行为策略。
- **参考策略（reference policy）**：通常是冻结的 SFT 模型或训练起点，用来约束当前模型不要偏离太远。

旧策略会随着 rollout 批次更新；参考策略往往长期不变。一个负责回答“这批数据从哪来”，另一个负责回答“模型不要离初始行为多远”。

### On-policy、off-policy、online 与 offline

#### On-policy

训练数据由当前策略或与它非常接近的策略新鲜生成。策略更新后，旧数据很快就不再代表当前策略，因此通常不能无限重复利用。

#### Off-policy

训练可以使用其他策略产生的数据，或较早策略留下的数据。要让更新仍然合理，算法可能使用重要性采样、价值学习或其他校正机制。

#### Online 与 offline

- **online** 强调训练期间还在不断与环境交互、生成新数据；
- **offline** 强调训练只使用事先固定的数据集，不再向环境采新样本。

它们与 on/off-policy 有关系，但不是严格同义词。`online` 说的是“数据是否边练边采”，`on-policy` 说的是“数据分布是否来自当前策略”。例如 PPO 常先用旧策略快照生成一批新回答，再把这批回答切成 minibatch 训练几个 epoch；在这几个 epoch 中，当前策略已经发生变化，所以工程上常说它是近似 on-policy、但允许有限的数据陈旧度。

[OpenAI Spinning Up 的算法分类](https://spinningup.openai.com/en/latest/spinningup/rl_intro2.html) 将 PPO 列为 on-policy 方法，并强调这类方法不能随意使用旧策略数据。DPO 通常使用固定偏好数据集，属于 offline 偏好优化；它也不是传统意义上依赖 rollout 的 policy-gradient 强化学习。

### Rollout 与 trajectory

在标准强化学习资料里，**trajectory、episode 和 rollout 经常被当作近义词**，都可指一串状态、动作和奖励。不要假装它们存在全行业统一、严格的边界。[Spinning Up 的基本概念](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) 就明确把这些词放在一起解释。

为了在 LLM 工程中说得更清楚，可以采用下面这套实用约定：

- **rollout** 更强调“让某个策略实际跑一次并采样”的过程，也常指这次生成本身；
- **trajectory** 更强调记录下来的完整轨迹，例如状态、token、logprob、奖励、工具调用和环境返回值。

一条普通问答的轨迹可以写成：

$$
\tau=(s_0,a_0,s_1,a_1,\ldots,s_T)
$$

如果只在最终答案处打一个分，轨迹中间可能没有显式奖励。Agent 任务的轨迹还可能包含“调用搜索工具—收到结果—继续思考—提交答案”等多轮动作。

**一次 rollout 不一定等于一条 prompt。** GRPO 常对同一 prompt rollout 多次，以便在同组回答之间比较；一个 rollout batch 也可能包含许多 prompt。

### Reward、return、value 与 advantage

这四个量处在同一条链上，但含义不同。

#### Reward：这一步或这次结果得了多少分

奖励 $r_t$ 可以来自：

- 人工规则，例如格式正确加分；
- 可验证程序，例如单元测试通过率、数学答案是否匹配；
- 学出来的奖励模型；
- 另一个模型充当 judge；
- 多个信号的加权组合。

奖励是优化目标的代理，不自动等于“真实质量”。奖励函数漏掉的条件，模型就可能钻空子。DeepMind 将这类现象总结为 [specification gaming](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)；在 LLM 语境中也常叫 **reward hacking**。

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

[DeepSeekMath](https://arxiv.org/html/2402.03300) 提出的 Group Relative Policy Optimization（GRPO）保留了 PPO 式的策略更新思路，但省去独立 critic。对同一个 prompt 采样 $G$ 个回答，得到奖励 $R_1,\ldots,R_G$，原始论文中的组内标准化优势可简化写成：

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

### Entropy

给定状态 $s$，策略的 token 分布熵为：

$$
H\bigl(\pi(\cdot\mid s)\bigr)
=-\sum_a \pi(a\mid s)\log\pi(a\mid s)
$$

- 熵高：概率分散，模型在多个 token 之间犹豫；
- 熵低：概率集中，少数 token 占据大部分概率。

熵不是“答案质量”，也不是可以直接当作事实置信度的万能指标。一个模型可以非常确定地答错，也可以在多个都合理的措辞之间保持高熵。

训练目标中加入熵奖励，通常是为了鼓励随机性和探索，防止策略过早变得过于确定。熵正则对策略优化的作用可参考 [Ahmed 等人的研究](https://proceedings.mlr.press/v97/ahmed19a.html)。但熵系数过大也会让输出过于随机；合理值依任务、奖励尺度和训练阶段而定。

#### Entropy 与 temperature 的区别

- **temperature**：推理时临时改变采样分布，不修改模型参数；
- **entropy bonus**：训练时进入目标函数，通过梯度修改模型参数。

二者都可能让输出分布变平，但发生的阶段和长期效果完全不同。

### KL divergence

KL 散度衡量两个概率分布有多不一样：

$$
D_{\mathrm{KL}}(P\|Q)
=\sum_x P(x)\log\frac{P(x)}{Q(x)}
$$

它有三个重要性质：

1. 期望意义下 $D_{\mathrm{KL}}(P\|Q)\ge 0$；
2. 两个分布相同时为 0；
3. 它不对称，通常 $D_{\mathrm{KL}}(P\|Q)\ne D_{\mathrm{KL}}(Q\|P)$。

#### Forward KL 与 reverse KL

“正向”和“反向”的叫法依赖谁被当成目标分布，脱离参数顺序就容易争错。最稳妥的表达永远是直接写 $D_{\mathrm{KL}}(P\|Q)$。

如果约定 $P$ 是目标或 reference、$Q$ 是待学习策略，那么常见称呼是：

- forward KL：$D_{\mathrm{KL}}(P\|Q)$；
- reverse KL：$D_{\mathrm{KL}}(Q\|P)$。

常见直觉是：forward KL 会重罚 $P$ 有概率而 $Q$ 几乎不给概率的区域，因此更倾向覆盖目标的多种模式；reverse KL 会重罚 $Q$ 把概率放到 $P$ 很低的区域，因此更容易集中到少数模式。相关方向差异可见 [Ghasemipour 等人的分析](https://proceedings.mlr.press/v100/ghasemipour20a.html)。但“mode-covering / mode-seeking”只是帮助理解的典型直觉，具体行为还受模型能力、支持集、优化方式和有限样本影响，不能当成必然结论。

#### 后训练里常见的是哪一个 KL

经典 KL 约束强化学习目标常写成：

$$
\max_\pi\quad
\mathbb E_{y\sim\pi(\cdot\mid x)}[r(x,y)]
-\beta D_{\mathrm{KL}}
\bigl(\pi(\cdot\mid x)\|\pi_{\mathrm{ref}}(\cdot\mid x)\bigr)
$$

这里的顺序是“当前 policy 在前，reference 在后”。按上面的约定，它相对 reference 属于 reverse KL。$\beta$ 越大，理论目标越不愿意远离 reference；$\beta$ 越小，奖励越可能主导更新。

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

后训练代码里经常同时出现两种“距离”：

- $\pi_\theta$ 对 $\pi_{\mathrm{ref}}$ 的 KL：限制模型长期偏离训练起点；
- $\pi_\theta/\pi_{\mathrm{old}}$ 的概率比：限制这一次优化相对采样策略变化太大。

reference 和 old policy 可能初始时参数相同，但职责不同，之后通常也不再相同。

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

- Sennrich, Haddow, Birch, 2016：[Neural Machine Translation of Rare Words with Subword Units](https://aclanthology.org/P16-1162/)
- Kudo, Richardson, 2018：[SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing](https://aclanthology.org/D18-2012/)
- Ali et al., 2024：[How Good is Your Tokenizer? On the Monolingual Performance of Multilingual Language Models](https://aclanthology.org/2024.findings-naacl.247/)
- Mundra et al., 2024：[An Empirical Study of Vocabulary Expansion Methods for Language Models](https://aclanthology.org/2024.conll-1.8/)
- Vaswani et al., 2017：[Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- Jiang et al., 2023：[Mistral 7B](https://arxiv.org/abs/2310.06825)
- Holtzman et al., 2020：[The Curious Case of Neural Text Degeneration](https://openreview.net/forum?id=rygGQyrFvH)
- Hugging Face Transformers：[Chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating)、[Generation](https://huggingface.co/docs/transformers/main_classes/text_generation)、[KV cache](https://huggingface.co/docs/transformers/kv_cache)、[Resize token embeddings](https://huggingface.co/docs/transformers/main_classes/model#transformers.PreTrainedModel.resize_token_embeddings)

### 偏好、强化学习与奖励

- Christiano et al., 2017：[Deep Reinforcement Learning from Human Preferences](https://arxiv.org/abs/1706.03741)
- Ouyang et al., 2022：[Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155)
- Schulman et al., 2017：[Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347)
- Schulman et al., 2015：[High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438)
- Rafailov et al., 2023：[Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
- Shao et al., 2024：[DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300)
- Lightman et al., 2023：[Let's Verify Step by Step](https://arxiv.org/abs/2305.20050)
- Bai et al., 2022：[Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/abs/2212.08073)
- Touvron et al., 2023：[Llama 2: Open Foundation and Fine-Tuned Chat Models](https://arxiv.org/abs/2307.09288)
- Ahmed et al., 2019：[Understanding the impact of entropy on policy optimization](https://proceedings.mlr.press/v97/ahmed19a.html)
- Ghasemipour et al., 2020：[A Divergence Minimization Perspective on Imitation Learning Methods](https://proceedings.mlr.press/v100/ghasemipour20a.html)
- OpenAI Spinning Up：[Key Concepts in RL](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html)、[Kinds of RL Algorithms](https://spinningup.openai.com/en/latest/spinningup/rl_intro2.html)、[Policy Optimization](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html)

### 工程口径

- Hugging Face TRL：[GRPO Trainer](https://huggingface.co/docs/trl/grpo_trainer)、[PPO Trainer](https://huggingface.co/docs/trl/ppo_trainer)
- NVIDIA Megatron Core：[Parallelism Strategies Guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)
