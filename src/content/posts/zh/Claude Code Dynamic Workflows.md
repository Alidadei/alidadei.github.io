---
title: 'Claude Code Dynamic Workflows：从对话式 Agent 到可观测复现的执行编排'
date: 2026-07-04
tags:
  - Claude Code
  - AI Agent
  - Agent 编排
  - Dynamic Workflows
categories: ['practice']
knowledge: ['ai/llm/agent']
maturity: 当下热点
lang: zh
---


## 简介

Claude Code 的 Dynamic workflows，本质上是让agent把一个任务编排逻辑程序化的机制：


```text
用户任务
  -> Claude agent 生成 JavaScript workflow 脚本编排接下来的任务执行
  -> workflow runtime 执行脚本
  -> 脚本通过 agent()/pipeline() 调度多个 subagents
  -> subagents 分别搜索、修改、验证、汇报
  -> workflow 汇总结果并返回给主会话
```

它解决的是一个很具体的问题：当任务变大以后，只靠主 Claude 在对话里一轮一轮地决定“接下来派哪个 agent、读哪个文件、验证哪个结论”，会变得低效、难复用、难恢复，也容易污染主上下文。

Dynamic workflows 的做法是：把这套编排逻辑写成一个可执行脚本，让脚本持有循环、分支、中间状态和 agent 调度逻辑。

换句话说，它把“agentic workflow”从隐式对话过程，变成了显式程序。

## 什么时候触发

从官方文档能确认的触发方式有三类。

**第一类是用户显式触发**。你可以在 prompt 里直接说 `use a workflow`、`run a workflow`，或者使用关键词 `ultracode`。Claude Code 会把这类请求视为 opt-in，然后让 Claude 为当前任务写 workflow 脚本，而不是在主对话里一轮轮执行。

**第二类是会话级自动触发**。用户可以设置：

```text
/effort ultracode
```

开启后，Claude 会对每个“实质性任务”自行判断是否需要规划 workflow。官方文档举的情况是：一个请求可能连续触发多个 workflow，比如先用一个 workflow 理解代码，再用一个 workflow 修改代码，最后用一个 workflow 验证结果。

**第三类是运行已经存在的 workflow**。比如 Claude Code 内置的 `/deep-research <question>`，或者用户之前保存到 `.claude/workflows/`、`~/.claude/workflows/` 的 workflow 命令。

至于“有没有一段专门教模型何时写、怎么写 workflow 的内部 prompt”，官方文档没有公开这段系统提示词或完整规划提示。

## 和普通 subagent 的区别

普通 subagent 模式里，主 Claude 是调度者。它看上下文、决定下一步、派一个或多个 worker，等 worker 返回以后再继续思考。

Dynamic workflow 里，调度者变成了 workflow 脚本。

区别可以这样看：

| 机制 | 谁持有计划 | 状态放在哪里 | 适合什么 |
| --- | --- | --- | --- |
| 普通对话 | 主 Claude | 主上下文 | 小任务、探索性任务 |
| subagents | 主 Claude | 主上下文 + worker 上下文 | 并行搜索、并行审查 |
| skills | 预置说明 | 主上下文 | 稳定、可复用的操作规范 |
| dynamic workflows | JavaScript 脚本 | workflow runtime + agent 结果 | 大规模、多阶段、可恢复任务 |

关键差异并非“能不能并行”，而是“编排逻辑是否被外部显化成一段可读的程序”。

## 为什么需要 Dynamic workflows

Claude Code 官方文档把 agent loop 描述为一个循环：收集上下文、执行动作、验证结果，然后继续循环直到任务完成。

这个 loop 对普通任务很好用，但大任务会遇到三个问题。

**第一，主上下文容易被污染。**

这个是老生常谈的问题了，大量工具调用结果、报错、日志和中间判断等内容会污染主 Claude agent 的上下文，当然这个问题直接用subagent就能解决，所以这并非Dynamic workflows的重点，Dynamic workflows的重点是如何编写一个脚本来编排这些subagents工作。

**第二，调度过程难复用。**

如果一次审计需要“列出文件 -> 每个文件单独审计 -> 去重 -> 交叉验证 -> 修正”，这其实已经是一套流程。如果每次都靠自然语言重新走一遍，成本高，也不稳定（不可复现）。

**第三，长任务需要可观测和可恢复。**

一个任务派出几十个 agents 后，用户需要知道当前在哪个阶段、跑了多少 worker、哪些失败了、token 用了多少、是否能暂停和恢复。普通对话式调度很难提供这些工程能力。

Dynamic workflows 的设计就是把这些需求直接放到 runtime 层进行解决，如下图所示，可以清晰的看到总体的任务规划、每一步的执行流程和进度：

![Dynamic workflows 的 /workflows 视图：展示总体任务规划、每一步执行流程和进度](/images/posts/img_v3_02132_ff1615e5-714f-4916-b034-11f5323d343g.jpg)

## 脚本长什么样

官方文档显示，保存后的 workflow 是一个 JavaScript 文件，通常包含 `meta` 和脚本主体。

一个简化形态大概是这样：

```js
//meta：简要描述workflow的名字、作用等
export const meta = {
  name: 'audit-routes',
  description: 'Audit route handlers for missing auth checks',
}
//正式的编排流程
const found = await agent('List every route handler file.', {
  schema: {
    type: 'object',
    required: ['files'],
    properties: {
      files: { type: 'array', items: { type: 'string' } },
    },
  },
})

const audits = await pipeline(found.files, file =>
  agent(`Audit ${file} for missing authentication checks.`, {
    label: file,
  }),
)

return audits.filter(Boolean)
```

这里有几个设计点值得注意：

- `agent()` 是核心原语，用来启动一个 subagent。
- `pipeline()` 用来对列表做批处理，常见于“每个文件一个 worker”。
- `schema` 用来约束 agent 的返回结构，减少后续解析的不确定性。
- 脚本可以包含循环、条件分支、重试、聚合、过滤等普通程序逻辑。

这就是它和“提示词工作流”的根本区别：prompt 只能描述流程，workflow 脚本可以执行流程。

## 运行时怎么设计

根据官方文档，workflow runtime 有几个重要边界：

- workflow 脚本在隔离环境中执行，独立于主 conversation。
- 脚本本身没有直接文件系统或 shell 权限。
- 读写文件、执行命令等副作用由被调度的 agents 完成。
- runtime 会跟踪每个 agent 的结果，因此同一会话内可以暂停、恢复、重启 agent。
- `/workflows` 视图可以查看 phase、agent 数、token、耗时、prompt、工具调用和结果。
- 当前并发上限是最多 16 个 agents，单次 run 的总 agent 上限是 1000。

这套设计可以抽象成下面的架构：

```text
User prompt
  |
  v
Claude planner
  |
  | generates workflow script
  v
Approval gate
  |
  v
Workflow runtime
  |-- run JS script
  |-- store workflow state
  |-- enforce concurrency limit
  |-- expose agent()/pipeline()
  |
  +--> Subagent A -> tools -> permission/sandbox -> result
  +--> Subagent B -> tools -> permission/sandbox -> result
  +--> Subagent C -> tools -> permission/sandbox -> result
  |
  v
Aggregate / verify / reduce
  |
  v
Final response
```

注意这里的安全边界：不是让 JavaScript 脚本任意访问本机，而是只暴露受控 API。真正有副作用的操作仍然走 agent 工具调用和权限系统。

## 安全权限

Dynamic workflows 如果没有权限边界，会非常危险。因为它天然会放大操作规模：一个脚本可能派出几十个 agents，同步修改大量文件或执行大量命令。

官方文档中的关键点是：

- workflow 启动前通常会有计划审批，具体取决于 permission mode。
- spawned subagents 以 `acceptEdits` mode 运行，并继承用户的 tool allowlist。
- 不在 allowlist 里的 shell、web fetch、MCP tools 等仍可能触发 permission prompt。

这说明 Claude Code 并没有把 workflow 设计成“万能脚本执行器”。它更像是一个受控编排层：脚本负责组织工作，工具权限负责约束副作用。

这是实现类似系统时必须保留的边界。否则 dynamic workflow 很容易变成自动化事故放大器。

## 为什么叫 dynamic

这里的 dynamic 至少有三层含义。

第一，workflow 可以由 Claude 按当前任务生成，而**不是人预先写死**。

第二，**可以根据中间结果动态改变后续执行路径**。例如发现某类错误特别多，就追加一轮专项审查；如果 typecheck 已经通过，就提前停止。

第三，**subagent 数量和任务拆分方式可以跟随任务规模变化**。小仓库可能派 5 个 agents，大仓库可能按目录、文件类型或风险等级分批派发。

所以它不是传统意义上的固定 DAG。传统 DAG 强在稳定、可预测；dynamic workflow 强在根据现场任务动态生成显式的编排程序。

## 适合什么场景

Dynamic workflows 特别适合以下任务：

- 代码库级安全审计。
- 大规模重构或迁移。
- 批量检查同类文件。
- 多来源研究和交叉核验。
- “修复 -> 跑检查 -> 继续修复”的循环任务。
- 需要沉淀成可复用 slash command 的团队流程。

不太适合：

- 很小的单文件修改。
- 每一步都需要用户人工判断的任务。
- 多个 worker 会频繁改同一批文件的任务，除非配合 worktree、锁或分阶段合并。
- 对 token 成本极其敏感的任务。（目前来看**这个机制是很消耗token的**！上下文干净的代价就是会丢失不少缓存命中）

## 如何借鉴

如果要在自己的 agent 系统里借鉴 Claude Code Dynamic workflows，我认为这些模块值得借鉴：

**Workflow planner**

构建workflow的大脑，需要接收用户任务、仓库上下文、可用工具、权限策略和预算，让模型生成 workflow plan。

**Workflow runtime**

runtime 负责执行 workflow，它需要做：

- 并发队列。
- 状态持久化。
- 暂停、恢复、取消。
- agent 结果存储。
- token 和成本统计。
- 错误重试。
- 日志和可观测性。

**Agent worker manager**

每个 子 `agent()` 应该启动一个隔离 worker session。

worker 需要有自己的：

- 上下文窗口。
- 系统提示。
- 工具权限。
- 模型配置。
- 结果 schema。

如果 worker 会修改代码，还需要考虑文件锁、分支隔离或 git worktree，否则并发编辑容易互相覆盖。

**Permission and sandbox layer**

workflow 脚本不应该直接拿到 shell 和文件系统权限。

所有副作用都应该通过工具调用发生，并经过：

- allow / deny / ask 规则。
- 沙箱。
- 审计日志。
- 高风险命令拦截。

这是 dynamic workflow 能否安全落地的核心。

**Verification pattern library**

很多 workflow 模式可以沉淀成库：

- `fan-out -> collect -> dedupe -> rank`
- `generate -> critique -> revise`
- `fix -> run check -> repeat until pass`
- `researchers -> cross-check -> cited synthesis`
- `migrate -> compile -> targeted repair`

这样模型不需要每次从零设计流程，只需要选择和组合成熟 pattern。

## 个人思考

Claude Code Dynamic workflows 把 LLM 的弹性规划能力和工程系统的runtime约束结合了起来，其价值不是“并行多个 agents”，而是 agent 任务编排从不可见、不可复用的对话，变成了可见、可保存、可审阅的程序。这也说明了当前 agent 产品形态的一个演变趋势：随着现在的任务变长变大，用户越来越需要一个可靠并且可控的执行系统——而显式的执行代码显然要比纯黑箱式的LLM任务编排要靠谱稳定得多。

对于用户来说，Dynamic workflows 能帮助你把一段文字描述的工作流程沉淀成显式的执行程序，同时快速复用已有的编排流程并稳定复现。从工作效果上来说，无疑更加可靠和可信。

最后，我认为Dynamic workflows 可以进一步和 Static workflows 相结合：Dynamic workflows 在任务编排的层面通过工程约束来增加稳定性和可靠性，而 Static workflows 则可以在任务执行的层面进一步增强稳定性并极大地节省token（完全确定的工作直接沉淀为可执行函数而非派遣subagent去做）。最近我也正在推进这个工作，将动态和静态workflow相结合来实现全自动的数据处理！

## 参考资料

- Claude Code Dynamic workflows：https://code.claude.com/docs/en/workflows
- Claude Code How it works：https://code.claude.com/docs/en/how-claude-code-works
- Claude Agent SDK agent loop：https://code.claude.com/docs/en/agent-sdk/agent-loop
- Claude Code subagents：https://code.claude.com/docs/en/sub-agents
- Claude Code parallel agents：https://code.claude.com/docs/en/agents
- Claude Code changelog Week 22：https://code.claude.com/docs/en/whats-new/2026-w22
- Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems：https://arxiv.org/abs/2604.14228
