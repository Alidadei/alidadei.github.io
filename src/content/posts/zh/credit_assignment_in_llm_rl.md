---
title: 'LLM RL 中的 Credit Assignment 问题'
date: 2026-06-22
tags:
  - LLM
  - RL
  - Credit Assignment
categories: ['note', 'ai', '大模型']
knowledge: ['ai/llm/rl']
maturity: 基础
lang: zh
---

## 概要

`Credit assignment` 可以翻译成：

```text
奖励到底该算到谁头上？
错误到底该怪谁？
```

在 LLM RL 里，一个常见问题是：

```text
reward 往往只告诉我们整条回答好不好，训练时模型需要更新每一个 token 的概率。
但是一个回答由很多个token组成，到底是哪个token在起作用？
该如何把奖励尽量正确地分配到token上去？
```

这就是 credit assignment 的核心课题。

## 一个最小例子

假设有两条回答。

回答 A：

```text
让我想想。先试试看。最终答案是 <answer>(3+1)*(4+2)</answer>
```

回答 B：

```text
<answer>(3+1)*(4+2)</answer>
```

两条回答最终答案都正确：

```text
reward = 1
```

如果 reward 只看整条 response 是否正确，那么 A 和 B 都会被认为是好回答。

但从人类视角看：

```text
A 有一些废话 token。
B 更简洁，几乎全是关键答案。
```

如果训练系统只知道：

```text
A 正确
B 正确
```

它就很难知道：

```text
A 里的“让我想想。先试试看。”其实不是关键贡献。
```

这就是 credit assignment 问题。

## 在 LLM RL 里，“动作”是什么

在传统强化学习里，credit assignment 通常问的是：

```text
哪些 action 导致了最后的 reward？
```

在 LLM 生成里，action 可以理解成：

```text
每一步生成的 token。
```

模型不是一次性生成整段文本，而是逐 token 生成：

```text
token_1
token_2
token_3
...
token_T
```

如果最后整条回答 reward = 1，训练时就要问：

```text
这 T 个 token 里，哪些真的应该被奖励？
哪些只是碰巧出现在正确回答里？
```

如果最后 reward = 0，也要问：

```text
这 T 个 token 里，哪些真的导致错误？
哪些其实是合理的中间步骤？
```

这个问题通常很难回答。

## Response-level reward 为什么会粗糙

很多 LLM RL 任务使用 response-level reward。

也就是：

```text
整条回答正确 -> reward 高
整条回答错误 -> reward 低
```

在 GRPO/PPO 里，这个 reward 会进一步变成 response-level advantage。

也就是说：

```text
一条 response 一个 advantage。
```

如果一条 response 的 advantage 是正的：

```text
这条 response 里的所有生成 token 都被鼓励。
```

如果一条 response 的 advantage 是负的：

```text
这条 response 里的所有生成 token 都被惩罚。
```

问题是：

```text
整条 response 正确，不代表每个 token 都值得奖励。
整条 response 错误，不代表每个 token 都是错的。
```

## 正确回答里的废话为什么会被奖励

因为 reward 只告诉模型：

```text
这条完整 response 是好的。
```

它没有告诉模型：

```text
好是因为最后 20 个 token 的表达式正确。
前面 100 个 token 没什么贡献。
```

所以模型会把功劳分给整条 response。

这就像一个团队项目成功后，全员一起拿奖金：

```text
有人做了核心算法。
有人写了关键代码。
有人开会说了很多废话。
最后项目成功，全员奖金。
```

系统不知道谁贡献最大，于是粗暴地把信用分给所有人。

LLM RL 里也一样：

```text
回答正确 -> 整条 response 都被奖励。
```

这会导致模型学到一些并不真正必要的模式。

## 错误回答里的好 token 也可能被惩罚

credit assignment 不只会错误奖励废话，也会错误惩罚好 token。

例如：

```text
回答用了所有数字。
表达式格式合法。
中间一部分计算也合理。
但最后一步算错了。
```

如果 reward 只看最终答案：

```text
reward = 0
advantage < 0
```

那么整条回答里的所有 token 都可能被压低。

这包括那些本来合理的 token。

所以 response-level reward 会同时带来两类错误归因：

```text
正确回答里的无关 token 被奖励。
错误回答里的有用 token 被惩罚。
```

## Importance ratio 和 clip 能不能解决 credit assignment

不能彻底解决。

在 off-policy 或 multi-epoch 更新里，我们可能会使用：

```text
clipped ratio * advantage
```

clip ratio 的作用是：

```text
限制某些 token 被更新得太猛。
```

例如某个废话 token 的 ratio 已经很大：

```text
ratio = 3.0
advantage > 0
```

如果不用 clip，它会被很强地继续推高。

clip 可以把更新限制住：

```text
ratio 最多按 1.2 之类的值算。
```

但 clip ratio 并不知道：

```text
这个 token 是废话还是关键表达式。
```

所以：

```text
clip 是限速器，不是判官。
```

它能降低错误归因造成的伤害，但不能直接解决 credit assignment。

## 缓解 credit assignment 的常见方法

### 缩短输出，减少无关 token

如果系统无法精确判断哪些 token 有用，一个实用做法是：

```text
减少无关 token 的数量。
```

例如要求模型只输出：

```text
<answer>表达式</answer>
```

这样即使整条回答都被奖励，大部分 token 也更接近关键答案。

这不是更聪明地分配信用，而是减少需要分配信用的对象。

### 加长度惩罚

如果正确回答无论长短都拿满分，模型可能学会：

```text
多说废话也没坏处。
```

可以把 reward 改成：

```text
正确且简洁：最高分
正确但冗长：稍低分
错误：低分
```

这样 B 这种简洁回答会比 A 更值得学。

对于 Countdown 任务，这尤其自然：

```text
最终表达式正确
用词更短
格式更干净
```

应该比冗长解释更好。

### 格式奖励与格式惩罚

可以奖励：

```text
有且只有一个 <answer>...</answer>
表达式可解析
answer 后没有额外内容
```

可以惩罚：

```text
标签外大量废话
多个答案
无法解析
无关长输出
```

这会让 reward 更贴近我们真正想要的行为。

### 过程奖励

如果能判断中间步骤是否合理，可以给更细粒度的 reward。

例如：

```text
表达式合法：加分
使用了所有数字：加分
每个数字只用一次：加分
计算结果接近目标：加分
最终等于目标：加分
```

这样模型不只在最后拿一个总分，而是在多个方面获得反馈。

但过程奖励要谨慎设计。

如果奖励项设计错了，模型可能会优化代理指标，而不是优化真正目标。

### 只训练 answer span

如果任务真正关心的是：

```text
<answer>...</answer> 内的表达式
```

可以考虑只让 answer span 参与 policy loss，或者降低 answer 外 token 的 loss 权重。

例如：

```text
answer 内 token：正常 loss 权重
answer 外 token：较低 loss 权重或不参与 policy loss
```

这能直接减少废话 token 被强化的问题。

但这也会改变训练目标，需要单独做实验验证。

## 总结

可以用三句话记住：

```text
Credit assignment 是奖励/惩罚该分给哪些动作的问题。
在 LLM 里，动作就是每一步生成的 token。
如果 reward 只给整条 response，一个正确回答里的废话 token 也会被奖励。
```

最关键的理解是：

```text
整条回答正确，不代表每个 token 都值得奖励。
整条回答错误，不代表每个 token 都应该被惩罚。
```

所以如果想让训练更高效，不能只调学习率或 ratio。

还要让 reward 更接近真正目标：

```text
正确
简洁
可解析
只在 answer 区域输出关键表达式
```

