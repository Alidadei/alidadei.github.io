# Claude Code 本机能力核验记录

日期：2026-07-13  
工作目录：`R:\Project\TOYS\alidadei.github.io`

## 1. 版本

PowerShell 中直接执行：

```powershell
claude --version
```

结果：失败。PowerShell 优先解析到 `C:\Users\y7\AppData\Roaming\npm\claude.ps1`，当前系统执行策略禁止加载该脚本。

改用 npm 生成的 cmd shim：

```powershell
claude.cmd --version
```

结果：

```text
2.1.190 (Claude Code)
```

因此调研报告以 `2.1.190` 作为本机已安装版本；这里没有修改 PowerShell execution policy。

## 2. 本机 Monitor 类型

检查文件：

```text
C:\Users\y7\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\sdk-tools.d.ts
```

本机 `MonitorInput` 暴露：

- `description: string`
- `timeout_ms: number`
- `persistent: boolean`
- `command: string`

字段注释说明：

- 默认 timeout 为 `300000 ms`；
- 最大 timeout 为 `3600000 ms`；
- `persistent` 持续到 `TaskStop` 或会话结束；
- 每一行 stdout 是一个事件；命令退出后 watch 结束。

本机 `2.1.190` 的该类型中没有 `ws` 输入。官方在线文档注明 WebSocket source 要求 Claude Code `2.1.195+`，与本机版本差异一致。

## 3. 本机自适应 Loop 类型

同一类型文件中的 `ScheduleWakeupInput` 注释说明：

- `delaySeconds` 由 runtime 限制在 `[60, 3600]`；
- 即自适应 `/loop` 的下一次唤醒为 1～60 分钟。

## 4. 边界

- 这次核验没有启动 Claude 在线会话、没有产生模型调用，也没有实际启动 Monitor/Loop/Goal。
- 对 hooks、Channels、Routines 等行为的结论来自官方在线文档，不声称已在本机逐项做端到端实验。
- 官方在线文档包含高于 `2.1.190` 的功能说明，因此不能用本机类型文件否定新版本能力。
