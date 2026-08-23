---
title: '🧩DeepSeek Harness 调研报告，一切皆插件的 Agent 脚手架'
date: 2026-08-23
tags:
  - DeepSeek
  - Agent
  - Claude Code
  - 开源
categories: ['practice']
knowledge: ['ai/llm/agent']
maturity: 当下热点
lang: zh
---

## 引言

用 agent 写码也有一阵子了，我的日常配置是 claude code cli 接国产模型。时间久了形成一个习惯性认知，模型权重各家都愿意开放，模型外面那层脚手架（agent 循环、工具调用、上下文管理）基本被 Claude Code、Codex 这些成品包着，能用，不能拆。

8 月 13 日 DeepSeek 干了件有点反常的事。它和 V4 Pro 同一天，把自家的 agent 脚手架 DeepSeek Harness（命令名叫 dsh）以 MIT 协议开源了，口号也非常直白，就叫 "Everything is a plugin"（一切皆插件），发布数小时 GitHub 涨了三万多 star。更让我坐不住的是 Medium 上的一句评价，说连 agent 主循环本身都是一个可插拔的插件。

模型厂开源"挽具"，和开源模型权重是两码事，前者意味着整套干活装备都可以拆开重装。于是我心血来潮，把能找到的资料翻了一遍，想搞清楚它到底是什么，和 Claude Code 们是什么关系，普通开发者现在值不值得跟。

以下内容是对 DeepSeek Harness 的桌面调研，辅助调研用的是 ZCode 加网页检索，信息截至 2026-08-23。

## 调研范围与方法

信息源包括官方发布页、GitHub 仓库与 README、官方参考文档、Cordis 论文，加五篇第三方分析（Medium、FloatBoat、MindStudio、The New Stack、Eigent）和 Reddit 社区讨论。多家来源一致的才写成结论，只单一来源且无佐证的，我标了"单源"。star 数、模式命名这类随时变动或各家说法不一的信息，一律注明出处与时点。还有一点要先交代，本文是纯桌面调研，我还没实际上手，实测体验以后另发一篇。

---

## Harness 是什么，先把黑话翻成人话

harness 的本义是马具（挽具），套在马身上、让它能拉车跑长途的那套装备。放到 LLM 里，官方给的定义是 **Agent = Model + Harness（模型 + 脚手架）**，还补了一句 "The model is the soul of an agent"，模型是 agent 的灵魂，harness 负责其他一切。

翻译成大白话，模型本身只会吐出下一段文字，它不知道文件系统长什么样，也不会自己跑 shell。harness 就是那层胶水代码，把模型的输出解析成动作、执行工具、把结果塞回上下文、决定什么时候停。平时天天挂嘴边的 Claude Code，其实就是 Claude 模型的一层官方 harness。

dsh 的主循环画出来是这样。

```text
dsh 主循环（注意，循环本身也是插件）
 ├─ 组装 prompt（system / skills / goals 都从这里注入）
 ├─ 调用模型（ctx.llm，模型是插件，随时可换）
 ├─ 解析输出
 │    ├─ 普通文本 ── 达到停止条件，任务结束
 │    └─ 工具调用 ── 执行工具 ── 结果回填上下文 ── 回到「调用模型」
 └─ 上下文将满 ── 触发压缩插件（ctx.compaction）
```

过去的格局是，开源 CLI 也有一些，但大多是固定管线的成品。**把 harness 做成薄内核加全插件、连内部机制都摊开给你换的，头部实验室里这是第一家**。这也是本次调研最值得搞清楚的差异点。

---

## 核心设计，一切皆插件

### "一切皆插件"到底指什么

官方页的原话是，模型、工具、技能（skills）、会话（sessions）、沙箱（sandbox）、存储、循环（loops）、调度，乃至 UI，全部是插件。文档里还有一句 "no privileged core to patch"（没有特权内核），想改任何行为，都是在旧插件旁边挂一个新插件，不用 fork 源码改分支。Medium 上有人数过，仓库内置了约 159 个插件。

插件化落到了每一层"能力接缝"上（capability seam，个人译法，指能力接口与实现之间的缝隙）。

| 能力接口 | 官方实现举例 | 大白话说明 |
|---|---|---|
| ctx.llm | 各家 provider 适配 | 模型接入层，随时换脑 |
| ctx.fs | fs-local / fs-sandbox / fs-e2b | 文件系统，本地、沙箱、云上三选 |
| ctx.shell | bash-local / bash-sandbox / pwsh-local | shell 执行 |
| ctx.web | web-search-exa / perplexity / deepseek、web-fetch-http | 联网搜索与网页抓取 |
| ctx.subagents | in-process / acp / codex / claude-code / dsh-sdk | 子代理，进程内、跨协议、甚至竞品 CLI |
| ctx.approval | acp | 危险操作审批 |
| ctx.compaction | basic | 上下文压缩策略 |
| ctx.skills / ctx.goals | 略，见官方文档 | 技能注入与长期目标 |

这张表是裁剪版，完整清单见官方参考文档。FloatBoat 的分析里还能看到 ctx.agentLoop，也就是主循环本身也在这套体系里。所以换模型是改配置的事，把 Claude Code 挂成自己的子代理，也只是再改一处配置。

### Cordis 内核

这套插件体系不是为 dsh 临时造的轮子。它建在 Cordis 上，一个已经跑了四年的插件框架，Koishi 机器人框架一直拿它当生产内核。dsh 发布同一天，Cordis v4 和配套论文《A Programming Paradigm for Spatiotemporal Composability》（时空可组合性编程范式，北大与 DeepSeek 的三位研究者）一起亮相。

"时空可组合性"听着像黑话，拆开就两句。**时间维度指组件可以随时挂载、卸载，系统不崩**，每个副作用通过 ctx.effect 注册清理函数，卸载时逆序执行，相当于运行时级别的 RAII，装入时登记，拆解时自动回收。**空间维度指组件之间按依赖关系组装**，用 inject 声明依赖，框架负责拓扑排序和注入。

由此推出一个很硬的性质。**最终状态只取决于哪些插件被启用，与加载、卸载的顺序无关**（路径无关性），所以配置可以热更新，理论上 agent 跑到一半换插件都不用重启。

也有唱衰的声音。X 上有人认为"时空可组合性"不过是把依赖注入和自动垃圾回收包装了个新名词，单源，观点向，仅供参考。

### 配置怎么叠加

dsh 的配置是层叠式的，后面覆盖前面。

```text
dsh-base（内核默认插件集）
 └─ dsh-web-app / dsh-headless（运行形态，Web UI 或无头，二选一）
     └─ cordis.patch.yml（profile 级覆写，如 --profile web）
         └─ cordis.patch.yml（用户主目录级覆写）
             └─ --patch 传入的临时覆写（一次性）
```

想看最终生效的配置树，直接跑 `dsh --profile web --dump-config`。上手门槛也低，有 Node.js 就行，`npx @deepseek-ai/dsh web` 起一个本地 Web UI（默认 `127.0.0.1:3080`），选模式、选模型、选权限级别，填个 API key 就能跑。

---

## 模型看见的，都被记下来

这一节讲可观测性（observability），我个人认为它是整套设计里最值钱的部分。官方定了一条铁律，做成了运行时断言，原话是 "Model-visible means recorded"（模型可见即可记录）。凡是进入模型请求的内容，必须能从一条 append-only（只追加、不篡改）的会话日志里重建出来，system prompt、思维链、工具调用与结果、子代理调度、上下文注入，全在日志里。

一个 turn 的生命周期，大致走这样一条事件链。

```text
turn/start
 → 组装 prompt（system / skills / goals 注入点）
 → agent/request → llm/stream
 → assistant/chunk… → assistant/message
 → tool/call… → tools/execute → tool/result…
 → step/end → turn/end
```

关键是，所有高级功能都是这条事件流的消费者，而不是散落在代码里的 if 分支。Trajectory（轨迹）视图按来源检查每一行输入，恢复（resume）、分叉（fork）、回放（replay）都基于同一条流，上下文压缩是订阅 agent/pre-step 事件的插件，审批是 approval/request 事件的瀑布式消费者。

Medium 上有个类比我很喜欢，属于观点。当年 R1 的贡献在于让思维链变得透明可读，Harness 在执行层又做了一遍同样的事，模型做了什么、看到了什么，第一次变得可审计。

工程效果实打实。调试不靠猜，出了问题能回放，benchmark 也因此可复现。边界也要说清楚，事件流记录的是进入模型的内容，沙箱内所有副作用未必无死角可审计，两件事不是一个概念。

---

## 四种运行模式

| 模式 | 定位 | 工具面 |
|---|---|---|
| Standard | 全功能编码 agent | 文件、shell、联网搜索、子代理、计划模式 |
| Code | 工具暴露成 TypeScript SDK | 模型直接写一段程序调 SDK，多步操作一次往返完成 |
| Minimal | 极简基准环境 | 只有持久 bash + str_replace_editor 两个工具 |
| Creator | 造自定义 preset | Standard 之上加运行时检查与插件实验 |

有两点值得展开。

- **Minimal 的系统提示词只有一句话："You are a helpful software engineering assistant."** 它的存在就是为了跑分，官方发布的 V4 Pro Code Agent 分数就出自这个模式。Eigent 由此提醒（观点），拿 Minimal 模式的分数去跟别家带完整脚手架的分数对比，口径并不对等。
- **Code 模式是形态上最有意思的一个**。传统 agent 每个工具调用都是一次模型往返，Code 模式把整个工具面编译成一份 TypeScript SDK，模型写程序、一次调用跑完多步，官方说法是能把五次往返压成一次。代价是模型的代码能力直接决定质量，弱模型可能写出跑不完的程序。

顺带记录模式命名的口径。官方文档叫 Standard / Code / Minimal / Creator，第三方文章里出现过 PTC mode、Creative mode 等别名，以官方仓库为准。

---

## 模型与生态，不绑自家还能雇佣竞品

- provider 覆盖 Anthropic、OpenAI、AWS Bedrock、Azure、Google（文档里仍写 Vertex）、DeepSeek 自家端点，外加自定义 OpenAI 兼容网关。换模型是 YAML 里改一行的事，也因此可以完全不用 DeepSeek 的 API，白嫖这个 harness。
- 它还能把 Claude Code 和 Codex 当子代理。内置 subagent-claude-code 和 subagent-codex 两个 provider，从 PATH 解析二进制，安装和登录由用户自己来，默认关闭。甚至提供了桥接层去跑两家现成的 hooks.json，不过 README 自己也承认，这只是 "a compatibility path rather than the better design"，一条兼容路径，算不上更好的设计。
- 协议兼容上，内置 MCP 客户端，支持 Agent Client Protocol（ACP），会读 AGENTS.md 和 CLAUDE.md。
- 沙箱做了三个平台，Linux 用 Landlock（自定义 Node addon），macOS 用 Seatbelt，Windows 用 ACL 受限令牌。对 Windows 用户这么上心的开源项目其实不多见。

---

## 实测观感与成本（第三方数据）

我还没上手，这里引用两家第三方的实测，口径都已标注。

MindStudio 拿它做了个 ISS（国际空间站）实时追踪器，地球 shader、太阳方位都得对，用 Playwright 全程调试。结果是**两轮对话烧了约 2000 万 token、跑了 35 分钟**，输出约 24 万 token（约 130 tok/s），缓存命中 95% 到 100%。作者说一个纸面上挺简单的应用，token 账单却很重，结论是开源模型的 token 效率整体仍落后闭源第一梯队。同篇里作者认为 V4 Flash 在编码任务上的性价比高于 Pro，Pro 留给硬骨头（观点）。

Medium 的深度解析里贴了一条典型 trajectory 的统计。1 个 turn、57 步，模型侧累计 9 分 53 秒、工具侧 9 分 44 秒，首 token 平均 1.8 秒，53 tok/s，缓存命中 96%，输入 310 万 token、输出 2.6 万 token。**输入比输出大两个数量级，实际账单基本由缓存命中率决定**，这组数字对理解 agent 的成本结构很有参考价值。

另一个被反复夸的细节是实时遥测。tok/s、缓存命中率、轮次、耗时都直接挂在 UI 上，这些数据多数 harness 都藏着，dsh 直接给你看。

---

## 社区反应与横向对比

### 热度

2026-08-13 发布，数小时 33,000+ star（The New Stack）。08-14，Medium 称已破 5.5 万。08-23 我查看时，约 18 万 star、2 万 fork。十天这条曲线，开源史上都算陡的。

### 治理方式比较特别

官方暂时**不接受外部 PR**，贡献者被引导去 GitHub Discussions 和写插件。官方还说自己仓库里的包并不比社区包更重要，这个仓库是一个想法、一份官方示范和一种灵感来源，不构成强制命令。社区插件走 dsh-plugin 话题，已经能看到换皮 UI（dsh-web-ui）、"模型答案自动长出界面"（dsh-genui）这类实验。

有个有意思的花絮，单源。MindStudio 提到 dsh 的 UI 长得像 Codex，还有说法称仓库里不少 commit 出自 Codex 工作树。仓库里也确实同时躺着 .claude 和 .agents 目录，**用 harness 造 harness**，这个自举味儿很正。

### 横向位置

| 项目 | 出品方 | 形态 | 一句话定位 |
|---|---|---|---|
| DeepSeek Harness | DeepSeek | 开源（MIT），内核加插件 | 造 agent 的零件库 |
| Claude Code | Anthropic | 闭源 CLI | 最成熟的成品 harness |
| Codex | OpenAI | CLI 加云 | OpenAI 系成品 |
| Qwen Code | 阿里 | 开源 CLI | 成品路线 |
| Kimi CLI / ZCode / Trae Agent | Moonshot / 智谱 / 字节 | 开源 | 国产成品路线 |

表格为个人归纳，定位一列是我的主观概括。The New Stack 的判断是国产各家都在做开源编码 agent，dsh 拿插件架构做了差异化。顺带一提，ZCode 就是这次帮我做调研的工具，此处不偏心，仅按发布时间线收录，Qwen Code、Trae Agent 在 2025 年中，Kimi CLI 在 2025 年 10 月，ZCode 在 2026 年 7 月。

---

## 我的看法

先把事实和观点分开，前面各节有出处的都是事实转述，这一节全部是个人判断。

1. 短期别指望 dsh 替代 Claude Code。它更像一套造成品 harness 的零件库，卖点在可拆装。开箱即用的打磨程度和稳定性，v0.1 阶段大概率比不过一线闭源成品，README 也明说了预览期会有破坏性兼容变更，别急着把生产环境押上去。
2. 这套设计最值钱的是两件东西。一件是把 agent 的行为全部事件流化，可以回放，也可以分叉；另一件是把每个能力做成可换插件。对做 agent 研究或想自研 harness 的团队，这个仓库几乎是一份带 159 个参考实现的免费教材。
3. token 成本是现实门槛。第三方实测的消耗水平摆在那里，缓存命中率直接决定实际账单，重度使用前先算清楚钱。

最后收三句。模型是灵魂，harness 是身体，dsh 把身体做成了可组装的。模型看见的一切都被记录，执行第一次变得可审计。MIT 协议加不锁自家模型，摆明了要做基础设施。

想自研 harness、做可观测性研究，或者想复现 V4 榜单分数的人，现在就可以装起来玩。只想安心把活干完的，先观望，成品工具目前更省心。

---

## 信息来源

| # | 来源 | 链接 |
|---|---|---|
| 1 | DeepSeek Harness 官方发布页 | https://deepseek.com/harness/en/ |
| 2 | GitHub 仓库 deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness |
| 3 | 官方参考文档 | https://deepseek-harness.github.io/deepseek-harness/reference/ |
| 4 | Cordis 论文 A Programming Paradigm for Spatiotemporal Composability | https://github.com/cordiverse/paper |
| 5 | Medium · When the Agent Loop Itself Becomes a Plugin | https://medium.com/@kaliarch/deepseek-harness-when-the-agent-loop-itself-becomes-a-plugin-7fad0aa9de1c |
| 6 | The New Stack · DeepSeek open sources an agent harness | https://thenewstack.io/deepseek-harness-open-source-plugins/ |
| 7 | MindStudio · What Is DeepSeek Harness?（含实测） | https://www.mindstudio.ai/blog/deepseek-harness-agentic-coding |
| 8 | FloatBoat · The Plugin Kernel Behind DeepSeek Harness | https://floatboat.ai/blog/cordis-plugin-framework |
| 9 | Eigent.ai · DeepSeek Harness 开源运行时分析 | https://www.eigent.ai/blog/deepseek-harness-agent-runtime |
| 10 | Reddit · r/LocalLLM 讨论帖 | https://www.reddit.com/r/LocalLLM/comments/1vqxhcn/deepseek_agent_harness_its_patterns_opensource/ |
| 11 | 36Kr 英文版 · DeepSeek 自演化路线图解读 | https://eu.36kr.com/en/p/3938795963137411 |

---

## 时效与局限

dsh 发布仅十天，处于 developer preview，接口、模式命名、插件清单都在变，star 数随时在涨，**本文一切数字以 2026-08-23 为准，使用前先看官方仓库**。本文是纯桌面调研，我没有实际上手，所有实测均引自第三方，MindStudio、Eigent 等带自身立场的来源已尽量标注。"挽具""能力接缝"等术语是个人译法，业内没有统一口径。

## 后续待办

接下来我会实际装一遍（npx @deepseek-ai/dsh web），分别用 Standard 和 Minimal 模式跑同一个任务，重点验证两件事，事件流回放到底好不好用，以及在我自己的用法下 token 消耗是什么水平。实测完成后另发一篇报告。
