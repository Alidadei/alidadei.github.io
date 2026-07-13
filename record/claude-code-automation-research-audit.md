# Claude Code 自动监视机制调研审计记录

- 审计日期：2026-07-12（Asia/Shanghai）
- 研究问题：比较 Monitor、Hooks、/loop、/goal，并补充其它自动监视与持久执行机制。
- 主要受众：技术读者。
- 正式交付模式：单一 HTML 报告；artifact JSON 是该 HTML 的规范化源，不是第二份报告。
- 证据优先级：Claude Code 官方在线文档 > 本机 CLI 只读输出 > 既有本地草稿。

## 本机只读证据

- claude.cmd --version：2.1.190 (Claude Code)
- claude.cmd --help：存在 --bg/--background 与 agents 子命令。
- claude.cmd agents --help：本机支持后台 agent view 的只读/管理入口。
- 当前工作区 .claude/settings.local.json 把 permissions.defaultMode 设为 bypassPermissions。这会放大无人值守运行的风险，正式报告必须显式提醒。
- 未启动付费会话、未创建 goal/loop/monitor/routine，也未改动任何外部系统；因此本报告核验的是文档语义与本机版本门槛，不声称完成了运行时延迟或成本基准测试。

## 对 2026-07-11 草稿的关键纠正

1. 官方没有 /monitor slash command；但 Monitor 是正式内置工具。插件还可以声明自动启动的 monitors。/background 与 claude agents 是寿命和可观测性机制，不是 Monitor 的别名。
2. Scheduled tasks 官方最低版本是 v2.1.72，不是草稿中的 v2.1.70。
3. Monitor v2.1.98 起支持命令输出流；WebSocket source 要求 v2.1.195。插件 monitors 要求 v2.1.105，且仍为 experimental component。
4. /loop 可以随会话移入后台 agent；但 agent view 文档明确说明，某些正在运行的 Monitor 无法在前台会话 backgrounding 时无损迁移。稳妥顺序是先进入后台会话，再在后台会话内启动 Monitor。
5. Desktop local scheduled tasks 是重要的中间层：无需打开具体 session、可访问本地未提交状态，但要求 Desktop app 开着且机器醒着。
6. Routines 不是整个 Claude Code 生态里唯一的持久自动化；GitHub Actions、GitLab CI/CD 和外部调度器调用 claude -p 也可实现持久触发。Routines 是 Anthropic 原生、机器关机仍能运行的云端方案。
7. /goal 是 session-scoped prompt-based Stop hook 的包装。Stop hook 文档规定连续 8 次阻止停止后 CLI 会结束 turn；把同一保护推及 /goal 是基于其包装关系的强推论，goal 页面本身没有另列一句“8 次上限”。
8. 在线官方 Week 28 发布范围已到 v2.1.206，而本机是 v2.1.190。仅凭版本满足最低门槛也不能证明功能已开放，仍受认证方式、订阅计划、组织策略和 provider 限制。
9. 预制 Telegram、Discord、iMessage channel 插件需要 Bun；不能把这个实现要求泛化成所有自定义 channel 协议都必然依赖 Bun。

## 主要官方证据

- Hooks reference: https://code.claude.com/docs/en/hooks
- Goals: https://code.claude.com/docs/en/goal
- Scheduled tasks and /loop: https://code.claude.com/docs/en/scheduled-tasks
- Tools reference / Monitor: https://code.claude.com/docs/en/tools-reference
- Plugins reference / plugin monitors: https://code.claude.com/docs/en/plugins-reference
- Channels: https://code.claude.com/docs/en/channels
- Agent view and background sessions: https://code.claude.com/docs/en/agent-view
- Routines: https://code.claude.com/docs/en/routines
- Desktop scheduled tasks: https://code.claude.com/docs/en/desktop-scheduled-tasks
- Commands: https://code.claude.com/docs/en/commands
- Programmatic usage: https://code.claude.com/docs/en/headless
- GitHub Actions: https://code.claude.com/docs/en/github-actions
- Feature availability: https://code.claude.com/docs/en/feature-availability
- Agentic loop: https://code.claude.com/docs/en/how-claude-code-works
- OpenTelemetry monitoring: https://code.claude.com/docs/en/monitoring-usage
- Week 15 release note: https://code.claude.com/docs/en/whats-new/2026-w15
- Week 20 release note: https://code.claude.com/docs/en/whats-new/2026-w20
- Week 28 release note: https://code.claude.com/docs/en/whats-new/2026-w28

## 报告结构映射与取舍

- Title：独立标题块。
- Technical summary：直接给出“触发器、判断器、寿命容器”结论与默认选型。
- Key findings with evidence：核心机制矩阵、持久性矩阵与决策树。
- Scope and definitions：区分 agentic loop、/loop、Monitor、plugin monitors、agent view、OpenTelemetry monitoring。
- Methodology：只使用官方在线文档和本机只读输出；既有草稿不作事实来源。
- Limitations and robustness：标注 research preview、版本/provider/plan 差异，以及未做付费运行时实验。
- Recommended next steps：给出最小风险验证顺序与建议采集的观测指标。
- Further questions：列出会改变选型的四类输入。
- 可视化取舍：没有可诚实量化的性能数据，因此不画伪精确图表；用关系图和精确比较表承载定性证据。

## Chart map

- 报告段落：版本与 provider 可用性。
- 分析问题：本机 v2.1.190 按最低版本门槛能否使用每项已讨论能力？
- 一句话结论：核心 Loop、Monitor command、plugin monitors 与 Goal 已满足版本门槛；Monitor WebSocket、v2.1.200 后台恢复强化和 v2.1.202 self-paced stop 尚未满足。
- 图形家族：Comparison & Ranking。
- 原生图形：横向 grouped bar。
- 数据：9 个能力；required_patch 与恒定 local_patch=190；同时保留完整版本、status 和额外可用性条件。
- 颜色：hard two-root cap；最低门槛使用 blue，本机使用 neutral，并通过直接数值与图例双重区分。
- 诚实性约束：v2.1.x patch 仅作为兼容阈值；不解释为性能、成熟度、成本或价值排序。
- 来源：本审计记录中的本机只读版本输出与逐项官方文档链接。
- QA 目标：portable HTML enhanced reader 与 semantic fallback。

## Packaging receipt

- Canonical artifact validation：passed。
- Portable HTML package：passed。
- Structural verification：passed。
- 产物：docs/claude-code-automation-mechanisms-report.html。
- 规模：19 blocks、1 native chart、9 reviewed chart rows、19 canonical sources。
- HTML：457,124 bytes；包含 system color-scheme、semantic fallback 与匹配的可见标题。
- Browser QA：structural_only。打包器未自动找到 Chromium headless-shell；曾定向尝试系统已有 Microsoft Edge，但 Edge 未应用打包器要求的 chart extraction environment，因此按技能规范退回 structural-only，没有安装浏览器或编写额外 Playwright 检查。
- 尚未验证：enhanced reader 的桌面/窄屏几何、来源弹窗交互。
