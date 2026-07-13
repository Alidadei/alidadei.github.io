# Claude Code Plan Mode 原理与运行机制调研

调研日期：2026-07-08

## 结论

Claude Code 的 plan mode 本质上是一个“计划优先”的权限模式和交互流程，而不是一个公开的独立规划算法。它仍然运行在 Claude Code 的 agentic loop 上：模型根据上下文选择工具，读取代码、搜索、运行必要命令，获得结果后继续推理；区别在于权限层把写入和修改类动作拦住，让会话停留在“调查、提出方案、等待批准”的阶段。

官方文档对 plan mode 的定义很明确：Claude 会读取文件、运行命令做探索并写出计划，但在用户批准前不编辑源码。进入方式包括 `claude --permission-mode plan`、会话中按 `Shift+Tab` 切换、或用 `/plan [description]` 前缀启动一次规划任务。

## 运行链路

一个典型 plan mode 回合可以拆成 6 步：

1. 用户进入 plan mode。

   方式包括 CLI 参数、快捷键、`/plan` 命令，或配置 `.claude/settings.json`：

   ```json
   {
     "permissions": {
       "defaultMode": "plan"
     }
   }
   ```

2. Claude Code 构造会话上下文。

   上下文通常包括对话历史、项目文件内容、命令输出、`CLAUDE.md`、auto memory、系统提示、可用工具说明等。Claude Code 的核心架构不是“先固定生成一个计划再机械执行”，而是 gather context -> take action -> verify results 的循环。

3. 模型进行探索。

   在 plan mode 下，Claude 可以读取文件、搜索代码、理解 git 状态，并运行探索性 shell 命令。这里要注意：plan mode 不是“完全禁用 shell”，而是仍然受到权限系统控制。只读命令通常可以运行；有副作用或非只读命令仍会触发审批，权限提示规则与 Manual/default 模式类似。

4. 权限层拦截写操作。

   这是 plan mode 的关键机制。Agent SDK 文档给出的低层权限评估顺序是：

   hooks -> deny rules -> ask rules -> permission mode -> allow rules -> `canUseTool` callback。

   在 `permission mode` 这一步，`plan` 模式会把文件编辑和 shell 写操作路由到用户/宿主审批，而不是自动批准；SDK 文档还明确说，plan mode 中即使 allow rule 匹配，文件编辑也不会被自动批准。

5. Claude 产出计划并暂停。

   计划完成后，CLI 会显示计划并询问下一步。官方列出的选项包括：

   - Approve and start in auto mode
   - Approve and accept edits
   - Approve and review each edit manually
   - Keep planning with feedback
   - 用 Ultraplan 把计划发送到浏览器里的云端审阅界面继续修改

6. 用户批准后退出 plan mode 并进入执行模式。

   批准计划后，Claude Code 会切换到你选择的权限模式，然后才开始真正编辑。也就是说，plan mode 的审批点不是普通确认框，而是执行阶段的权限模式选择器。

## 它“安全”的边界在哪里

plan mode 降低的是“未审查方案直接落盘”的风险，但不是完整沙箱。

它能做的：

- 阻止 Claude 在计划阶段自动修改源码。
- 让用户先审查方案，再选择 auto、acceptEdits 或 manual 执行。
- 保留原有权限规则、deny/ask 规则、hooks、受保护路径策略。
- 支持中途退出 plan mode 而不批准计划。

它不能保证的：

- 不能替代系统级沙箱。Claude 仍可能申请运行命令，命令是否能执行取决于权限规则和用户审批。
- 不能证明计划正确。计划只是模型基于当前上下文的推理结果，仍要通过测试、diff review、代码审查验证。
- 不能保证上下文永远完整。长会话会触发 compaction，早期约束可能被摘要化；持久规则应写进 `CLAUDE.md` 或权限配置。

## 与其他 permission modes 的区别

官方模式表可以概括为：

- `default` / Manual：读取无需问，编辑和多数命令要问。
- `acceptEdits`：读取、文件编辑、常见文件系统命令可自动执行。
- `plan`：读取和探索，提出计划，不自动编辑源码。
- `auto`：用后台安全分类器减少提示，仍会拦截高风险动作。
- `dontAsk`：只运行预批准工具，其他直接拒绝。
- `bypassPermissions`：跳过大多数提示和安全检查，只适合容器/VM 等隔离环境。

plan mode 和 auto mode 经常被混淆。plan mode 的核心是“先不改，先给计划”；auto mode 的核心是“允许执行，但用分类器判断风险”。两者解决的问题不同。

## 模型层面的特殊机制：`opusplan`

Claude Code 还有一个与 plan mode 相关的模型别名：`opusplan`。官方文档说明它会在 plan mode 使用 `opus`，执行阶段切到 `sonnet`。设计意图是：规划阶段用更强推理模型处理架构和方案判断，执行阶段用更高效的模型写代码。这个机制受模型可用性和组织 allowlist 影响；如果 Opus 被限制，`opusplan` 不会强行切到 Opus。

## Ultraplan 是 plan mode 的云端扩展

Ultraplan 不是本地 plan mode 的同义词，而是从 Claude Code CLI 发起、在 Claude Code on the web 中完成的云端计划审阅流程。官方文档说它处于 research preview，要求 Claude Code v2.1.91 或更高版本。

它和 CLI 的关系是：入口在 CLI，审阅界面在浏览器。你可以在本地 CLI 里通过三种方式启动：

- 运行 `/ultraplan` 加上任务描述；
- 在普通 prompt 里包含 `ultraplan` 这个词；
- 本地 plan mode 生成计划后，在批准对话框里选择用 Ultraplan 继续 refine。

所谓“审阅”，不是简单看一段终端文本，而是在 claude.ai 的专门 review view 里处理计划：

- 可以高亮计划中的具体段落并留下 inline comment；
- 可以对某一段加 reaction 表示认可或担忧；
- 可以用 outline sidebar 在计划各章节之间跳转；
- 让 Claude 根据评论修订计划，反复迭代，直到选择在哪里执行。

计划确认后有两条执行路径：

- 在云端执行并创建 PR；
- 把计划传回本地 terminal 执行；
- 取消并保存计划文件。

这说明 Anthropic 把“计划”当成一个可审阅工件，而不仅是模型回复文本。

## 可推断的设计思想

基于官方文档和独立架构分析，Claude Code 的整体设计更像“模型自由推理 + 工具执行框架 + 权限闸门”，而不是传统工作流引擎。独立论文把核心描述为一个调用模型、执行工具、重复的简单循环，复杂性主要在权限、上下文压缩、扩展机制、子代理和会话持久化这些外围系统。

所以 plan mode 的原理可以简化为：

```text
同一个 agent loop
  + 计划阶段提示/交互约束
  + 权限模式禁止自动写入
  + 审批后切换到执行权限模式
  + 可选模型策略 opusplan
  + 可选云端审阅 Ultraplan
```

## 实践建议

适合使用 plan mode 的场景：

- 大重构、迁移、跨模块修改。
- 你还不确定 Claude 是否理解项目结构。
- 需要先审查技术路线再允许落盘。
- 生产相关、权限相关、数据库迁移、基础设施变更。
- 希望把方案拿给人审阅或沉淀到 issue/PR 描述。

不建议只依赖 plan mode 的场景：

- 高风险命令、生产部署、数据删除：要配合 deny/ask rules、hooks、沙箱和人工审查。
- 需求本身含糊：先让 Claude 提问或补充验收标准。
- 计划很长且上下文会压缩：关键约束写入 `CLAUDE.md` 或明确配置，不要只靠早期聊天记录。

## 事实边界

Anthropic 没有公开 Claude Code plan mode 的全部内部源码级实现细节。因此，能确定的是官方文档描述的权限语义、交互入口、审批流程、SDK 权限评估顺序、`opusplan` 和 Ultraplan 行为。不能确定的包括：内部系统提示完整内容、CLI 内部状态机具体变量名、模型在 plan mode 下是否使用未公开的额外 hidden prompt。没有公开证据的部分不能当作事实。

## 来源

- Claude Code: Choose a permission mode: https://code.claude.com/docs/en/permission-modes
- Claude Code: How Claude Code works: https://code.claude.com/docs/en/how-claude-code-works
- Claude Code: Configure permissions: https://code.claude.com/docs/en/permissions
- Claude Agent SDK: Configure permissions: https://code.claude.com/docs/en/agent-sdk/permissions
- Claude Code: Commands: https://code.claude.com/docs/en/commands
- Claude Code: Model configuration: https://code.claude.com/docs/en/model-config
- Claude Code: Plan in the cloud with ultraplan: https://code.claude.com/docs/en/ultraplan
- Liu et al., Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems, arXiv 2604.14228: https://arxiv.org/abs/2604.14228
