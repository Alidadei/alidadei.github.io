# ANSWER.md

当前对话仓库：alidadei.github.io

当前输出文件：answers/alidadei.github.io_ANSWER__Claude-Code控制器与Auto-Research__agent.md

当前 session：agent

## 暂存区

（空）

## 本轮回答区

# Claude Code 能否充当 Auto Research 控制器

## 先给结论

王，四个问题可以压缩成一个判断：

> **Agent 可以做语义决策器，Dynamic Workflow 可以做单次任务内的编排器；但要跨会话、跨崩溃、跨机器重启持续运行，真正的控制平面仍应是带持久化状态的普通程序。**

更具体地说：

| 问题 | 结论 |
|---|---|
| 让主 Agent 或 lead agent 做控制器 | 能，适合在一个有边界的阶段中动态判断、分派 subagent、诊断结果；不适合独自承担 24×7 的硬状态与硬预算 |
| 让 Dynamic Workflow 做控制器 | 能控制一次 workflow 内的循环、分支和 agent 编排；不适合作为跨 Claude Code session 的耐久控制器 |
| 非对话模式能否保留工具、上下文、memory、subagent、hook | 基本都能；不加 `--bare` 时与交互模式加载的环境接近。真正缺失的是可靠的人机询问与交互审批，另有进程生命周期差异 |
| 是否有现成 Auto Research 实现 | 有，而且至少分成网页深度调研、自动 ML 实验、端到端论文生产三类；若目标是夜间反复跑训练，当前最贴近的是 Karpathy `autoresearch` 的极简范式和 Deep Researcher Agent 的完整控制器实现 |

这里必须先区分两种“控制器”：

- **语义控制器**：看日志、解释指标、提出假设、选择下一项实验。这是 Agent 擅长的。
- **耐久控制平面**：保存 run 状态、持有训练进程、去重事件、执行 timeout、锁、重试、GPU 配额与总预算。这应由确定性程序负责。

如果把二者混为一谈，就会误以为“Agent 能决定下一步”等于“Agent 能可靠地守一整夜”。前者成立，后者只有在外部运行时替它提供可靠性协议后才成立。

## 1. 能否让 Agent 做控制器

### 可以，但应限定为“软控制器”

Claude Agent SDK 嵌入了与 Claude Code 相同的自主 agent loop：模型读取当前状态、调用工具、接收工具结果，再继续判断，直到返回最终结果。SDK 还能配置工具、权限、费用与 turn 上限。因此，一个主 Agent 完全可以完成以下控制逻辑：

1. 读取 campaign 状态和上一轮指标；
2. 判断结果是否可信，是否需要复跑；
3. 选择下一条假设；
4. 调用工具修改代码或配置；
5. 派生 subagent 做文献检索、代码审查或结果复核；
6. 输出结构化的 `next_action`。

这是官方 Agent SDK 明确支持的同一套循环，而不是模拟 Claude Code。[Agent SDK：agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)

若使用 agent team，lead agent 也可以监督若干 peer agent；若只是普通主 Agent，也可用 `Agent` 工具调度 subagent。Subagent 支持隔离上下文、并行执行、专用提示词和工具限制。[Agent SDK：subagents](https://code.claude.com/docs/en/agent-sdk/subagents)

### 为什么它不应独自成为“硬控制器”

原因不是 Agent 不够聪明，而是它的运行语义不等同于事务系统：

- 会话上下文会持续增长，接近窗口上限时自动压缩；早期细节可能被摘要替代。官方建议把持久规则放进 `CLAUDE.md`，但这仍是提供给模型的上下文，不是强制约束。[Agent SDK：automatic compaction](https://code.claude.com/docs/en/agent-sdk/agent-loop#automatic-compaction)
- Session 可以恢复完整对话历史，但只保存对话，不保存或回滚文件系统状态。[Agent SDK：sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- `CLAUDE.md` 与 auto memory 会跨 session 加载，但官方明确说二者是 context，不是 enforced configuration。真正必须禁止的操作应由权限规则或 `PreToolUse` hook 阻断。[Claude Code memory](https://code.claude.com/docs/en/memory)
- 模型输出有概率性。即使它说“预算还够”，也不能替代控制器对数据库中实际次数、GPU 小时和费用的计算。

所以推荐的角色划分是：

```text
外部 controller：是否允许继续、哪个 run 正在运行、超时与预算
Agent controller：下一步做什么、为什么做、怎样解释结果
```

### 如果坚持“Agent 就是控制器”，最低条件是什么

可以用 Agent SDK host 把它做成一个服务，但此时真正耐久的外壳仍是 host application。至少要有：

- 外部 SQLite/JSONL/数据库保存 campaign、run、event 和 decision；
- 每个事件具有唯一 ID，并能幂等重放；
- OS 进程监督器负责重启 host；
- 训练进程由 host 或独立 worker 持有；
- Agent 只返回通过 JSON Schema 校验的决策；
- timeout、最大 trial、最大费用和允许命令由程序硬执行；
- 保存 SDK session ID 只是优化上下文连续性，不能代替业务状态。

官方 SDK 支持恢复指定 session，也支持恢复进程退出前的对话；官方同时指出，把必要结果作为应用状态重新注入新 session，通常比搬运 transcript 更稳健。[Agent SDK：跨进程与跨主机恢复](https://code.claude.com/docs/en/agent-sdk/sessions#resume-across-hosts)

## 2. 能否让 Dynamic Workflow 做控制器

### 在单次运行内部：可以，而且比“让 lead agent 临场记计划”更像控制器

Dynamic Workflow 是由运行时执行的 JavaScript。官方对它与普通 Agent 的区别写得很明确：下一步由脚本决定，中间结果存放在脚本变量中，循环、分支和编排本身可以保存并复用；Claude 主上下文只接收最终结果。[Claude Code：Dynamic Workflows](https://code.claude.com/docs/en/workflows)

因此它适合控制这类有边界的阶段：

```text
并行提出 8 个假设
  → 4 个 reviewer 过滤
  → 2 个 verifier 查证
  → synthesizer 选择下一项实验
  → 若证据不足，再运行一轮；最多 3 轮
```

在这个范围内，Workflow 比主 Agent 自己在长上下文中维护任务表更可重复，也更不容易让大量中间结果挤占主对话。

### 跨 session 的 24×7 控制器：不合适

官方边界决定了它不能直接替代外部实验控制器：

- workflow script 本身不能直接访问文件系统或 shell；必须派 Agent 去读写和运行命令；
- 运行中不能请求普通用户输入，只有权限提示可能暂停；
- 最多 16 个并发 Agent、单次共 1,000 个 Agent；
- pause/resume 只在同一个 Claude Code session 内有效；退出 Claude Code 后，新 session 会从头启动该 workflow；
- 多 Agent workflow 可能显著增加 token 与费用。

这些都是当前官方文档列出的限制。[Dynamic Workflows：行为、恢复与费用](https://code.claude.com/docs/en/workflows#behavior-and-limits)

所以在 Auto Research 中，它最合适的位置是**一个可插拔的“研究委员会”**，而不是最外层 daemon：

```text
OS 服务 / 任务调度器
  └─ experiment-controller（持久状态与硬约束）
       ├─ training-worker（运行数小时，不调用 LLM）
       └─ 决策节点
            ├─ 单 Agent：普通、便宜的分析
            └─ Dynamic Workflow：高价值结果的多路复核与选题
```

还有一个版本陷阱：在线文档从 2.1.210 起规定，`-p`、普通 SDK 消息、定时任务或 webhook 中的 `ultracode` 关键词不会自动触发 workflow。自动化程序应显式调用保存好的 workflow command 或 Workflow tool，不能依赖关键词碰巧触发。[Dynamic Workflows：Where the keyword works](https://code.claude.com/docs/en/workflows#where-the-keyword-works)

本机实测 Claude Code 为 `2.1.190`，已经高于 Dynamic Workflow 的最低版本 `2.1.154`；但本机是否已经在 `/config` 中启用、当前账号或 provider 是否具备权限，仍需在实际运行前验证。在线文档中的 `ultracode` 自动编排还要求更高版本，因此不能把新版行为反推到本机。

## 3. 非对话模式与对话模式到底差多少

### 核心 Agent 能力差别小，运行外壳差别大

官方对 `claude -p` 的定义是：它使用与 Claude Code 相同的工具、agent loop 和上下文管理。非对话模式不是一个只会单轮补全文本的简化 API。[Claude Code：programmatic usage](https://code.claude.com/docs/en/headless)

| 能力 | 交互模式 | `claude -p`，不加 `--bare` | `claude -p --bare` | Agent SDK |
|---|---|---|---|---|
| 内置 Read/Edit/Bash 与 agent loop | 有 | 有 | 有 | 有 |
| 多 turn 工具调用与自动上下文压缩 | 有 | 有 | 有 | 有 |
| `CLAUDE.md` | 自动加载 | 自动加载 | 不自动加载，可显式传入配置或提示 | 通过 setting sources 加载 |
| auto memory | 自动加载 | 自动加载 | 跳过 | 取决于 setting sources / 配置 |
| hooks | 自动加载配置 | 自动加载配置 | 跳过自动发现，可用显式 settings | callback hooks；也可加载 settings 中的 shell hooks |
| skills、plugins、MCP | 自动发现 | 自动发现 | 跳过自动发现，可用显式参数加载 | 支持，需明确配置来源 |
| subagent / 自定义 agent | 有 | 有 | 可用 `--agents` 显式定义 | 原生支持，程序化定义是官方推荐方式 |
| Dynamic Workflow | 有 | 有，但无交互审批 | 可显式加载并调用 | 可调用；权限由 host 配置 |
| session continue/resume | 有 | `--continue` / `--resume` | 同样可用 | session ID、continue、resume、fork |
| 中途询问人类 | 有 | 没有可靠交互通道 | 没有 | 可由 host 实现 streaming input / approval callback |
| 结构化输出 | 可要求 | `json`、`stream-json`、JSON Schema | 同左 | 原生消息对象和 structured output |

官方说明，不加 `--bare` 时，`claude -p` 会加载与交互 session 相同的工作目录和 `~/.claude` 上下文，包括 hooks、skills、plugins、MCP、auto memory 与 `CLAUDE.md`。加上 `--bare` 后会跳过这些自动发现，但仍保留 Bash、文件读取和编辑工具，并能通过 `--settings`、`--mcp-config`、`--agents`、`--plugin-dir` 等参数显式恢复所需能力。[Programmatic usage：bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)

### 真正需要注意的四个差异

#### 1. 权限不能临场问人

`-p` 中没有终端用户替它批准工具。应提前配置 `--allowedTools` 或权限规则。`dontAsk` 会拒绝未在 allow rule 中的动作，`AskUserQuestion`、需要用户交互的 connector/MCP 工具即使匹配 allow rule 也会被拒绝；`acceptEdits` 只自动批准编辑和一部分常见文件操作，其他 shell 或网络动作仍可能导致运行中止。[Programmatic usage：permissions](https://code.claude.com/docs/en/headless#auto-approve-tools)

Agent SDK 比裸 `-p` 更适合自建控制器，因为 host 可以处理工具审批回调、流式输入、结构化消息和异常分类。不过无人值守运行仍应让所有必要权限在启动前可判定，不能把“等人点击”当作恢复策略。

#### 2. `--bare` 决定是否继承本机环境

- 想最大程度复用日常 Claude Code：不加 `--bare`。
- 想让 CI、服务器和不同电脑行为一致：使用 `--bare`，再显式加载经过版本控制的 settings、agents、plugins 和 prompts。

后者启动配置更确定；前者功能复用更方便，但会受个人 `~/.claude` 配置漂移影响。官方目前推荐脚本和 SDK 调用使用 bare mode，并提示它未来可能成为 `-p` 的默认行为。因此生产脚本不能长期依赖“当前默认会自动读到 memory 与 hooks”。

#### 3. session memory 不等于控制器状态

Session 能保存 prompt、工具调用、工具结果和回答，并用 ID 恢复；上下文达到上限时仍会压缩。`CLAUDE.md` 和 auto memory 可跨 session 提供长期知识。但以下数据仍应单独持久化：

- 当前 run 是否还活着；
- 该 event 是否已处理；
- 哪个 checkpoint 是可信基线；
- 已消耗多少 GPU 小时和预算；
- 某项失败是否已经重试过。

这些是业务真相，不应只存在于自然语言 transcript 或 auto memory 中。

#### 4. 后台进程生命周期不同

`claude -p` 返回最终结果并关闭 stdin 后，它启动的后台 Bash 进程大约五秒后会被终止。因此不能让一次 `claude -p` 启动三小时训练后先返回。后台 subagent 和 workflow 会被等待，因为其结果属于最终输出；当前默认等待上限为十分钟，可用环境变量调整。[Programmatic usage：background tasks at exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)

这再次说明：长训练应由外部 worker 持有，Claude 只在“要做决策”时被唤醒。

## 4. 有没有现成 Auto Research Agent

有，但“Auto Research”至少有三种不同产品目标，不能只按项目名字选择。

### A. 自动网页深度调研：Claude Code 自带 `/deep-research`

Dynamic Workflows 内置 `/deep-research <question>`：并行从多个角度搜索网页、抓取和交叉核验来源、对 claim 投票，最后生成带引用的报告。它要求 WebSearch 可用。[Dynamic Workflows：built-in deep research](https://code.claude.com/docs/en/workflows#bundled-workflows)

它适合回答“某项技术有哪些方案、官方资料是否相互印证”，但不负责长期训练、实验进程或 GPU 调度。

### B. 自动优化单个 ML 实验：Karpathy `autoresearch`

[karpathy/autoresearch](https://github.com/karpathy/autoresearch) 是最小、最清楚的 Auto Research 范式：Agent 只修改 `train.py`，每次训练固定五分钟，以 `val_bpb` 为唯一指标，改善就保留，否则丢弃，然后重复。仓库明确支持把 Claude、Codex 或其他 coding agent 指向 `program.md`。

优点：

- 单文件搜索空间、固定时间预算、单一指标，实验可比较；
- 代码很小，容易读懂并改造成自己的任务；
- MIT License。

局限：

- 默认面向单张 NVIDIA GPU，作者主要在 H100 上测试；
- 它更像实验协议和 Agent prompt，不是带数据库、租约、崩溃恢复和远程 worker 的生产控制平台；
- “关闭权限后让 Agent 持续运行”适合受控实验机，不应直接复制到装有重要凭据和文件的日常电脑。

若目标是先理解 Auto Research 的最小闭环，这是首选参考；若目标是 24×7 稳定运行，它只够做内核，不够做外壳。

### C. 24×7 深度学习实验运维：Deep Researcher Agent

[Xiangyue-Zhang/auto-deep-researcher-24x7](https://github.com/Xiangyue-Zhang/auto-deep-researcher-24x7) 是目前最贴近本文目标的现成实现。它有 Python `core.loop`，同时提供 Claude Code command 和 Codex skill，支持本地或 SSH GPU worker，并采用：

- leader-worker 架构；
- 训练阶段仅做进程检查与日志读取，不调用 LLM；
- 固定大小的双层 memory；
- `PROJECT_BRIEF.md`、临时 `HUMAN_DIRECTIVE.md` 和滚动 `MEMORY_LOG.md`；
- 试验 ledger、dead-end/insight journal、停滞检测、速率限制和安全 gate。

论文报告了 30+ 天部署、500+ 个 experiment cycle、四个并行项目等结果；这些数字来自作者论文和仓库，应视为**作者报告的运行记录**，不是我独立复现实验得出的结论。[Deep Researcher Agent paper](https://arxiv.org/abs/2604.05854)

它最值得借鉴的不是某个 prompt，而是“LLM 在 THINK/REFLECT 阶段工作，训练期间退出模型调用”的分层。仓库使用 Apache-2.0 License，适合作为原型起点；正式采用前仍应审计它的命令白名单、路径隔离、恢复逻辑以及 Windows/WSL/SSH 兼容性。

### D. 从想法到论文：AI Scientist v2

[SakanaAI/AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2) 会生成假设、运行实验、分析数据并写论文，使用 experiment-manager 管理渐进式 agentic tree search；相较 v1，它取消了对人工代码模板的依赖。[AI Scientist v2 paper](https://arxiv.org/abs/2504.08066)

它适合研究“端到端自动科学发现系统怎样设计”，却不是最轻量的训练 watcher。官方仓库自己也提醒：

- v2 在已有强模板时不一定优于 v1，开放式探索成功率更低；
- 它会执行 LLM 生成的代码，应放在 Docker 等隔离环境中；
- 主要面向 Linux、CUDA 和 NVIDIA GPU；
- 使用其自定义 Responsible AI 派生许可，不应按 MIT/Apache 项目理解许可边界。

因此它更适合隔离的研究沙箱，而不适合直接嵌进当前日常开发仓库充当 daemon。

### E. 多 Agent、带人工干预的端到端管线：AutoResearchClaw

[aiming-lab/AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw) 提供多 Agent debate、失败后的 Pivot/Refine、自愈执行、跨运行 lessons、HITL pause/attach/approve/guide、预算 guardrail 和 CLI/WebSocket/MCP adapter，目标也是从想法到论文。仓库为 MIT License。[AutoResearchClaw paper](https://arxiv.org/abs/2605.20025)

它比 Karpathy 方案完整得多，也复杂得多。论文在 2026 年 5 月才提交，属于很新的系统；其 benchmark、测试数量和效果首先是作者报告，不能据此直接推断它已达到通用生产成熟度。若需要论文生产和多阶段人工介入，可以评估；若只需夜间跑几十个训练 trial，采用它可能过重。

## 对当前需求的直接选择

如果王的目标仍是“训练运行几小时，完成后 Agent 分析结果并决定下一轮，整夜持续”，建议按以下顺序：

1. **先读并试跑 Deep Researcher Agent**，确认它是否已经覆盖你的 GPU、训练命令、指标解析和 SSH 环境。它是最接近需求的可运行基线。
2. **同时读 Karpathy `autoresearch`**，吸收其固定预算、单指标、keep/revert 和小搜索空间设计；这些约束比引入更多 Agent 更重要。
3. 若现成框架与你的实验格式不匹配，保留它的架构思路，自建一个小型 Python controller，并在决策节点调用 Agent SDK。
4. 只有在“同一个决策值得多路独立查证”时才调用 Dynamic Workflow，不要每个 trial 都开几十个 Agent。
5. 如果目标扩展成“检索文献—生成假设—做实验—写论文”，再比较 AI Scientist v2 与 AutoResearchClaw。

推荐的最终分层是：

```text
Windows Task Scheduler / systemd / supervisor
  └─ durable experiment-controller
       ├─ SQLite/JSONL：campaign、run、event、budget、locks
       ├─ training worker：本地、WSL 或 SSH GPU
       ├─ deterministic monitor：PID、exit code、log、metric
       └─ decision gateway
            ├─ Claude Agent SDK：普通单 Agent 决策
            ├─ Dynamic Workflow：重要节点的并行查证
            └─ JSON Schema + policy gate：批准 next_action
```

一句话定稿：

> **Agent 决定“下一步值得尝试什么”，Workflow 决定“这一次如何组织多个 Agent”，外部 controller 决定“系统现在是否允许、能够并且只执行一次这项动作”。**

## 本机版本核验

本轮在当前 Windows 环境重新执行了：

```text
claude.cmd --version
2.1.190 (Claude Code)
```

本机 `--help` 已包含 `--bare`、`--agents`、`--allowedTools`、`--max-budget-usd` 和 `--permission-mode`，但没有显示在线新版文档中的 `--max-turns` CLI 参数。因此：

- Dynamic Workflow 的最低版本条件已满足，但仍需验证配置与 provider 权限；
- Agent SDK 的 `max_turns` 能力有官方依据；
- 在本机 CLI 升级并重新检查前，不应假设 `claude -p --max-turns ...` 可用；CLI 调用次数和进程 timeout 继续由外部 controller 强制执行。

## 资料范围与可信度说明

- Claude Code 能力边界来自 Anthropic 官方 Claude Code / Agent SDK 文档。
- Auto Research 功能描述来自项目官方仓库和作者论文。
- 对“哪一个更适合当前场景”的判断是基于上述公开边界做出的工程推论。
- 我没有在本机 GPU 上复现这几个 Auto Research 项目，因此没有把作者报告的运行效果写成独立验证结论。
