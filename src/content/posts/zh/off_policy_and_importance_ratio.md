---
title: 'LLM RL 中数据复用引发的 off-policy 问题与解决方法'
date: 2026-06-10
tags:
  - LLM
  - RL
  - Off-policy
  - Importance Ratio
categories: ['note', 'ai', '大模型']
knowledge: ['ai/llm/rl']
maturity: 基础
lang: zh
---

## 概要

从算法的核心假设看，PPO 和 GRPO 通常被视为 on-policy 或 near on-policy 方法：用于更新模型的数据，应该来自当前正在训练的策略，或者至少不能离当前策略太远。

但是，在 LLM RL 训练里一次rollout 很贵：模型需要针对一批 prompt 逐 token 生成回答，再计算 reward、advantage，然后才能更新。直觉上，这就像模型刚做完一套模拟试卷，我们自然会想：

```text
这套卷子能不能别只订正一次？
能不能存下来，多复习几遍？
```

这个想法对应到训练里，就是复用旧 rollout。但一旦复用旧 rollout，就会遇到 off-policy 问题。

原因很简单：

```text
旧 rollout 记录的是旧模型当时的行为。
但复用它时，模型可能已经更新过，变成了新模型。
```

旧模型当时会犯的错误，新模型可能已经不会犯了。旧模型当时很偏好的 token，新模型现在可能已经不偏好了。如果还把旧 rollout 当成当前模型刚刚生成的数据来训练，就会产生偏差。

Importance ratio 的作用，就是衡量旧 rollout 对当前模型来说还是否“像自己会生成的数据”。

## On-policy 的基本逻辑

以 GRPO 为例，最简单的 on-policy 流程是：

```text
当前模型生成 G 个回答
-> 计算 reward
-> 同一个 prompt 的 G 个回答互相比较，得到 advantage
-> 用这批 rollout 更新当前模型
-> 用完丢掉
```

例如一个 Countdown prompt：

```text
数字：1, 2, 3, 4
目标：24
```

模型生成 4 个回答：

```text
A1 正确 reward = 1
A2 错误 reward = 0
A3 错误 reward = 0
A4 正确 reward = 1
```

组内平均 reward 是 0.5。

可以粗略理解为：

```text
A1 / A4 比平均好 -> advantage > 0
A2 / A3 比平均差 -> advantage < 0
```

训练目标就是：

```text
advantage > 0 的回答：提高概率
advantage < 0 的回答：降低概率
```

在最简实现里，核心思想接近：

```text
log_prob * advantage
```

也就是用整条 response 的 advantage 去推动 response 内每个生成 token 的 log probability。

## 为什么 on-policy 可以近似不需要 ratio

如果流程是：

```text
模型 pi_theta 生成 rollout
马上用这批 rollout 更新一次
然后丢掉
```

那么在这次更新刚开始时：

```text
生成 rollout 的模型
正在计算 loss 的模型
```

基本就是同一个模型。

所以可以近似认为：

```text
pi_current ≈ pi_behavior
```

这时：

```text
pi_current / pi_behavior ≈ 1
```

因此，最简 on-policy 实现可以不显式计算 importance ratio。

如果每批 rollout 只用一次，而且生成后立刻更新，ratio 近似就是 1。

## Off-policy 问题从哪里来

问题出现在你想提高数据利用率的时候。比如：

```text
step 10 生成一批 rollout
step 10 更新一次
step 11 再用这批 rollout 更新一次
step 12 又从 replay buffer 里拿出来更新一次
```

如果要复用同一批 rollout，通常会保存：

```text
prompt tokens
response tokens
reward
advantage
old_logprob
```

其中：

```text
response tokens 不变
reward 不变
advantage 通常不变
old_logprob 不变
new_logprob 每次更新时重新计算
ratio 每次更新时重新计算
```

举个例子。

step 10 的模型参数是 `theta_0`，它生成了一批 rollout。生成时保存的 `old_logprob` 来自 `theta_0`。

更新完后，模型变成 `theta_1`。

如果第二次还要用同一批 rollout，就要用 `theta_1` 对同样的 response tokens 重新计算：

```text
new_logprob = theta_1 对旧 response tokens 的 logprob
ratio = exp(new_logprob - old_logprob)
```

注意，`old_logprob` 仍然是 `theta_0` 的，不会变；会变的是当前模型、`new_logprob` 和 `ratio`。

所以，同一批 rollout 多次更新时，真正被复用的是旧回答、旧 reward、旧 advantage 和旧 logprob；每次重新计算的是当前模型对这些旧 token 的概率。

这时 rollout 是旧模型生成的：

```text
pi_old
```

但当前被训练的是新模型：

```text
pi_new
```

也就是说：

```text
数据来自 pi_old
更新发生在 pi_new
```

这就是 off-policy。

如果不做任何校正，就等于假装：

```text
这些旧回答仍然像是当前模型刚刚生成的一样。
```

但这不一定成立。模型更新几步后，当前 policy 可能已经不太会生成那些旧 token 了，也可能已经比旧 policy 更偏好它们。

## Importance ratio 是什么

假设旧模型生成某个 token 的概率是：

```text
pi_old(token) = 0.10
```

当前新模型对同一个 token 的概率是：

```text
pi_new(token) = 0.20
```

那么 importance ratio 是：

```text
ratio = pi_new(token) / pi_old(token)
      = 0.20 / 0.10
      = 2.0
```

这个 2.0 表示：

```text
新模型比旧模型更容易生成这个 token。
```

如果：

```text
pi_old(token) = 0.10
pi_new(token) = 0.01
ratio = 0.1
```

表示：

```text
新模型现在已经不太倾向于生成这个 token。
```

所以 ratio 在问一个很具体的问题：

```text
旧 rollout 里的这个 token，在当前模型眼里还合理吗？
```

代码里通常用 logprob 计算：

```python
ratio = exp(new_logprob - old_logprob)
```

因为：

```text
exp(log pi_new - log pi_old) = pi_new / pi_old
```

## Advantage 和 ratio 分别管什么

这两个概念容易混在一起，但它们分工不同：

```text
advantage 管方向。
ratio 管这条旧数据现在还能不能按原力度学。
```

advantage 的含义：

```text
advantage > 0：这个回答比同组平均好，应该鼓励。
advantage < 0：这个回答比同组平均差，应该惩罚。
```

ratio 的含义：

```text
ratio 接近 1：旧数据和当前模型还比较匹配。
ratio 很大：当前模型已经比旧模型更偏好它。
ratio 很小：当前模型已经远离它。
```

所以可以这样记：

```text
advantage 决定往哪推。
ratio 决定这次推的依据还新不新鲜。
```

## 为什么不能直接使用裸 ratio

裸 ratio 很容易爆。

例如：

```text
pi_old = 0.001
pi_new = 0.1
ratio = 100
```

如果直接用：

```text
ratio * advantage
```

这一个 token 就可能产生极大的梯度。

如果这个 token 刚好是噪声，问题更严重：噪声也会被 100 倍放大。

即使这个回答是正确的，也不代表其中每个 token 都应该被极大力度奖励。正确回答里可能包含废话 token、格式 token、套话 token。裸 ratio 会把它们一起强推。

所以 PPO/GRPO 通常使用 clipped ratio：

```text
clip(ratio, 1 - eps, 1 + eps)
```

如果：

```text
eps = 0.2
```

ratio 会被限制在：

```text
[0.8, 1.2]
```

这不是为了否认正确回答，而是为了避免旧数据对新模型产生过猛的更新。

## PPO/GRPO clipped objective 的直觉

常见形式是：

```python
ratio = exp(new_logprob - old_logprob)

loss1 = ratio * advantage
loss2 = clip(ratio, 1 - eps, 1 + eps) * advantage

loss = -min(loss1, loss2)
```

直觉是：

```text
如果回答好，模型可以更喜欢它，但不能一下喜欢过头。
如果回答坏，模型可以远离它，但不能一下打压过头。
```

clip 的作用不是判断 token 是否真的有用，而是限制更新幅度。

可以把它理解成：

```text
clip 是限速器，不是裁判。
```

## Token-level ratio 与 sequence-level ratio

不是所有 LLM 训练都有 ratio。

例如：

```text
SFT：没有 pi_new / pi_old 这种 ratio。
DPO：不是典型 PPO token-level ratio 形式。
```

ratio 主要出现在 PPO/GRPO/GSPO 这类基于 rollout 的 RL 训练中。

即使在 RL 里，ratio 也有不同粒度：

```text
token-level ratio
sequence-level ratio
trajectory-level ratio
```

token-level ratio 是：

```text
每个 token 单独计算 pi_new / pi_old
```

sequence-level ratio 是：

```text
整条 response 算一个总 ratio
```

形式上是：

```text
seq_logratio = sum(new_logprob_t - old_logprob_t)
seq_ratio = exp(seq_logratio)
```

长序列下，sequence-level ratio 很容易变得极大或极小，所以需要更谨慎的设计。GSPO 这类方法会强调 sequence-level ratio / sequence-level clip，但它不是简单把 token ratio 连乘就完事。

对从 on-policy 扩展到多 epoch 或 recent replay 的训练来说，token-level clipped ratio 通常是更容易落地的第一步。

## 总结

可以用三句话记住：

```text
Off-policy 问题来自：旧模型生成的数据，被新模型继续拿来训练。
Importance ratio 衡量：旧数据在当前新模型下还像不像自己会生成的。
Clipping 控制：旧数据即使能复用，也不能把当前模型推得太猛。
```

最实用的理解是：

```text
单次 on-policy 更新：ratio 可以近似看成 1。
多 epoch / replay 复用：需要 old_logprob + ratio/clip。
token-level clipped ratio 是稳妥的起点。
```

