# Claude Code 自动监视机制：从夜间 Auto Research 理解 Monitor、Hooks、Loop 与 Goal

> 重写日期：2026-07-19（Asia/Shanghai）  
> 本机 Claude Code：`2.1.190`，已通过 `claude.cmd --version` 验证  
> 讨论范围：本地 Claude Code、外部实验控制器和通用 CLI 自动化。本文不讨论依赖 Claude.ai 或 Anthropic 专属账号体系的云端、桌面订阅及远程托管能力。

## 结论：夜间实验不应该让 Agent 从头忙到尾

假设目标是：晚上自动配置环境、复现论文基线、运行一批参数实验；训练期间不调用 Agent；每次实验结束后让 Claude 总结结果、决定下一组参数，再继续运行。

这类任务的正确主体不是某一个 Claude Code “循环”，而是一个**落盘保存状态的实验控制器**。四种 Claude Code 机制只负责各自擅长的环节：

| 机制 | 在 Auto Research 中负责什么 | 不应该负责什么 |
| --- | --- | --- |
| Monitor | 活会话中监听“实验完成、失败、指标异常”等事件，事件到来后再让 Claude 工作 | 持久保存实验状态、跨重启托管任务 |
| Hooks | 在 Claude 改配置、执行命令、准备结束时运行确定性检查或安全门禁 | 长时间等待训练进程完成 |
| `/loop` | 没有事件接口时，隔一段时间重新检查一次 | 高频轮询两小时训练、代替实验调度器 |
| `/goal` | 让 Claude 连续完成“配置环境、修复依赖、复现基线”等可验证工作 | 睡眠等待训练或部署完成 |
| 外部实验控制器 | 启动训练、等待退出、记录状态、执行超时和试验预算、恢复中断任务 | 解释论文、诊断失败、提出新假设 |

一句话概括：

> **实验控制器负责可靠地跑，Claude 负责在关键节点思考；Monitor 负责叫醒，Hooks 负责把关，Loop 负责兜底轮询，Goal 负责把当前阶段做完。**

## 先看完整工作流

一个可落地的夜间参数优化流程应当是：

```text
晚上启动本地实验控制器
        │
        ├─ Claude 配置环境、修复依赖、复现 baseline
        │      └─ /goal：直到确定性验收脚本通过，或达到退出条件
        │
        ├─ 控制器启动 experiment-001
        │      └─ 训练进程独立运行；这几个小时不需要 Claude
        │
        ├─ 训练结束，控制器落盘 metrics / logs / exit_code
        │      ├─ 活会话方案：输出一条事件，由 Monitor 唤醒 Claude
        │      └─ 耐久方案：控制器调用一次 claude -p 分析结果
        │
        ├─ Claude 生成本轮总结和下一步结构化决策
        │      └─ continue / retry / stop，以及下一份配置
        │
        └─ 控制器校验决策，启动 experiment-002，直到硬预算耗尽
```

这里最重要的设计是：**训练进程和 Claude 进程解耦**。训练两小时，就让 GPU 和实验框架工作两小时；不要让 Claude 每分钟醒来问一次“跑完了吗”。只有状态真正改变，或者到了必须重新评估的节点，才调用模型。

## `stdout` 和 `transcript` 到底是什么

原始术语很容易把简单事情说复杂。放进真实实验场景后，它们分别是：

- `stdout`：脚本打印到终端的普通文本。例如实验控制器执行 `print(...)` 后出现的这一行：

  ```json
  {"event":"run_finished","run_id":"grpo-lr3e-6-b8","exit_code":0,"metrics":"record/auto-research/grpo-01/runs/grpo-lr3e-6-b8/metrics.json"}
  ```

- `transcript`：Claude Code 保存的本次对话记录，里面包括用户消息、Claude 回复、工具调用结果和 Monitor 送入的事件。`/goal` 的评估模型只能依据这里已经出现的证据判断工作是否完成。

Monitor 的核心行为就是：后台脚本每输出一行，Claude Code 就把这一行作为新事件交给当前 Claude。实验脚本没有输出新事件时，Claude 不需要因为 Monitor 而反复醒来。官方将 Monitor 用于日志、CI、目录变化和长进程输出，并明确说明命令型 Monitor 会把每一行输出流回 Claude。[Tools reference：Monitor](https://code.claude.com/docs/en/tools-reference#monitor-tool)

因此，以下两种输出方式差别很大：

```text
不合适：每秒打印 loss、显存、heartbeat 和整份状态
合适：只在 queued -> running、running -> finished、running -> failed 时打印一行事件
```

前一种会让大量无用日志进入对话上下文；后一种只在 Claude 真正需要做决定时唤醒它。

## Monitor：实验结束时再叫 Claude

### 放进实验流程后的工作方式

Claude 可以让 Monitor 在后台运行一个 watcher。watcher 不负责训练，只负责观察控制器保存的状态；当状态改变时，输出一条简短事件：

```text
控制器写入 run_finished
        ↓
watcher 输出一行 JSON
        ↓
Monitor 把事件送给当前 Claude 会话
        ↓
Claude 读取 metrics.json 和关键日志
        ↓
Claude 写总结并提出下一份参数配置
```

这比 `/loop 1m 检查训练是否完成` 更适合长实验。两小时内如果没有变化，watcher 只是一个本地小进程，不会产生一百多次 Agent turn；实验结束后，事件又能立即送达。

### Monitor 应该监听什么

优先监听控制器生成的高层事件，而不是直接监听原始训练日志：

- `run_started`：记录 PID、配置哈希、开始时间和资源；
- `run_finished`：记录退出码、指标文件和耗时；
- `run_failed`：记录错误类别与最短必要日志；
- `metric_invalid`：指标缺失、NaN 或不满足数据约束；
- `campaign_budget_reached`：试验次数、时间或 GPU 时数达到硬上限。

每个事件至少应有稳定的 `campaign_id`、`run_id` 和 `event_id`。Claude 可能因为重试而再次看到同一事件，控制器必须能根据 ID 判断该事件是否已经分析，不能依靠“模型应该记得”。

### Monitor 的真实边界

Monitor 依赖当前 Claude Code 会话。结束会话会结束监视；恢复会话时，原有 Monitor 任务不会恢复。官方计划任务文档也明确写明，resume 可以恢复尚未过期的会话计划，但后台 Bash 和 Monitor 任务不会恢复。[Scheduled tasks：Limitations](https://code.claude.com/docs/en/scheduled-tasks#limitations)

这意味着：

- 电脑和 Claude 会话整个晚上都稳定运行时，可以用 Monitor 做低延迟事件唤醒；
- 任务必须承受终端关闭、Claude 崩溃或机器重启时，不要把 Monitor 当作唯一控制器；
- 真正的实验状态必须保存在磁盘或数据库中，而不是只存在对话里。

当前官方文档还支持 WebSocket 事件源，但要求 Claude Code `2.1.195+`。本机版本是 `2.1.190`，所以本文的本机落地方案只采用命令型 Monitor，不假设 WebSocket 可用。[Tools reference：WebSocket source](https://code.claude.com/docs/en/tools-reference#websocket-source)

## Hooks：在 Claude 行动前后设置检查点

Hooks 不是一直运行的监视进程。它的实际含义是：Claude Code 走到某个已知节点时，自动运行一段脚本或一次判断。

在 Auto Research 中，最有用的不是“到处挂模型 Hook”，而是把能写成程序的规则做成 command hook：

| 事件节点 | 真实实验动作 |
| --- | --- |
| `PreToolUse` | Claude 准备启动训练前，检查命令是否使用允许的配置目录、GPU 编号和并发数 |
| `PostToolUse` | Claude 修改 YAML/JSON 配置后，运行 schema validator，拒绝缺失字段和非法范围 |
| `PostToolUseFailure` | 记录环境安装、编译或训练启动命令的失败摘要 |
| `FileChanged` | `.env`、`.envrc` 等少量固定文件改变时，刷新会话环境 |
| `Stop` | Claude 准备结束“结果分析”阶段时，检查 summary 和 next-action 文件是否存在且通过校验 |

Claude Code 当前支持 command、HTTP、MCP tool、prompt 和 experimental agent 等 Hook 处理器；command hook 最适合确定性检查，prompt/agent hook 才用于程序难以表达的语义判断。[Hooks reference：Hook types](https://code.claude.com/docs/en/hooks#hook-types)

### 为什么不要用同步 Hook 等训练

假设训练要跑三小时。如果把 `python train.py` 或 `tail -f train.log` 塞进同步 Hook，Claude 会一直等 Hook 返回，整个会话被堵住。更合理的做法是：

- 训练由外部控制器启动并等待；
- 活会话需要被唤醒时，用 Monitor；
- Hook 只做秒级或分钟级的校验、格式化和门禁。

command hook 可以异步运行。当前官方文档还提供 `asyncRewake: true`：后台 Hook 以退出码 2 结束时，可以唤醒空闲 Claude，并把错误输出作为系统提醒。这适合“后台检查失败时叫 Claude”，但它仍然从某个 Hook 生命周期事件出发，不是通用实验事件总线。[Hooks reference：asyncRewake](https://code.claude.com/docs/en/hooks#command-hook-fields)

### Hook 不是安全沙箱

Hook 脚本以当前系统用户的权限运行。Hook 的 `if` 过滤是方便的条件匹配，不应该被当作操作系统级安全边界；官方文档明确建议硬性允许或禁止依靠 permission system，并在需要时启用 sandbox。[Hooks reference：Common fields](https://code.claude.com/docs/en/hooks#common-fields)

因此，夜间无人值守时应同时具备：

- 单独的工作目录或 worktree；
- 只允许写入配置、结果和记录目录；
- 禁止删除数据集、基线权重和其他项目；
- GPU 并发、最长运行时间和最大试验次数由控制器强制执行；
- 密钥不写入 prompt、日志和实验配置。

### Stop hook 与 `/goal` 的区别

Stop hook 可以运行真实脚本。如果规则是“`tests/validate_result.py` 退出码必须为 0”，command Stop hook 比让模型阅读一句“结果看起来正常”更可靠。

Stop hook 连续阻止 Claude 结束时必须有退出路径。当前官方文档说明，Claude Code 会在连续阻断 8 次后覆盖 Hook 并结束 turn；Hook 输入还提供 `stop_hook_active`，用于识别已经处于继续循环中的情况。[Hooks reference：Stop](https://code.claude.com/docs/en/hooks#stop)

## `/loop`：没有事件通知时的轮询兜底

如果实验框架没有稳定的完成事件，也暂时不想写 watcher，可以使用：

```text
/loop 20m 检查 record/auto-research/grpo-01/campaign_state.json；
如果 run 状态从 running 变为 finished 或 failed，再分析结果；
状态没有变化时只报告 waiting，不修改任何文件。
```

它的含义不是 shell 的 `while true`，而是“到时间后，再向当前 Claude 会话提交一次 prompt”。固定间隔任务由会话内计划工具管理；不给 interval 时，Claude 可以在每轮结束后选择下一次等待时间，必要时甚至改用 Monitor。[Scheduled tasks：`/loop`](https://code.claude.com/docs/en/scheduled-tasks#run-a-prompt-repeatedly-with-loop)

### 在夜间实验中什么时候适合

- 目标系统只有“查询当前状态”的接口，没有事件流；
- 每次检查都需要重新综合多个文件，而不是只响应一个完成事件；
- 检查间隔较粗，例如 20～30 分钟，能够接受延迟；
- Claude 会话可以一直保持运行。

### 什么时候不适合

- 训练明确会写出完成事件，却仍每分钟轮询；
- 要求某个整点精确执行；
- 任务必须跨新会话、重启或长时间无人值守；
- 每次 tick 都让 Claude重新读取整套日志和指标。

官方文档给出的限制包括：最小粒度一分钟、计划可能带确定性 jitter、会话忙时只在 turn 结束后执行、不补跑每一次错过的触发、循环七天后过期，并且只有 Claude Code 仍在运行且空闲时才会触发。[Scheduled tasks：How scheduled tasks run](https://code.claude.com/docs/en/scheduled-tasks#how-scheduled-tasks-run)

所以 `/loop` 是好用的兜底，但不是夜间 Auto Research 的可靠主循环。

## `/goal`：用来完成环境复现，不用来等待训练

`/goal` 的触发点是“Claude 刚完成一轮工作”。每轮结束后，一个独立的小模型根据对话中已经出现的证据判断条件是否满足；不满足就立刻让主 Claude 继续，满足才停止。[Goal：How evaluation works](https://code.claude.com/docs/en/goal#how-evaluation-works)

这非常适合下面的阶段：

- 从空环境安装依赖，直到 smoke test 通过；
- 修复 CUDA、编译器或 Python 版本冲突；
- 复现论文 baseline，直到确定性验证脚本通过；
- 修复数据预处理，直到样本数量、哈希和单元测试满足约束；
- 完成一轮结果分析，直到 summary、图表和 next-action 都生成并通过 schema 校验。

一个更强的环境复现 Goal 可以写成：

```text
/goal 在隔离环境中完成 baseline 复现，并在最终回答中展示以下证据：
`python -m pytest tests/reproduction -q` 退出码为 0；
`python tests/verify_baseline.py record/auto-research/grpo-01/baseline/metrics.json`
退出码为 0；不得修改 verify_baseline.py 和基线容差；
若 15 个 turn 后仍无法满足，写出 blocker、已验证事实和最小复现命令后停止。
```

### 为什么不能拿 Goal 等两小时训练

Goal 在上一轮结束后会马上继续工作。训练尚未完成时，它容易反复检查进程和日志，形成昂贵的忙循环。等待外部状态变化应交给 Monitor、低频 `/loop` 或外部控制器。

### Goal 的证据边界

Goal 的 evaluator 不会自行读取文件或运行命令，只能判断 Claude 已经放进对话记录的证据。因此必须让主 Claude实际执行验证命令，并明确报告退出码和结果。官方文档建议使用可测量终态、明确检查方法和禁止修改的约束；条件最长 4,000 字符，每个会话同时只能有一个 active goal。[Goal：Write an effective condition](https://code.claude.com/docs/en/goal#write-an-effective-condition)

“15 个 turn 后停止”仍然是模型根据对话做的条件判断，不是硬 timeout。真正的试验次数、进程时限和费用上限必须由外部控制器或 CLI 硬限制执行。

## 四种机制放进同一套 Auto Research 后如何分工

| 当前发生的事情 | 应使用的机制 | 原因 |
| --- | --- | --- |
| Claude 正在配置 Conda/CUDA 环境并不断修复错误 | `/goal` | 需要连续主动工作，结束条件可用测试证明 |
| Claude 准备改实验配置 | `PreToolUse` / `PostToolUse` Hook | 在生命周期节点做范围检查和 schema 校验 |
| GPU 正在运行两小时训练 | 外部控制器 | 此时不需要 Agent，不应产生模型调用 |
| 训练刚刚结束，当前会话仍活着 | Monitor | 状态变化发生时立即唤醒 Claude |
| 无法产生事件，只能查询训练状态 | 低频 `/loop` | 定时重新评估，接受延迟和额外 turn |
| Claude 被唤醒后需要总结并生成下一组配置 | `/goal` 或 command Stop hook | 保证本阶段产物和确定性验证齐全 |
| Claude Code 进程退出后实验仍须继续 | 外部控制器 + `claude -p` | 状态与执行不依赖某个活会话 |

由此也能看出，Monitor、Hooks、Loop、Goal 不是四选一。它们可以组合，但可靠性仍由外部状态机承担。

## 推荐架构：活会话版与耐久版

### 活会话版

适合单机试验、会话能够整晚保持运行、偶尔中断可以人工恢复的情况：

```text
Claude 交互会话
  ├─ /goal 完成环境和 baseline
  ├─ 启动外部 experiment-controller
  ├─ Monitor 监听 controller 的结构化事件
  ├─ Hooks 校验 Claude 写出的配置和总结
  └─ 每次 run_finished 后生成下一轮配置
```

它的优势是上下文连续、事件响应快。弱点是 Monitor 和 `/loop` 都依赖当前会话；会话结束后，控制器即使还在跑，Claude 也不会自动接回原来的监视任务。

### 耐久版：更适合真正的夜间 Auto Research

把实验控制器交给 Windows Task Scheduler、systemd、CI runner 或其他本地进程监督器。控制器全程保存状态，并只在需要分析时调用 Claude Code 的非交互模式：

```text
操作系统调度器
  └─ experiment-controller
       ├─ 启动/等待训练进程
       ├─ 写入 metrics、logs、state、event
       ├─ 训练结束后调用一次 claude -p
       ├─ 校验 Claude 返回的结构化 next-action
       └─ 启动下一轮或按硬条件停止
```

Claude Code 官方将 `claude -p` 定位为脚本和 CI 中的非交互调用，并支持显式工具许可、结构化输出及继续会话。[Programmatic usage](https://code.claude.com/docs/en/headless)

这里有一个容易踩的坑：官方文档说明，`claude -p` 返回最终结果后，它启动的后台 Bash 任务大约五秒后会被终止。因此不要让一次 `claude -p` 调用启动三小时训练后立即退出；应由外部控制器拥有训练进程，训练结束后再调用 Claude。[Programmatic usage：Background tasks at exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)

这种架构即使 Claude 某次分析失败，训练记录和 campaign 状态仍然在磁盘上。控制器可以按 `event_id` 重试分析，而不是从聊天记忆里猜测运行到哪里。

## 建议的文件与状态协议

目录结构应把配置、程序、记录和验证代码分开：

```text
research/
  configs/
    baseline.yaml
    generated/
  scripts/
    experiment-controller.py
    train.py

record/
  auto-research/
    grpo-01/
      campaign_state.json
      events.jsonl
      campaign_summary.md
      runs/
        run-0001/
          config.yaml
          manifest.json
          stdout.log
          stderr.log
          metrics.json
          analysis.md

tests/
  validate_experiment_config.py
  validate_metrics.py
  verify_baseline.py
```

`campaign_state.json` 至少应记录：

- campaign 当前状态和 schema 版本；
- 当前与下一次 `run_id`；
- 已完成、失败和已分析的 run 集合；
- 开始时间、deadline、最大试验次数和 GPU 时数；
- 连续失败次数；
- 最佳指标、对应配置和比较方向；
- 最近一个已处理 `event_id`；
- 人工停止标志和停止原因。

状态更新应采用临时文件写完后原子替换，事件日志应追加写入。Claude 给出的 `next-action` 必须经过 JSON Schema、参数范围、重复配置和剩余预算检查后，控制器才允许执行。

## 控制器的最小逻辑

下面是结构示意，不依赖具体训练框架：

```python
while not hard_stop_reached(state):
    run = reserve_next_run(state)
    result = run_experiment_and_wait(run)   # 此处没有 Agent

    persist_logs_metrics_and_exit_code(run, result)
    event = append_terminal_event(run, result)

    if live_claude_session:
        print(json.dumps(event), flush=True)  # 交给 Monitor
        wait_for_validated_next_action(run)
    else:
        invoke_claude_analysis(run)           # 单次 claude -p
        validate_next_action(run)

    update_campaign_state_atomically(state)
```

Claude 的结构化输出可以限制为：

```json
{
  "decision": "continue | retry | stop",
  "next_config_path": "research/configs/generated/run-0002.yaml",
  "summary_path": "record/auto-research/grpo-01/runs/run-0001/analysis.md",
  "hypothesis": "提高 group size 是否能降低 reward variance",
  "evidence_run_ids": ["run-0001"]
}
```

本机 `2.1.190` 已确认提供 `--bare`、`--json-schema` 和 `--max-budget-usd`。为了让脚本调用可复现，可以使用 bare mode 并显式传入设置和允许的工具；需要项目 Hooks 时，应通过 `--settings` 显式加载，或不要使用 `--bare`，因为 bare mode 默认跳过自动发现的 Hooks、skills、plugins、MCP 和项目上下文。[Programmatic usage：Bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)

当前在线 CLI 文档还列出 `--max-turns`，但本机 `2.1.190` 的 `claude.cmd --help` 没有该参数。未升级并重新验证前，最大 Claude 调用次数和进程 timeout 应由外部控制器执行；不能照抄新文档参数后假设本机已经支持。[CLI reference](https://code.claude.com/docs/en/cli-reference)

## 必须由程序执行的硬边界

以下条件不应交给 `/goal` evaluator 或 Claude 自我声明：

| 边界 | 执行者 |
| --- | --- |
| 最多运行多少个 trial | 实验控制器 |
| 最晚几点停止 | 操作系统时钟与控制器 |
| 单次训练最长时间 | 子进程 timeout / job scheduler |
| 最大 GPU 时数 | 控制器根据实际运行时间累计 |
| 指标是否为 NaN、文件是否完整 | 确定性验证脚本 |
| 是否重复运行相同配置 | 配置哈希和数据库/状态文件 |
| Claude 最多分析多少次 | 控制器计数 |
| 单次 Claude 预算 | 本机可用的 `--max-budget-usd` |
| 可读写哪些路径 | sandbox、worktree、permission rules |
| 人工紧急停止 | 控制器监听的 STOP 文件或明确停止标志 |

Claude 可以解释“为什么继续”，但只有控制器能够可靠地决定“是否还允许继续”。

## 故障后如何恢复

### 训练进程失败

控制器保存退出码和关键 stderr，生成唯一 `run_failed` 事件。Claude 只分析一次；若建议 retry，必须生成新 `run_id` 并记录它来自哪个失败 run。

### Claude 分析失败

不要把 run 标为已分析。控制器根据同一个 `event_id` 重试，并限制最大重试次数。结构化输出未通过 schema 时视为分析失败，不启动新实验。

### Claude 会话退出

活会话版中的 Monitor 会消失，但训练控制器和磁盘状态仍在。重新打开会话后，根据 `campaign_state.json` 找到未分析的终态 run，重新安装 Monitor，再补做分析。

### 机器重启

控制器启动时检查记录中的 PID 是否仍存在、run 是否有终态文件、GPU 是否仍被占用。状态不确定时标记 `recovery_required`，不要直接重跑，以免重复占用资源。

### 连续实验都失败

控制器在连续失败达到上限后硬停止；Claude 生成 blocker 报告，但不能自行提高失败上限后继续烧算力。

## 选择机制时只问四个问题

### 是“发生变化再处理”，还是“定时重新检查”

- 能输出完成/失败事件：Monitor。
- 只能查询状态：低频 `/loop`。
- 需要跨会话可靠运行：外部控制器，不依赖二者保存状态。

### 是“Claude 行动的前后”，还是“训练系统自己的事件”

- Claude 准备改配置、执行命令或结束：Hook。
- 训练进程结束、指标生成、GPU job 失败：Monitor 或外部控制器。

### 当前阶段需要 Claude 持续工作，还是应该等待

- 配环境、修错误、跑验证直到通过：`/goal`。
- 等待两小时训练：控制器等待；需要通知时用 Monitor。

### 完成条件能否写成确定性程序

- 能：优先测试脚本或 command Stop hook。
- 只能做语义判断：才使用 `/goal` 或 prompt/agent Hook。

## 常见失败设计

- **用 `/goal` 等训练结束。** 它会立即继续下一轮，容易形成忙循环。
- **用 `/loop 1m` 轮询两小时训练。** 无变化也会产生 Agent turn；事件型 Monitor 或外部控制器更合适。
- **让 Claude 自己记住试验队列。** 会话中断或压缩后不可靠；队列必须落盘。
- **把完整训练日志送进 Monitor。** 每行都会成为事件，应只发送状态变化和日志路径。
- **让 `claude -p` 持有长训练进程。** Claude 返回后后台任务会很快终止；训练应由控制器持有。
- **把 Hook 当安全沙箱。** Hook 仍以本机用户权限运行；硬权限依赖 sandbox 和 permission rules。
- **把模型判断当硬预算。** 试验次数、GPU 时间、deadline 和进程 timeout 必须由程序执行。
- **没有幂等事件 ID。** Claude 或控制器重试后可能重复分析、重复启动相同实验。
- **结果不经验证直接进入下一轮。** metrics 缺失、NaN 或 schema 错误时，应先由脚本拦截。

## 最终建议

针对“夜间自动跑参数优化并记录；实验期间不需要 Agent；实验结束后总结并继续；自动完成环境配置和复现”这一目标，推荐顺序是：

- 用 `/goal` 完成环境配置、依赖修复和 baseline 复现，但把验收写成测试退出码与指标验证脚本；
- 用 Hooks 校验 Claude 写出的配置、结果记录和停止条件，不让高风险操作只靠 prompt 约束；
- 用独立实验控制器运行训练、保存状态并执行所有硬预算；
- 活会话稳定时，用 Monitor 接收 `run_finished` / `run_failed` 事件；
- 没有事件源时才用低频 `/loop`；
- 要承受会话退出或机器重启时，由操作系统调度器启动控制器，并在每个分析节点调用一次 `claude -p`；
- 所有关键状态、证据和下一步决策都写入 `record/`，对话只作为分析过程，不作为唯一事实来源。

这套结构的本质不是“让 Claude 一直跑”，而是“只在需要推理时调用 Claude，其余时间由普通程序可靠执行”。

## 主要来源

以下均为 Claude Code 官方一手资料：

- [Tools reference：Monitor tool](https://code.claude.com/docs/en/tools-reference#monitor-tool)
- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Run prompts on a schedule：`/loop` 与会话计划](https://code.claude.com/docs/en/scheduled-tasks)
- [Keep Claude working toward a goal：`/goal`](https://code.claude.com/docs/en/goal)
- [Run Claude Code programmatically：`claude -p`](https://code.claude.com/docs/en/headless)
- [CLI reference](https://code.claude.com/docs/en/cli-reference)

## 事实边界

- 本文依据官方公开行为和本机 `2.1.190` 的版本及帮助输出，不声称掌握 Claude Code 未公开的内部 prompt 或调度实现。
- WebSocket Monitor 的版本要求、当前 CLI 参数和 Hook 行为会随 Claude Code 更新。部署前应在目标机器运行 `claude --version` 与 `claude --help`，不要仅依据文章日期判断能力。
- “事件过滤、稳定 ID、原子状态、幂等重试、外部控制器持有训练进程”是根据官方公开生命周期推导出的工程方案，不是 Claude Code 自动提供的可靠性协议。
- 本文刻意不纳入依赖 Claude.ai 或 Anthropic 专属账号体系的托管能力，以符合本次使用范围。
