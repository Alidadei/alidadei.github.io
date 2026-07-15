# Claude Code Plan Mode 调研报告：运行机制、Ultraplan 限制与自实现方案

调研日期：2026-07-08

本报告只把有官方文档或本机可验证证据支撑的内容作为事实。没有公开证据的部分标为推断或设计建议。

## 摘要

Claude Code 的 plan mode 是一种权限模式和交互流程，不是公开的独立规划算法。它让 Claude 在动手改代码前先读取项目、运行探索性命令、提出计划，并在用户批准前阻止自动编辑源码。

Ultraplan 是官方围绕 plan mode 提供的云端扩展：从本地 Claude Code CLI 发起 planning task，把计划交给 Claude Code on the web 生成和审阅，用户在浏览器里对计划做 inline comment、reaction、章节跳转和修订，最后选择在云端执行并创建 PR，或把计划回传本地 terminal 执行。

但 Ultraplan 处于 research preview，且依赖 Claude Code on the web 账号、GitHub repository 和 Anthropic cloud infrastructure。满足 Claude Code CLI 版本号不等于一定可用。当前本机 Claude Code v2.1.195 中，`claude.cmd --help` 可见 `ultrareview` 顶层子命令，但交互式 CLI 未看到 `/ultraplan`；因此当前环境应判定为 Ultraplan Not Available，而不是功能测试失败。

如果要自己实现一个“任意项目下可用”的类似机制，建议做成“全局 CLI + Claude Code 个人插件/Skill + 本地浏览器审阅界面 + 权限受控执行器”。不要把实现嵌入某个业务仓库。

## 1. Plan Mode 的官方定义

官方 permission modes 文档对 plan mode 的定义是：Claude 会研究并提出变更方案，但不会修改源码；它可以读取文件、运行 shell 命令探索并写出计划，权限提示仍像 Manual/default 模式一样生效。进入方式包括：

- 会话中按 `Shift+Tab` 切换到 plan mode；

- 用 `/plan` 前缀发起单次计划；

- 启动 CLI 时使用 `claude --permission-mode plan`；

- 在 `.claude/settings.json` 中设置 `permissions.defaultMode` 为 `plan`。

  ![image-20260709150055661](./../public/images/posts/image-20260709150055661.png)

官方还说明，计划完成后 Claude 会展示计划并询问下一步。可选项包括：

- 批准并进入 auto mode；
- 批准并 accept edits；
- 批准并逐项手动审阅编辑；
- 带反馈继续规划；
- 用 Ultraplan 进入浏览器审阅。

批准计划会退出 plan mode，并切换到所选执行权限模式，然后 Claude 才开始编辑。

来源：Claude Code permission modes 文档  
https://code.claude.com/docs/en/permission-modes

## 2. Plan Mode 的运行机制

从用户可见行为和 Agent SDK 权限文档看，plan mode 可以拆成两层：

1. 模型层：Claude 仍然按 agent loop 工作，收集上下文、选择工具、读取结果、继续推理并生成计划。
2. 权限层：写文件、编辑源码、shell 写操作不会在计划阶段自动批准，而是被路由到审批回调或用户确认。

Agent SDK 文档给出的工具权限评估顺序是：

```text
hooks
-> deny rules
-> ask rules
-> permission mode
-> allow rules
-> canUseTool callback
```

关键点在 `permission mode` 这一步：官方 SDK 文档明确说，`plan` 会把文件编辑和 shell 写操作路由到 `canUseTool` callback，即使 allow rule 匹配，计划阶段的写操作也不能被自动批准。

这说明 plan mode 的安全边界主要来自权限系统，而不是“模型不会想到要改文件”。模型仍可能提出或请求动作，但权限层会阻断自动写入。

来源：Claude Agent SDK permissions 文档  
https://code.claude.com/docs/en/agent-sdk/permissions

## 3. Plan Mode 与其他权限模式的区别

简化对比如下：

| 模式 | 核心行为 | 适用场景 |
| --- | --- | --- |
| `default` / Manual | 读操作自动，编辑和多数命令需要确认 | 敏感任务、初次探索 |
| `acceptEdits` | 自动批准文件编辑和常见文件系统命令 | 快速迭代，但仍要事后 review diff |
| `plan` | 读取和探索，生成计划，不自动编辑源码 | 大改动、重构、迁移前审查方案 |
| `auto` | 用后台安全分类器减少提示 | 长任务、低风险自动化 |
| `dontAsk` | 只运行预批准工具，其余直接拒绝 | CI、锁定工具面的自动任务 |
| `bypassPermissions` | 跳过大多数权限提示 | 仅适合隔离容器或 VM |

plan mode 的价值不是“更强推理”，而是“先规划、后执行”的人机协作边界。

## 4. Ultraplan 是什么

官方 Ultraplan 文档的标题是 “Plan in the cloud with ultraplan”。它的定位是：

```text
从本地 CLI 启动计划
-> 在 Claude Code on the web 云端 plan mode 会话中起草
-> 浏览器审阅和修订
-> 云端执行或回传本地 terminal 执行
```

官方描述的能力包括：

- 从 CLI 启动 planning task；
- 云端生成计划，本地 terminal 可以继续做别的事；
- 浏览器中打开专门 review view；
- 对计划具体段落添加 inline comment；
- 用 emoji reaction 表示认可或担忧；
- 用 outline sidebar 在计划章节之间跳转；
- 要求 Claude 根据评论修订计划；
- 最后选择在 web 上执行并创建 PR，或把计划传回本地 terminal。

来源：Ultraplan 官方文档  
https://code.claude.com/docs/en/ultraplan

## 5. Ultraplan 当前适用限制

官方明确限制：

- 处于 research preview，行为和能力可能变化；
- 要求 Claude Code v2.1.91 或更高版本；
- 需要 Claude Code on the web 账号；
- 需要 GitHub repository；
- 运行在 Anthropic cloud infrastructure；
- 不支持 Amazon Bedrock；
- 不支持 Google Cloud Agent Platform；
- 不支持 Microsoft Foundry；
- 如果没有 cloud environment，首次启动时会自动创建。

官方描述的入口有三种：

- `/ultraplan <prompt>`；
- 普通 prompt 中包含 `ultraplan` 关键词；
- 本地 plan mode 完成后，在批准对话框里选择 “No, refine with Ultraplan on Claude Code on the web”。

但另一个官方 commands 文档也说明：不是每个命令都会出现在每个用户那里，命令可用性取决于 platform、plan 和 environment。因此，即使版本满足最低要求，`/ultraplan` 也可能不出现在当前账号或环境里。

来源：

- Ultraplan 官方文档：https://code.claude.com/docs/en/ultraplan
- Commands 官方文档：https://code.claude.com/docs/en/commands

## 6. 当前本机环境结论

本机检查结果：

```powershell
claude.cmd --version
```

返回：

```text
2.1.195 (Claude Code)
```

说明本机版本高于 Ultraplan 官方最低版本 v2.1.91。

但：

- `claude.cmd --help` 显示顶层 CLI 子命令中有 `ultrareview`；
- `claude.cmd --help` 没有显示 `ultraplan`；
- 交互式 Claude Code CLI 中未看到 `/ultraplan`；
- 在交互式会话里输入 `/ultrareview` 报 `Unknown command` 是正常的，因为 `ultrareview` 是外层 shell 中使用的顶层 CLI 子命令，不是 slash command。

因此，对当前本机环境的严格结论是：

```text
Claude Code plan mode 可测。
Ultraplan 当前不可测，应记录为 Not Available。
原因不是版本不足，而是当前账号/环境未暴露该 research preview 入口。
```

## 7. 自己实现类似机制的目标边界

如果要自己实现，能实现的是“类 Ultraplan 工作流”，不能实现官方 Ultraplan 本身。

可以实现：

- 任意项目目录中发起计划；
- 计划作为可审阅工件保存；
- 本地浏览器审阅计划；
- inline comment、reaction、outline；
- 根据批注修订计划；
- 批准后受控执行；
- 执行后 diff review；
- 可选 GitHub PR 创建。

不能直接实现：

- 官方内置 `/ultraplan` 命令；
- Claude Code on the web 的官方专用 review view；
- Anthropic cloud session 内部调度；
- 官方账号权限体系。

## 8. 推荐实现形态：全局 CLI + Claude Code 插件

为了“任意项目下都有这个功能”，实现不应放进单个业务项目。推荐做成：

```text
全局 CLI：lpr
Claude Code 个人插件：local-plan-review
本地审阅 Web UI：http://localhost:<port>
用户级 session 存储目录：~/.local-plan-review 或 %LOCALAPPDATA%\LocalPlanReview
```

官方插件文档支持这种方向：Claude Code 插件可以跨项目复用，插件可包含 skills、agents、hooks、MCP servers、bin 可执行文件；插件 skill 会用命名空间调用，例如 `/my-plugin:hello`。插件也可以放在 `~/.claude/skills/<plugin-name>/` 下自动加载。

来源：Claude Code plugins 文档  
https://code.claude.com/docs/en/plugins

## 9. 全局命令设计

建议命令名用 `lpr`，即 Local Plan Review。

```powershell
lpr plan "规划本次改动，先不要执行"
lpr open
lpr revise
lpr execute --manual
lpr status
lpr list
lpr stop
```

对应 Claude Code 插件命令可以是：

```text
/local-plan-review:plan <任务描述>
/local-plan-review:open
/local-plan-review:revise
/local-plan-review:execute
```

不要抢占 `/plan` 或 `/ultraplan` 名称。`/plan` 是官方内置命令，`/ultraplan` 是官方预览能力名称；自实现应用命名空间，避免冲突。

## 10. 存储结构设计

用户级存储，不污染任意项目：

```text
%LOCALAPPDATA%\LocalPlanReview\sessions\
  <repo-hash>\
    <session-id>\
      metadata.json
      plan.v1.md
      plan.v2.md
      comments.json
      reactions.json
      execution-policy.json
      final-plan.md
      execution-log.md
```

`metadata.json` 示例：

```json
{
  "sessionId": "20260708-001",
  "cwd": "R:/Project/example",
  "gitRoot": "R:/Project/example",
  "branch": "main",
  "head": "abc123",
  "createdAt": "2026-07-08T22:30:00+08:00",
  "status": "draft"
}
```

`execution-policy.json` 示例：

```json
{
  "allowedPaths": ["docs/**", "tests/**"],
  "deniedCommands": ["git push", "git reset --hard", "git clean -fd"],
  "requireManualReview": true,
  "requireCleanWorkingTree": false
}
```

## 11. 计划生成阶段

目标：只生成计划，不修改项目。

推荐实现：

1. `lpr plan` 获取当前 Git 信息：

   ```powershell
   git rev-parse --show-toplevel
   git status --short
   git branch --show-current
   git rev-parse HEAD
   ```

2. 采集轻量项目上下文：

   ```powershell
   rg --files
   ```

3. 调用 Claude Code 或 Agent SDK 生成计划。

更严格的做法是使用 Agent SDK，并设置：

```text
permissionMode: "plan"
```

同时加工具限制：只允许读取、搜索和少量安全 git 命令。不要只靠 prompt 说“不要修改文件”，权限层也要限制写入。

输出：

```text
plan.v1.md
metadata.json
```

计划必须包含：

- 目标；
- 已知上下文；
- 影响范围；
- 文件修改清单；
- 执行步骤；
- 验证步骤；
- 风险；
- 回滚方式；
- 需要用户确认的问题。

## 12. 浏览器审阅阶段

`lpr open` 启动本地 Web UI：

```text
http://localhost:4317/sessions/<session-id>
```

UI 能力：

- Markdown 渲染；
- 标题、段落、列表项生成稳定 section id；
- 选中文本添加 inline comment；
- 给段落加 reaction：approve / concern / question；
- outline sidebar 跳章节；
- comment 状态：open / addressed / resolved；
- 显示 plan version diff；
- 按钮：Revise plan、Approve for local execution、Export。

关键实现点：

- comment 不直接写入 plan 文本；
- comment 存到 `comments.json`；
- 每次修订生成新版本 `plan.vN.md`；
- 保留历史版本，方便回退。

## 13. 计划修订阶段

`lpr revise` 读取：

```text
plan.vN.md
comments.json
reactions.json
metadata.json
```

调用模型生成新计划：

```text
plan.vN+1.md
```

修订 prompt 必须要求：

- 只修订计划，不执行代码改动；
- 明确逐条回应 open comments；
- 保留未解决问题；
- 更新风险和验证步骤；
- 输出结构化变更摘要。

可以额外生成：

```json
{
  "addressedComments": ["comment-001", "comment-003"],
  "unresolvedComments": ["comment-004"],
  "summary": "补充了验证步骤和回滚策略"
}
```

## 14. 执行阶段

执行阶段是风险最高的部分。必须有审批闸门。

推荐三个执行模式：

```text
lpr execute --manual
lpr execute --accept-edits --allowed "docs/**"
lpr export
```

`--manual` 是默认模式。流程：

1. 检查当前目录是否仍是原 git root；
2. 检查 branch 和 HEAD 是否与计划生成时一致；
3. 展示 final-plan.md；
4. 要求用户确认；
5. 启动 Claude Code 执行，建议使用 default/manual 权限；
6. 每次编辑人工批准；
7. 执行后自动运行：

   ```powershell
   git status --short
   git diff
   ```

如果要允许自动编辑，必须加路径 allowlist 和命令 denylist。比如 docs-only 计划只能改：

```text
docs/**
record/**
tests/**
```

并禁止：

```text
git reset --hard
git clean -fd
git push --force
删除项目外文件
访问生产凭据
生产部署
数据库迁移
```

## 15. 任意项目可用的插件结构

插件目录建议放在用户级 Claude Code skills 目录：

```text
~/.claude/skills/local-plan-review/
  .claude-plugin/
    plugin.json
  skills/
    plan/
      SKILL.md
    open/
      SKILL.md
    revise/
      SKILL.md
    execute/
      SKILL.md
  bin/
    lpr
```

`plugin.json` 示例：

```json
{
  "name": "local-plan-review",
  "description": "Create, review, revise, and execute implementation plans across projects.",
  "version": "0.1.0",
  "author": {
    "name": "local"
  }
}
```

`skills/plan/SKILL.md` 示例：

```markdown
---
description: Create a reviewable implementation plan for the current project without editing project files.
---

Use the `lpr plan "$ARGUMENTS"` command to create a local plan-review session.

Rules:
- Do not edit project files during planning.
- Store plan artifacts in the user-level LocalPlanReview session directory.
- After creating the plan, report the session id and how to open the review UI.
```

插件加载后，调用形态是：

```text
/local-plan-review:plan 重构登录模块，先生成计划不要改代码
```

官方插件文档说明，插件技能会被命名空间化，`bin/` 中的可执行文件会被加入 Bash tool 的 PATH；这正适合放 `lpr` 这类跨项目工具。

## 16. 安全机制设计

自实现版本最重要的不是 UI，而是权限和审计。

最低安全要求：

- planning 阶段不写业务项目；
- review 阶段只写 session 目录；
- revise 阶段只生成新 plan version；
- execute 阶段必须显式批准；
- 执行前后都记录 `git status`；
- 执行后保存 `git diff`；
- 路径 allowlist 默认关闭，用户明确开启才允许自动写；
- 高风险命令 denylist 永远启用；
- 支持 dry-run；
- 支持保存计划但不执行；
- 支持把执行放到 git worktree 中隔离。

更稳的实现：

- 对每个计划创建临时 worktree；
- Claude 只在 worktree 中执行；
- 执行完成后生成 patch；
- 用户确认 patch 后再合并回主工作区。

## 17. MVP 版本路线

第一阶段：文件式审阅

- `lpr plan` 生成 `plan.v1.md`；
- `lpr open` 打开本地网页；
- 支持段落 comment；
- `lpr revise` 生成 `plan.v2.md`；
- 不实现执行，只导出 final-plan。

第二阶段：本地执行

- `lpr execute --manual`；
- 执行前检查 git 状态；
- 执行后保存 diff；
- 手动批准每次编辑。

第三阶段：插件化

- 创建 `~/.claude/skills/local-plan-review`；
- 提供 `/local-plan-review:plan`；
- 插件 `bin/lpr` 自动进入 PATH；
- 所有项目可用。

第四阶段：高级能力

- GitHub PR 创建；
- worktree 隔离；
- 多人共享审阅；
- WebSocket 实时状态；
- 与 GitHub review comment 同步。

## 18. 实现方案的技术选型建议

本地 CLI：

- Node.js：更适合和 Markdown、Web UI、Claude Code CLI 集成；
- 或 Rust/Go：更适合打包成单文件。

Web UI：

- React/Vite 或 SvelteKit；
- 本地 Express/Fastify server；
- Markdown parser 使用 `markdown-it` 或 `unified/remark`；
- comment anchor 使用 section id + text range。

模型调用：

- 优先用 Claude Agent SDK，便于设置 `permissionMode: "plan"`；
- 简化版可调用 `claude -p`，但要额外控制工具权限和输出格式；
- 执行阶段建议交还 Claude Code interactive session，而不是自己偷偷执行 patch。

## 19. 与官方 Ultraplan 的差异

| 能力 | 官方 Ultraplan | 自实现本地版 |
| --- | --- | --- |
| 入口 | `/ultraplan` 或 plan dialog | `/local-plan-review:plan` |
| 审阅界面 | Claude Code on the web | 本地 localhost |
| 云端计划 | Anthropic cloud | 本地或自托管 |
| Inline comment | 官方支持 | 需要自建 |
| Reaction | 官方支持 | 需要自建 |
| 回传 terminal | 官方支持 | 可用本地 CLI 实现 |
| 云端执行并开 PR | 官方支持 | 需自建 GitHub 集成 |
| 账号限制 | 需要 Claude Code on the web | 不需要官方 web 账号 |
| 可用性 | preview，取决于账号/环境 | 由你自己的安装决定 |

## 20. 结论

Claude Code plan mode 的核心是“计划阶段的权限闸门”：允许读和探索，阻止自动写入，批准后才进入执行权限模式。Ultraplan 是官方基于 Claude Code on the web 提供的云端计划审阅扩展，但它目前受 preview、账号、环境、GitHub repository 和云基础设施限制。

如果要在任意项目下拥有类似能力，最现实的路线不是等待 `/ultraplan`，而是自建一个全局 `local-plan-review` 插件和 `lpr` CLI。第一版应先实现本地计划工件、浏览器批注、计划修订和手动执行。自动执行、PR 创建和多人协作应放到后续阶段，并且必须建立路径 allowlist、命令 denylist、git diff 审计和 worktree 隔离。

## 参考来源

- Claude Code permission modes: https://code.claude.com/docs/en/permission-modes
- Claude Code Ultraplan: https://code.claude.com/docs/en/ultraplan
- Claude Code commands: https://code.claude.com/docs/en/commands
- Claude Agent SDK permissions: https://code.claude.com/docs/en/agent-sdk/permissions
- Claude Code plugins: https://code.claude.com/docs/en/plugins
