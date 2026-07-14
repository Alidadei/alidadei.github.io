---
title: 'Claude Code Dynamic Workflows：coding agent 用显式程序来动态编排workflow的范式'
date: 2026-07-04
tags:
  - Claude Code CLI
  - AI Agent
  - Agent 编排
  - Dynamic Workflows
categories: ['practice']
knowledge: ['ai/llm/agent']
maturity: 当下热点
lang: zh
---


## 简介

我们一般提起‘workflow’通常指的是静态workflow：即‘先A后B再C’这样的一段固定流程，主要是将一段机械执行流程进行自动化，没有太多灵活变通的地方。而Claude Code 提出的 Dynamic workflows，是让coding agent把一个任务编排逻辑进行程序化，但是具体每个节点的执行还是由每个subagent进行自主判断：


```text
用户任务
  -> Claude agent 生成 JavaScript workflow 脚本编排接下来的任务执行
  -> workflow runtime 执行脚本
  -> 脚本通过 agent()/pipeline() 调度多个 subagents
  -> subagents 分别搜索、修改、验证、汇报
  -> workflow 汇总结果并返回给主会话
```

它针对的问题是：当任务变长变大以后通常需要派遣多个subagent来拆分完成，如果只靠一个主 agent 在对话里一轮一轮地决定“接下来派哪个 agent、读哪个文件、验证哪个结论”，会变得低效、难以复用，同时也容易污染主上下文。

Dynamic workflows 的做法是：让主agent事先把这套编排逻辑写成一个可执行脚本，让这个脚本去维护整个workflow的循环、分支、中间状态和 agent 调度逻辑。

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

## 和普通 subagent 调度的区别

Claude Code Dynamic workflows 官方文档把 workflow 定义为： **Claude 为任务写出的 JavaScript 计划脚本，并由 workflow runtime 在后台执行。**

文档明确区分了 subagents调度 和 dynamic workflows：subagents调度模式 是由 主agent 在主对话里 turn by turn 决定下一步，而 dynamic workflows 是 由主agent事先写好的script 来决定下一步；并且由这个 workflow script 自己维持整个任务的 loop、branching 和 intermediate results。

| 机制 | 谁持有计划 | 状态放在哪里 | 适合什么 |
| --- | --- | --- | --- |
| 普通对话 | 主 Claude | 主上下文 | 小任务、探索性任务 |
| subagents | 主 Claude | 主上下文 + worker 上下文 | 并行搜索、并行审查 |
| dynamic workflows | JavaScript 脚本 | workflow runtime + agent 结果 | 大规模、多阶段、可恢复任务 |

## 为什么叫 dynamic

dynamic并不是说在运行中能够随意修改整段编排脚本，官方没有说明 runtime 会在执行中让 Claude 改写整段脚本并继续执行。

“dynamic”主要指的是下面两种含义：

**第一，动态生成**

workflow 脚本不是人预先写死的固定 DAG，而是 Claude 根据即时任务、代码库上下文和用户要求现场生成的。比如：同样是“审计代码”，小项目的dynamic workflow可能生成一个简单的文件级扫描流程，大项目则会先按目录拆分，再派多个 subagents 并行审计。

**第二，动态执行**

脚本中的条件判断和执行路径可以依赖 subagent 的执行或判断结果，而非单纯的规则条件，例如：

```js
const result = await agent('Run typecheck and summarize errors') //让subagent判断是否有错误需要修复

if (result.hasErrors) { //假如subagent检测出了错误
  await pipeline(result.errorFiles, file =>
    agent(`Fix type errors in ${file}`) //派遣agent去修复
  )
} else {
  return 'typecheck already passed'
}
```

在这里，是否进入修复阶段，取决于前一个 agent 的检查结果，这就是执行时的动态性。

再比如：

```js
let previousCount = 0

for (let round = 0; round < 5; round++) {
  const findings = await pipeline(files, file =>
    agent(`Find security issues in ${file}`) //派遣subagent寻找安全issues，并通过findings传递信息
  )
//如果连续一轮agent没有新发现，workflow 就提前停止；如果仍有新发现，就继续下一轮
  const unique = dedupe(findings)
  if (unique.length === previousCount) {
    break
  }

  previousCount = unique.length
}
```

官方文档中的示例任务也包含许多类似的表达，比如：让subagent“持续修复直到 type check 通过”或者“连续两轮没有新发现就停止”。

## 为什么需要 Dynamic workflows

Claude Code 官方文档把 agent loop 描述为一个循环——收集上下文、执行动作、验证结果，然后继续循环直到任务完成，这个 loop 对单一的小任务很好用，但遇到大任务会出现三个问题：

**第一，主上下文污染。**

这是个老生常谈的问题，大量工具调用结果、报错、日志等一次性内容会污染主agent 的上下文，这个问题用subagent可以很好地缓解，但是如何编排好多个subagents进行长任务呢？总不能一直让主agent按照一份plan文档在那里手动派遣吧？这便是dynamic workflow针对的问题。

**第二，调度过程难复用。**

如果一次审计需要：“列出文件并分批 -> 每批次文件让一个subagent单独审计 -> 去重 -> subagent交叉验证 -> 修正”，这套流程如果每次都靠一个markdown文档中的自然语言约束agent重新走一遍，成本高，也很不稳定（不可复现）。

**第三，用户需要可观测性。**

一个任务派出几十个 agents 后，用户需要知道当前在哪个阶段、跑了多少 worker、哪些失败了、token 用了多少、是否能暂停和恢复。普通对话式调度很难提供这些工程能力。

Dynamic workflows 的设计就是把这些需求直接放到 runtime 层进行解决，如下图所示，可以清晰的看到总体的任务规划、每一步的执行流程和进度：

![Dynamic workflows 的 /workflows 视图：展示总体任务规划、每一步执行流程和进度](/images/posts/img_v3_02132_ff1615e5-714f-4916-b034-11f5323d343g.webp)

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

  这就是它和“提示词工作流”的根本区别：prompt 只能用自然语言描述流程，workflow 脚本可以直接执行流程。

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
