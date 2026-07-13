# Claude Code 自动监视机制深度调研：Monitor、Hooks、Loop、Goal

调研日期：2026-07-13（Asia/Shanghai）  
本机 Claude Code：`2.1.190`（通过 `claude.cmd --version` 验证）

## 一、先给结论

`Monitor`、`hooks`、`/loop`、`/goal` 不是四种同层级、互相替代的“循环”。它们分别回答四个不同问题：

- **Monitor：外部世界发生变化时，怎样把事件实时送进当前会话？**
- **Hooks：Claude Code 生命周期走到某个节点时，怎样自动执行、拦截或校验？**
- **`/loop`：时间到了，怎样重新提交一次 prompt？**
- **`/goal`：Claude 结束一轮时，怎样判断目标是否真的完成；没完成就立刻继续？**

最简选择规则是：

| 你的真实触发条件 | 首选机制 |
| --- | --- |
| 日志、CI、文件、WebSocket 出现新事件 | Monitor；外部系统能主动推送时也可用 Channels |
| Claude 调工具、改文件、结束回答、请求权限等内部事件 | Hooks |
| 每隔 N 分钟检查一次，或稍后提醒 | `/loop` / 会话内 Cron |
| 持续做一项工作，直到测试或验收条件成立 | `/goal` |
| 电脑关机后仍要运行，或需要长期可靠调度 | Routines、GitHub Actions；不要依赖上述会话内机制 |
| 要访问本机文件，但不要求终端会话一直开着 | Desktop scheduled tasks |
| 只是想关闭当前终端、让本地 Claude 会话继续 | Background sessions / Agent view |
| 专门监视 PR 的 CI 和 review comments 并自动修复 | `/autofix-pr` 或 Desktop PR monitoring |

核心工程判断：**没有一个机制同时负责“观察、唤醒、判断、执行、持久托管”五件事。** 可靠方案通常是组合，而不是寻找一个万能 loop。

```text
观察信号                 触发/唤醒                 判定与行动                  托管位置
────────                 ─────────                 ─────────                  ────────
stdout / WebSocket ────> Monitor ────────────────> 当前 Claude 会话 ────────> 前台或本地后台会话
外部 webhook/MCP ──────> Channels ───────────────> 当前 Claude 会话 ────────> 前台或本地后台会话
Claude 生命周期事件 ───> Hook ───────────────────> 脚本 / 模型 / Agent
墙钟时间 ──────────────> /loop / Cron ───────────> 新的一轮 Claude prompt
一次回答准备结束 ──────> /goal / Stop hook ──────> 完成则停；未完成则下一轮

需要跨会话、跨重启或关机运行：把最右侧换成 Routines / Desktop tasks / CI / 外部调度器。
```

## 二、先把四个名称放回正确层级

### 1. Monitor 是工具，不是 `/monitor` 命令

当前官方命令列表没有 `/monitor`。用户用自然语言要求“监视这个日志/PR/目录”，Claude 决定调用 `Monitor` 工具。这个工具启动后台命令，把命令的**每一行 stdout** 当作一个事件写入会话；Claude 收到事件后可立即反应。Claude Code `2.1.195+` 还支持把 WebSocket 文本消息直接作为事件来源。

插件可以声明 Monitor，使它在插件启用或某个 skill 首次调用时自动启动；这属于实验性插件组件。

### 2. Hooks 是事件拦截框架

Hooks 绑定 Claude Code 的生命周期事件，例如 `PreToolUse`、`PostToolUse`、`Stop`、`SessionStart`、`FileChanged`。处理器可以是：

- `command`：本地命令或脚本；
- `http`：向端点 POST 事件；
- `mcp_tool`：调用 MCP 工具；
- `prompt`：让一个模型做判断；
- `agent`：启动有工具访问能力的验证 agent，当前仍属实验性。

因此 hooks 是一个基础设施层。`/goal` 本身就是基于它实现的。

### 3. `/loop` 是 bundled skill，底层是会话内调度工具

`/loop` 不是 shell 的 `while true`。固定间隔模式底层使用 `CronCreate`、`CronList`、`CronDelete`；自适应模式使用 `ScheduleWakeup`，并可能直接改用 Monitor 来避免轮询。

### 4. `/goal` 是 session-scoped prompt Stop hook 的快捷封装

它在每次主 agent 准备结束回答时，让一个小而快的模型检查完成条件。判定为否，就把原因交回 Claude 并立即开始下一轮；判定为是，目标自动清除。

由此可得一个重要包含关系：

```text
/goal ⊂ prompt-based Stop hook ⊂ hooks
dynamic /loop 可能调用 Monitor
plugin monitor 使用的也是 Monitor 机制
```

## 三、四个核心机制的横向比较

| 维度 | Monitor | Hooks | `/loop` | `/goal` |
| --- | --- | --- | --- | --- |
| 主要触发源 | 后台命令 stdout；新版可用 WebSocket | Claude 生命周期、工具、权限、任务、指定文件变化 | 时间或自适应延迟 | 主 agent 一轮结束 |
| 是否主动唤醒 Claude | 每个事件可立即进入 transcript，Claude 随即反应 | 一般在已有生命周期节点运行；普通 async hook 不唤醒空闲会话，`asyncRewake` 是例外 | 到期后排队一个新 prompt | 未满足条件时立即开始下一轮 |
| 判断者 | 主 Claude agent | 脚本、HTTP/MCP、prompt 模型或 agent | 每次被调度的主 Claude agent | 独立的小模型，默认 Haiku |
| 最适合 | 日志、CI、目录、长进程、状态变化 | 确定性规则、权限门禁、格式化、测试、Stop 质量门 | 会话内轮询、提醒、阶段性维护 | 有明确完成条件的连续实现/修复 |
| 空闲时的相对模型成本 | 没有事件时通常最低；脚本仍占本机资源 | command hook 可很低；prompt/agent hook 每次触发都用模型 | 每次 tick 都可能产生完整 agent turn，纯轮询成本最高 | 每轮有主模型成本，另加一次小模型评估 |
| 是否依赖活会话 | 是 | 配置可跨会话，但事件执行仍依赖会话 | 是 | 是 |
| 恢复语义 | 结束会话即停止；resume 不恢复 Monitor 进程 | 配置仍在，下次会话重新生效 | 未过期任务可由 `--resume` / `--continue` 恢复 | 未完成目标可恢复，但计时、轮数、token 基线重置 |
| 主要停止条件 | 进程退出、超时、`TaskStop`、会话结束 | 事件结束；Stop hook 可放行或被安全上限覆盖 | 用户取消、任务删除、Claude 主动结束、7 天到期 | 条件满足、`/goal clear`、`/clear`、中断 |
| 确定性 | 事件检测可确定，后续行动仍由模型判断 | command hook 最高；prompt/agent hook 依赖模型 | 调度近似确定，行动依赖模型 | 条件由模型判断，不是形式证明 |

## 四、Monitor：实时事件流，适合“变化发生时再叫我”

### 工作原理

Claude 通常先写一个小型 watcher/poller，随后用 Monitor 在后台运行。每一行 stdout 都成为一条新 transcript message，Claude 可以在当前会话中立即处理，而用户仍可继续对话。官方明确将它定位为：监视日志、PR/CI、目录变化、长进程输出或 WebSocket feed。

命令型 Monitor 的公开输入语义是：

- 默认超时 `300000 ms`（5 分钟）；
- 非 persistent 最长 `3600000 ms`（1 小时）；
- `persistent: true` 时持续到 `TaskStop` 或本会话结束；
- 命令退出即结束 watch；
- 每一行 stdout 是一个事件。

这解释了为什么它通常比 `/loop 1m ...` 更省：**没有状态变化时，只运行本地 watcher，不必每分钟重新让主模型读取上下文并判断。** 这是相对成本判断，不代表事件到达后无需模型 token。

### 优点

- 事件延迟低，不必等下一次轮询。
- 没有事件时不会反复调用主模型。
- 可继续使用同一个会话和已有上下文。
- 适合长日志、编译器 watch、CI 状态变化、目录 watcher。
- `2.1.195+` 可直接使用 WebSocket 文本消息，避免自己写 polling script。

### 缺点和边界

- **它不是持久服务。** 会话结束即停，resume 不会恢复后台 Bash 或 Monitor。
- 普通 Monitor 需要 Claude 主动选择调用；若要自动装配，须使用 plugin monitor。
- stdout 太吵会把每行都变成事件，造成上下文膨胀、模型调用和“事件风暴”。
- 本地 watcher 自身可能失败、断连或漏报；Monitor 并不自动提供生产级 offset、ack、重试队列和幂等语义。
- 命令型 Monitor 服从 Bash 的 allow/deny 权限规则；WebSocket 有独立审批和网络限制。
- 官方当前说明：Bedrock、Vertex AI、Microsoft Foundry 不提供 Monitor；设置 `DISABLE_TELEMETRY` 或 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 时也不可用。

### Plugin monitor

插件可以在 `monitors/monitors.json` 中声明持久 watcher：

- `when: "always"`：会话开始或插件 reload 时启动；
- `when: "on-skill-invoke:<skill-name>"`：某 skill 首次调度时启动；
- 同名 monitor 用于去重；
- 插件停用不会终止已经启动的 monitor，它到会话结束才停；
- 只支持 interactive CLI；
- 官方明确说它与 hooks 同信任级别、**unsandboxed**；
- 该插件组件仍是 experimental。

### 实践建议

watcher 应当输出“状态变化”，而不是原始全量日志：

```text
坏：每秒输出 heartbeat 和完整状态 JSON
好：只在 pending -> failed、failed -> passed 等转换时输出一行
```

每条事件最好包含稳定 ID、时间、旧状态、新状态和最少的诊断信息；重复事件在脚本侧去重。这样既减 token，也能避免 Claude 对同一失败重复操作。

## 五、Hooks：最强的规则与拦截框架，但不是天然的长驻 watcher

### 它真正擅长什么

Hooks 的价值不是“不断运行”，而是**Claude Code 到达一个已知事件点时，必定运行指定处理器**。典型用途：

- `PreToolUse`：危险命令执行前阻止；
- `PostToolUse`：编辑后格式化或启动测试；
- `PermissionRequest`：按策略允许或拒绝；
- `Stop`：验证验收条件，不满足则让 Claude 继续；
- `SessionStart`：加载动态上下文或环境；
- `StopFailure`：记录 API 错误或发告警；
- `FileChanged`：指定文件变化时刷新环境。

command hook 的规则可以完全确定；prompt/agent hook 则牺牲确定性，换取语义判断或工具验证。

### 同步、async 与 asyncRewake

- 默认 hook 是同步的，会阻塞 Claude 等待结果。
- `async: true` 只支持 command hook。它在后台运行，完成后的 context 通常等到**下一次会话 turn**才交给 Claude；空闲时不会自动唤醒。
- 当前官方文档还提供 `asyncRewake: true`：它隐含 async；若后台命令以退出码 2 结束，会立即唤醒空闲中的 Claude，并把 stderr（为空则 stdout）作为系统提醒。
- async hook 不能阻止已经发生的动作，也不能返回有效的 permission decision。
- 每次触发都会创建新进程，官方明确说明没有跨触发去重。

官方字段参考没有在 `asyncRewake` 旁标出最低版本，本次也没有在本机 `2.1.190` 上做实际唤醒实验；因此它应按“当前在线文档能力”看待，落地前用目标版本做一次端到端验证。

所以，长时间 `tail -f` 不应放在同步 hook 中。一般选择是 Monitor；如果启动动作本身必须随项目/skill 自动装配，则用 plugin monitor。

### `FileChanged` 是一个值得补充的“小型监视器”

Claude Code `2.1.83` 增加了 `FileChanged` hook：

- matcher 按 `|` 分割成**当前工作目录中的字面文件名**，不是正则；
- 输入包含绝对路径和 `change` / `add` / `unlink`；
- hook 可返回绝对路径数组 `watchPaths` 动态扩展观察列表；
- 不能阻止文件变化；
- 适合 `.envrc`、`.env`、配置文件重载，不适合通用日志流或复杂递归目录观察。

它能自动运行脚本，但官方没有把普通 `FileChanged` 输出定义为像 Monitor 一样必然唤醒主 agent。因此需要 Claude 立即参与判断时，Monitor 更合适。

### Stop hook：自定义的目标循环

Stop hook 可返回 `decision: "block"` 和原因，让 Claude 不结束、带着反馈继续。与 `/goal` 相比：

- command Stop hook 可直接运行确定性测试；
- prompt Stop hook 和 `/goal` 一样用模型判断；
- experimental agent Stop hook 可读取文件、搜索、运行命令，默认 60 秒，最多 50 个工具 turn；
- 配置可放在 user/project/local/plugin 范围，跨会话重复生效。

当前官方默认在 Stop hook **连续阻断 8 次**后覆盖 hook 并结束 turn；可用 `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` 调整。脚本应检查 `stop_hook_active`，并为不可能满足的条件提供退出路径。

### 安全与可靠性细节

- command hooks 以当前系统用户的完整权限执行。官方明确要求审查脚本、校验输入、引用变量、阻止路径穿越并避开密钥文件。
- 默认 timeout：command/http/mcp_tool 为 600 秒，prompt 30 秒，agent 60 秒；部分事件更短。
- HTTP hook 的非 2xx、连接失败或 timeout 是**非阻塞错误**，默认继续执行。若它承担权限门禁，必须返回 2xx 和正确 JSON decision，不能把 500 当成拒绝。
- prompt/agent hook 如果绑在高频 `PostToolUse` 上，会在每次工具调用后产生模型成本和延迟。

## 六、`/loop`：按时间重新提交 prompt，适合会话内轮询

### 三种调用方式

```text
/loop 5m check the deploy       # 固定间隔和 prompt
/loop check the deploy          # Claude 每轮自行选择 1～60 分钟的下次间隔
/loop                           # 自适应执行内置 maintenance prompt 或 .claude/loop.md
```

还可把另一个 command/skill 作为 prompt，例如 `/loop 20m /review-pr 1234`。

裸 `/loop` 的内置维护顺序是：继续未完成工作、照看当前分支 PR、没有待办时做 bug hunt 或简化。它不会凭空开启超出既有授权的新项目。项目级 `.claude/loop.md` 可覆盖该默认 prompt，优先于用户级 `~/.claude/loop.md`。

### 固定间隔的真实语义

- 底层使用 5-field Cron；最小粒度 1 分钟。
- `s` 会向上取整到分钟。
- `7m`、`90m` 等不能干净映射为 cron step 的间隔会被取近似值，Claude 应告知实际值。
- 调度器每秒检查，但只在两个 turn 之间、当前 Claude 空闲时排队。
- 若 Claude 忙，错过的多次触发只补一次，不逐次追赶。
- recurring task 有 deterministic jitter：可能晚于标称时间；因此不适合精确 deadline。

### 自适应模式

没有 interval 时，Claude 每轮根据状态选择 1～60 分钟后的下次唤醒；如果能构造事件 watcher，它可能直接使用 Monitor，跳过 polling。此时用户表面上用了 `/loop`，底层未必是 cron。

Bedrock、Vertex、Foundry 上没有相同的动态能力：官方说明无 interval prompt 会落为固定 10 分钟调度。

### 生存期和限制

- 当前文档要求 Claude Code `2.1.72+`；changelog 记载命令最初在 `2.1.71` 加入。
- 一个会话最多 50 个 scheduled tasks。
- recurring task 创建 7 天后自动到期。
- 会话必须仍在运行且空闲；新 conversation 会清空这些任务。
- `--resume` / `--continue` 可恢复 7 天内的 recurring task 和尚未过期的一次性任务。
- Background Bash 和 Monitor **不会**随 resume 恢复。
- 在 `/loop` 等待时按 Esc 会取消它的 pending wakeup；直接用自然语言创建的其他 scheduled task 需列出并删除。
- 官方 changelog 已停止在 remote sessions 中推荐 `/loop`，原因是 pending loop 不会让远程容器保持存活；需要耐久云端调度时应使用 Routines。

### 优缺点

优点：最容易使用、可执行任意 prompt/skill、无需写 watcher、适合“每十分钟重新评估全部信息”。  
缺点：无变化也会产生完整 agent turn；有 jitter、无精确补跑、依赖会话、7 天到期；轮询频率越高，成本和上下文增长越快。

当外部系统能输出状态变化事件时优先 Monitor/Channels；只有“每次检查本身需要重新综合判断”或没有事件接口时才优先 `/loop`。

## 七、`/goal`：完成条件驱动的连续工作，不适合等待外部事件

### 工作原理

`/goal` 在当前会话中注册一个 prompt-based Stop hook。每次主 agent 结束一轮后：

1. 将条件和已出现在对话中的证据发送给小而快的 evaluator，默认 Haiku；
2. evaluator 返回 yes/no 和简短原因；
3. no：原因成为下一轮指导，主 agent 立即继续；
4. yes：清除目标并记录完成。

它与 auto mode 是互补关系：auto mode 减少一轮内部的工具审批，但不会自动开启下一轮；`/goal` 负责跨 turn 继续，却不会自动消除权限询问。

### 最关键的限制：evaluator 不会读文件或运行命令

它只能判断 Claude 已经在 transcript 中展示的证据。因此：

```text
弱条件：把认证模块做好
强条件：运行 npm test -- auth，退出码为 0；npm run lint 退出码为 0；
        最终回答必须列出两个命令及退出码；不得修改 tests/auth 之外的测试文件
```

如果验收必须由外部程序直接证明，有三种更可靠的路径：

1. 让主 agent 每轮主动运行并明确报告测试结果；
2. 用 command Stop hook 直接执行确定性检查；
3. 需要读取/搜索/运行多步验证时，用 experimental agent Stop hook。

### 状态和限制

- `2.1.139` 引入。
- 每个会话同时只能有一个 goal；新 goal 替换旧 goal。
- 条件上限 4,000 字符。
- `/goal` 查看状态；`/goal clear` 清除；`stop/off/reset/none/cancel` 是别名。
- `/clear` 会删除 active goal。
- 未完成 goal 可随 resume 恢复，但轮数、计时、token 统计基线重置。
- 支持 interactive、Desktop、Remote Control 和 `claude -p "/goal ..."`。
- 需要 workspace trust，且 hooks 被禁用或 managed policy 只允许 managed hooks 时不可用。

### 避免无限工作

官方建议把回合或时间退出条款写入 condition，例如“满足验收，或 20 轮后报告 blocker 并停止”。但 evaluator 仍是基于 transcript 的模型判断，这不是操作系统级硬 timeout。

非交互运行需要更硬的边界时，CLI 提供：

- `--max-turns`：达到上限后以错误退出；
- `--max-budget-usd`：达到预算上限后停止；
- 外部 CI/job timeout：作为进程级最后保险。

### 什么时候不要用 `/goal`

- “等部署完成再告诉我”：goal 会倾向于立即连续工作或检查，形成忙循环；用 Monitor 或 `/loop`。
- 完成标准依赖人类审美或架构决策：模型 evaluator 不能把主观条件变成事实。
- 生产环境的破坏性自动修复：应先有权限、沙箱、分支和 deterministic checks，而不是只靠一句 goal。

## 八、四者之间最重要的两两差异

### Monitor vs `/loop`

- 能把变化编码成事件：Monitor。
- 只能查询快照，且每次需要重新综合推理：`/loop`。
- 想要低延迟、低空转成本：Monitor。
- 想要每隔一段时间做完整巡检，即使没变化也要行动：`/loop`。

### `/goal` vs Stop hook

- 临时、一次性、条件可由 transcript 证明：`/goal`。
- 每个项目/会话都必须执行：配置 Stop hook。
- 验收可写成脚本退出码：command Stop hook，确定性高于 `/goal`。
- 验收需要工具探索：agent Stop hook，但成本、延迟和实验性更高。

### Hooks vs Monitor

- “Claude 做某事前后”：hook。
- “外部系统发生某事”：Monitor/Channels。
- “某几个固定配置文件变化”：`FileChanged` hook 足够。
- “通用日志流、递归目录或长进程”：Monitor。
- 不要用同步 hook 承载永不退出的 watcher。

### `/goal` vs `/loop`

- `/goal`：上一轮一结束就判断，未达标马上继续；它是完成条件驱动。
- `/loop`：等时间到再开始下一轮；它是时钟驱动。
- 修到测试通过：goal。
- 每 15 分钟查看部署：loop；能获得事件流时改 Monitor。

## 九、值得补充的自动监视/托管能力

### 1. Channels：把外部事件推入活会话

Channels 是 research preview，要求 `2.1.80+`。它让一个 MCP server 主动推送 CI、webhook、告警或聊天消息到通过 `--channels` 明确启用的会话；可做单向事件桥，也可双向回复和远程 relay 权限请求。

相较 Monitor：

- Monitor 通常在本机拉取或监听 stdout/WebSocket；
- Channel 由外部 MCP server 主动推送，可承载 webhook/chat 和回复路径；
- 两者都依赖活会话；Channels 也不支持 Bedrock/Vertex/Foundry；
- 能通过 Channel 回复的人可能有权批准或拒绝工具调用，必须严格 allowlist sender。

### 2. Routines：云端、持久、可由 schedule/API/GitHub 触发

Routines 是当前最接近“真正无人值守自动化”的官方能力：

- Anthropic 云端运行，电脑关闭也能执行；
- 每次是新的完整 cloud session；
- trigger 可组合 schedule、API 和 GitHub event；
- recurring schedule 最小 1 小时；
- 每次 fresh clone 仓库，无法看到本机未提交文件；
- 运行时没有 approval prompt；可使用所选 connectors 的写工具；
- 默认只允许推送 `claude/` 前缀分支，除非显式开放 unrestricted branch push。

优势是持久和托管，风险是权限更自动化，因此 repo、网络、环境变量和 connectors 必须按最小权限配置。

### 3. Desktop scheduled tasks：本机持久调度

适合必须访问本机文件、工具或未提交改动的任务：

- 不需要已有 conversation 保持打开；每次启动新 session；
- 需要 Desktop app 开着且电脑醒着；
- 最小 1 分钟；
- 可为每个任务配置权限模式；Ask mode 遇到未批准工具会停住；
- 可选择 worktree 隔离；默认直接看到工作目录及未提交变更；
- 电脑睡眠漏跑后，启动/唤醒时只补最近 7 天中最新的一次，不逐次追赶。

### 4. GitHub Actions / GitLab CI / 外部 scheduler + `claude -p`

适合仓库事件、审计、可重复配置、硬 timeout 和团队共享。`claude -p` 支持 structured output、`--allowedTools`、permission mode、`--max-turns`、`--max-budget-usd`；外层 CI 负责 cron、retry、concurrency、secrets、artifact 和 timeout。

这是生产自动化常见的稳健边界：**CI 决定何时运行和是否通过，Claude 负责诊断与修改。** 不要让模型判断替代已有的测试退出码或 deployment controller 状态。

### 5. Background sessions / Agent view：让本地会话脱离终端

`claude --bg "..."`、`/background` 或 `/bg` 会把会话交给本地 supervisor；`claude agents` 查看所有后台会话，`attach/logs/stop/respawn` 管理它们。后台 session 是独立 Claude Code 进程，不再依附当前终端。

它解决的是“终端附着和并行管理”，不是时钟调度或完成判定。可与 goal 或 watcher 组合，但不应把它误当成 Routines/CI 的耐久作业系统。官方说明，已完成且无终端附着的会话约一小时后会停止进程以释放资源，状态留在磁盘，之后再按需恢复。

### 6. `/autofix-pr` 与 Desktop PR monitoring

这是 PR 场景的专用能力：

- `/autofix-pr` 识别当前分支 PR，在 Claude Code on the web 启动 session；
- 接收 CI failure 和新 review comments 等 GitHub events；
- 明确修复会自动修改并 push，含糊请求会询问用户；
- Desktop 也可轮询 PR check，启用 Auto-fix、Auto-merge 和通知。

若目标就是“盯 PR 并自动修”，它比手写 `/loop 5m` 更贴合事件来源和生命周期。

### 7. Ralph Wiggum plugin：历史上常见的 Stop-hook loop

Anthropic 官方仓库里的 `ralph-wiggum` 插件用 Stop hook 拦截退出，把相同 prompt 再喂给 Claude，直到出现精确 completion promise 或达到 iteration 上限。它不是第五个底层原语，而是 **Stop hook 的一种策略实现**。

与 `/goal` 的区别：

- Ralph 常用精确字符串作为完成信号，可配置迭代次数；
- `/goal` 由独立小模型按语义判断条件；
- 精确字符串更确定但更脆弱，模型语义判断更灵活但可能误判；
- 新项目中，简单条件优先 `/goal`；需要自定义 Stop 逻辑或兼容既有 Ralph 工作流时再用插件。

### 8. Agent SDK：自建生产级监督器

需要队列、租约、事件去重、幂等、重试策略、预算、审批、数据库状态或多租户时，使用 Agent SDK 和外部 orchestrator。SDK 提供 agent loop、hooks、session resume、工具权限、max turns 和预算等能力，但可靠性协议由应用承担。

## 十、按场景给出的事实型建议

| 场景 | 推荐 | 不推荐及原因 |
| --- | --- | --- |
| 盯 dev server，出现 5xx 就分析修复 | Monitor，watcher 只输出过滤后的新错误 | `/loop 1m` 会空转且可能晚一分钟 |
| 盯 GitHub PR CI/review | 优先 `/autofix-pr`；活本地会话可用 Monitor/dynamic `/loop` | 固定高频 polling 在无变化时浪费 turn |
| 每次 Claude 改 TS 文件后跑 lint | `PostToolUse` async command hook | Monitor 不知道“Claude 刚编辑完”这个生命周期语义 |
| `.envrc` 变化后刷新 shell 环境 | `FileChanged` hook | 通用 Monitor 过重 |
| 做迁移直到测试和 lint 全绿 | `/goal`；强条件中写明命令、退出码、禁止项和上限 | `/loop` 会无意义等待时间；单纯让主 agent 自称完成也不够 |
| 强制任何会话提交前必须测试 | project Stop hook，最好 command checker | `/goal` 只对当前会话生效且由模型判断 |
| 每天早上审查仓库 | Routines、Desktop task 或 GitHub Actions | `/loop` 要求活会话且 7 天到期 |
| 外部监控系统出现告警时唤醒 Claude | Channels；已有 WebSocket 且会话在本机时可用 Monitor | 按分钟查询告警系统延迟高且浪费调用 |
| 关闭终端后让本地大任务继续 | Background session；有验收条件时配 `/goal` | 普通前台会话会随终端结束 |
| 电脑关闭后仍要继续 | Remote/cloud session、Routines 或 CI | Monitor、hooks、loop、goal 都不是关机后托管层 |

## 十一、推荐的组合模式

### 模式 A：本地实时“看守 + 修复”

```text
过滤/去重 watcher -> Monitor -> 事件进入会话 -> Claude 诊断修复
                                      └-> PreToolUse/权限规则限制危险动作
                                      └-> PostToolUse hook 跑格式化/测试
```

只有事件真正发生后，才考虑用 `/goal` 让修复持续到验收通过。不要预先设置一个“等待未来事件”的 goal。

### 模式 B：长程实现任务

```text
清晰 goal + 自动测试证据 + hard max-turn/budget + worktree/沙箱 + 最小工具权限
```

在交互会话中可用 auto mode 减少审批，但不应直接使用 bypassPermissions 代替沙箱。要离开终端时可将会话 background；要跨机器/关机则改用 cloud/CI。

### 模式 C：长期无人值守

```text
外部事件/cron -> Routine 或 CI -> fresh session -> Claude 做工作
                              -> deterministic test/deploy gate 决定成功
                              -> PR/通知作为可审计输出
```

模型完成声明不能替代 CI 的真实退出码、部署控制器状态或人工审批。

## 十二、常见反模式

1. **拿 `/goal` 等待 CI。** 它是立即连续执行器，不是睡眠/事件等待器。
2. **拿 `/loop` 高频轮询已有 push/WebSocket 的系统。** 应改用 Monitor 或 Channels。
3. **把 `tail -f` 放进同步 hook。** 会阻塞 Claude；应使用 Monitor/plugin monitor。
4. **Monitor 输出所有日志和 heartbeat。** 每行都是事件，容易拖垮上下文和用量。
5. **Stop hook 没有上限和 `stop_hook_active` 处理。** 会被 8 次连续阻断安全上限终止，或在提高上限后产生昂贵死循环。
6. **把“配置持久”误认为“进程持久”。** hooks 配置会留在磁盘，但运行中的 Monitor/loop/goal 仍依赖会话。
7. **Routines 默认带上全部 connectors。** 官方创建界面会默认包含当前 connectors；应删除不需要的写权限。
8. **用 `bypassPermissions` 解决无人值守。** 无人值守首先应靠 sandbox/worktree、最小 allow rules 和硬边界。

## 十三、版本与本机可用性

| 能力 | 官方版本信息 | 本机 `2.1.190` |
| --- | --- | --- |
| `/loop` / session Cron | 当前文档要求 `2.1.72+`；首次加入记载为 `2.1.71` | 可用 |
| Channels | `2.1.80+`，research preview | 达到版本门槛 |
| `FileChanged` hook | `2.1.83+` | 可用 |
| Monitor command | `2.1.98+` | 可用；本机 SDK 类型仅包含 command source |
| Plugin monitors | `2.1.105+`，experimental | 达到版本门槛 |
| `/goal` | `2.1.139+` | 可用 |
| WebSocket Monitor | `2.1.195+` | **不可用，需升级** |

官方文档已经包含高于本机 `2.1.190` 的行为和修复。因此生产使用前应按实际 release channel 更新并做 capability/version 验证，尤其不能在本机直接照抄 WebSocket Monitor 配置。

## 十四、最终判断

如果只记住一句话：

> **Monitor 监听变化，hooks 把守节点，loop 等时间，goal 守终点；Routines/Desktop/CI 决定它能活多久。**

针对多数开发者，建议优先级是：

1. 有真实事件流时，用 Monitor/Channels，避免 polling。
2. 有确定性规则时，用 command hook，不让模型替代脚本判断。
3. 有时间节奏但没有事件接口时，用 `/loop`。
4. 有可验证完成条件的长任务，用 `/goal`，并加硬 turn/budget/timeout。
5. 要关机、跨重启或长期运行，迁移到 Routines、Desktop tasks、CI 或自建 SDK orchestrator。

## 主要来源

以下均为一手资料，除 Ralph 方法说明外主要采用 Claude Code 官方文档：

- [Tools reference：Monitor tool](https://code.claude.com/docs/en/tools-reference#monitor-tool)
- [Agent SDK Python reference：Monitor 输入/输出](https://code.claude.com/docs/en/agent-sdk/python)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)
- [Run prompts on a schedule：`/loop`、Cron、恢复和限制](https://code.claude.com/docs/en/scheduled-tasks)
- [Keep Claude working toward a goal：`/goal`](https://code.claude.com/docs/en/goal)
- [Plugins reference：plugin monitors](https://code.claude.com/docs/en/plugins-reference#monitors)
- [Channels](https://code.claude.com/docs/en/channels)
- [Channels reference](https://code.claude.com/docs/en/channels-reference)
- [Routines](https://code.claude.com/docs/en/routines)
- [Desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks)
- [Agent view / background sessions](https://code.claude.com/docs/en/agent-view)
- [Claude Code on the web：PR auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code Desktop：PR monitoring](https://code.claude.com/docs/en/desktop)
- [CLI reference：`--bg`、`--max-turns`、`--max-budget-usd`](https://code.claude.com/docs/en/cli-usage)
- [Programmatic/headless usage](https://code.claude.com/docs/en/headless)
- [Agent SDK：agent loop 与硬限制](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [官方仓库 Ralph Wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
- [Week 15：Monitor v2.1.98](https://code.claude.com/docs/en/whats-new/2026-w15)
- [Week 20：`/goal` v2.1.139 与 Agent view](https://code.claude.com/docs/en/whats-new/2026-w20)
- [Claude Code changelog](https://code.claude.com/docs/en/changelog)

## 事实边界

- 官方公开了上述外部行为、配置和版本要求，但没有公开 Claude Code 全部内部实现。因此本文不声称掌握其隐藏 system prompt、内部调度数据结构或 proprietary evaluator prompt。
- “Monitor 通常比固定轮询更省 token”有官方文档直接支持；本文进一步提出“过滤、去重、只输出状态变化”是基于每行 stdout 都成为事件这一公开机制得出的工程建议。
- Background session 与 goal/monitor 的组合属于能力组合建议；它不等同于官方对生产级 job durability 的保证。需要耐久执行时仍应选择 Routines、Desktop scheduled tasks、CI 或外部 orchestrator。
