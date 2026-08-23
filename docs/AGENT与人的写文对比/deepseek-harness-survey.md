---
title: '🧩DeepSeek Harness ：一切皆插件的 Agent Harness 设计'
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

8 月 13 日 DeepSeek 在发布 deepseek V4 正式版的同时还以MIT协议开源了自研的 DeepSeek Harness（简称 dsh），并打出了 "Everything is a plugin"（一切皆插件）的口号。

dsh在github发布数小时便涨了三万多 stars，热度非常之高。在入手一个新的东西之前，我习惯先调研一下它的设计理念和能力边界，以便决定是否要投入使用以及如何投入使用。因此在正式开用dsh前，我不禁抛出这些问题：它和 Claude Code 等现存harness存在着怎样的差异？它的设计理念有怎样的优势或创新？真实的社区评测反馈如何？有哪些可以借鉴的地方？……

以下内容信息是 ZCode（GLM5.3+最高思考强度） 辅助调研生成 ，信息截至 2026-08-23。

## 调研范围与方法

信息源包括官方发布页、GitHub 仓库与官方参考文档、Cordis 论文，以及五篇第三方分析（Medium、FloatBoat、MindStudio、The New Stack、Eigent）和 Reddit 社区讨论。本文主要总结了多家一致的观点，仅单一来源且无佐证的被标记为"单源"。star 数、模式命名这类随时变动或各家说法不一的信息，一律注明出处与时间点。

---

## 什么是Harness 

harness 的英文翻译是马具（挽具），即套在马身上、让它能拉车跑长途的那套装备。放到 LLM 里， **Agent = Model + Harness（模型 + 脚手架）**，模型是 agent 的灵魂，harness 则负责该agent执行任务所需的其他一切约束。

具体来讲，模型本身只会吐出下一段文字，但它不知道文件系统长什么样，也不会自己跑 shell。harness 就是那层胶水代码，把模型的输出解析成动作、执行工具、把结果塞回上下文等等。平时天天挂嘴边的 Claude Code，其实就是 Claude 模型的一层官方 harness。

## DeepSeek Harness设计

### "一切皆插件"的实现

 dsh 实现这一切的真正核心只有一个叫 Cordis 的内核，该内核把 LLM、工具、shell 等全部以插件的身份挂进来，并提供服务容器和事件总线来保证各个插件之间能互相找到对方、互相配合。其核心部分只有五个：服务定义、服务容器（即下文的 ctx）、依赖注入（inject）、类型化事件、可逆注册（ctx.effect 清理机制），这就是内核的全部家当。

这五件家当里，真正撑起架构的是两块底座。

一块是服务容器：内核提供一个全局容器，每个插件把自己能干的事以带名字的服务注册进去，谁需要谁按名字取用，它解决的是插件之间如何互相发现。

```text
              服务容器（ctx 上的一张服务名录）
 ┌─────────────────────────────────────────┐
 │ ctx.llm        ctx.fs        ctx.shell  │
 └──────▲─────────────▲──────────────▲─────┘
        │注册           │注册           │注册
     llm 插件        fs 插件       shell 插件

 主循环插件只按名字取 ── ctx.llm ──▶ 当前在场的模型插件
 换掉模型插件 ── 条目名不变，指向换成新插件，调用方无感
```

另一块是事件总线（事件流）：内核内置一条全体插件共用的广播频道，任何插件都能往上面发带类型的事件，也能订阅自己关心的事件，一连串事件按时间先后排下来就是事件流；它解决的是互不相识的插件怎么协作，主循环只管广播"工具执行完了"，谁关心谁来听，发事件的一方不需要知道有谁在听。

```text
服务容器（ctx 上的服务名录）
 ├─ ctx.llm ◀── llm 插件注册
 ├─ ctx.fs ◀── fs 插件注册
 └─ ctx.shell ◀── shell 插件注册

主循环插件 ──按名字取──▶ 容器里的 ctx.llm / ctx.tools 等服务
主循环插件 ──发事件──▶ 事件总线（全体插件共用的广播频道）
                         ├─广播─▶ 遥测插件 → 记 token 数
                         ├─广播─▶ 日志插件 → 写一行记录
                         └─广播─▶ 压缩插件 → 查上下文余量
```

有了容器，context（简称 ctx）就好定义了：它是 Cordis 发给每个插件的运行时对象，既是插件使用内核全部能力的入口，也是那个服务容器的操作面。编程里用来代表一整套资源的引用叫句柄（handle），拿着文件句柄就能读写文件，不用管背后细节，ctx 就是每个插件手里的运行时句柄。

插件挂载时在 ctx 上登记一个带名字的服务条目，此后任何拿着 ctx 的插件都能按名字取到这个服务的实例，不需要 import 提供者的代码，也不用关心它是谁实现的；换实现时名字不变、指向换成新插件的实例，调用方完全无感。ctx.llm 和 ctx.fs 就是容器里两个具体的服务条目，ctx.llm 背后是某个模型 provider 插件注册的调用入口，把消息发给它，它转发给 Anthropic、DeepSeek 等任何一家的 API，再把回复带回来，所以 ctx.llm 读作"上下文上的模型服务"。

那这套加载卸载机制怎么撑起整个 agent 循环？过程大致分四步。启动时按配置层决定加载哪些插件，内核按依赖关系做拓扑排序后依次挂载各个插件；能力插件挂载时把自己的服务注册到 ctx 上，模型接入挂成 ctx.llm，工具挂成 ctx.tools等；主循环插件（注意，它自己也是一个插件）运行时从 ctx 取用这些服务，组装 prompt、调 ctx.llm 拿回复、解析出工具调用就交给 ctx.tools 执行、结果回填上下文，循环到停止条件为止，每一步都往事件总线上广播；压缩、审批、遥测这些功能全是订阅事件的插件，不是循环里的 if 分支。

先看静态的挂载结构，三类插件挂上内核之后是这样。

```text
Cordis 内核（管加载、卸载、依赖，提供服务容器和事件总线）
 ├─ 主循环插件（ctx.agentLoop，跑 turn 的地方）
 │    └─ 取用 ctx.llm / ctx.tools / ctx.fs 等服务
 ├─ 能力插件（挂载时在 ctx 上注册服务）
 │    ├─ llm 插件 ──注册──▶ ctx.llm（可换 provider）
 │    ├─ fs 插件 ──注册──▶ ctx.fs（本地 / 沙箱 / 云上）
 │    ├─ shell 插件 ──注册──▶ ctx.shell
 │    └─ 子代理插件 ──注册──▶ ctx.subagents
 └─ 订阅者插件（监听事件总线，不参与主循环）
      ├─ 压缩插件（订阅 agent/pre-step）
      ├─ 审批插件（订阅 approval/request）
      └─ 遥测插件（订阅 telemetry/*）
```

再看动态过程，从加载到换行为串起来是这样。

```text
按配置加载插件 → 内核拓扑排序 → 依次挂载
能力插件注册服务（ctx.llm / ctx.tools / ctx.fs）
主循环插件取服务跑 turn，每步向事件总线广播
压缩 / 审批 / 遥测都是事件订阅者，不是循环内分支
换行为 = 卸旧插件 → 挂新插件 → 逆序清理，进程不重启
```

正是这样的一个内核让 dsh 实现了“万物皆插件”，并且能随时更换插件同时保证 Agent 运行状态不崩。

题外话：Cordis 不是为 dsh 临时造的轮子，它已经跑了四年，Koishi 机器人框架一直拿它当生产内核。dsh 发布同一天，Cordis v4 和配套论文《A Programming Paradigm for Spatiotemporal Composability》（时空可组合性编程范式，北大与 DeepSeek 的三位研究者）一起亮相。

### 配置

配置定义加载哪些插件、各以什么参数挂载。内核不含业务，"哪些插件在场"完全决定运行时长什么样，所以配置约等于整台 agent 的装配清单。

dsh 的配置是层叠式的：

```text
dsh-base（内核默认插件集）
 └─ dsh-web-app / dsh-headless（运行形态，Web UI 或无头，二选一）
     └─ cordis.patch.yml（profile 级覆写，如 --profile web）
         └─ cordis.patch.yml（用户主目录级覆写）
             └─ --patch 传入的临时覆写（一次性）
```

其中：

- **dsh-base** 是出厂默认，内核自带的插件集，比如默认的本地文件系统和内置工具。
- **dsh-web-app / dsh-headless** 决定运行形态，要带界面的 Web 版还是纯命令行的无头版，二选一。
- **profile 级 cordis.patch.yml** 跟着启动参数走，--profile web 就垫上 Web 形态需要的那套插件。
- **主目录级 cordis.patch.yml** 是个人默认，全局生效，比如在自己机器上把默认模型换成 GLM，就写在这一层。
- **--patch** 是一次性覆写，只影响本次启动，比如临时挂个调试插件试试，不污染任何配置文件。

和 Claude Code 的配置 .claude 比较：两者层叠思路一样，都是分层、后者覆盖前者，CC 那边是 ~/.claude 用户级、项目里的 .claude/ 目录加命令行参数；真正不同的是配置的权力边界：

| 对比项 | Claude Code | dsh |
|---|---|---|
| 用户级 | ~/.claude/settings.json | 主目录 cordis.patch.yml |
| 项目/形态级 | .claude/settings.json | profile 级 cordis.patch.yml |
| 一次性 | 命令行参数 | --patch |
| 配置能改什么 | 设置项，模型、权限、hooks 等行为开关 | 系统组成，增删换插件 |

CC 的配置叠得再多，改的也是成品工具的开关，压缩策略和内置工具的实现换不掉；dsh 的配置改的是"谁在场"，把 fs-local 换成 fs-e2b、换一家子代理实现，都是改配置的事。另外 .claude 目录里的 commands、agents、skills 和 CLAUDE.md 属于扩展内容，dsh 这边对应的生态是插件，并且它自己也会读 AGENTS.md 和 CLAUDE.md。

---

### 模型看见的，都会被记下来

dsh官方将可观测性做成了运行时断言，原话是 "Model-visible means recorded"（模型可见即可记录）。

dsh 一个 turn 的定义：从用户提交输入到 agent 本轮停止算一个 turn，其中的每次模型往返算一个 step，一个 turn 里塞几十个 step 很常见。一个 turn 的生命周期，大致走这样一条事件链：

```text
turn/start（用户提交输入，一轮开始）
 ↓
组装 prompt（system / skills / goals 注入点）
 ↓
agent/request → llm/stream（调用模型，流式返回）
 ↓
assistant/chunk… → assistant/message（分块到达，拼成完整回复）
 ↓
tool/call… → tools/execute → tool/result…（执行工具，结果回填）
 ↓
step/end（一步结束；模型还要继续就回到 agent/request）
 ↓
turn/end（本轮停止）
```

事件链本身不是插件，它是内核事件总线上流过的一串事件，由主循环插件在跑 turn 的过程中逐步发出。它和插件设计的关系是，插件想介入执行过程，靠的就是订阅链上的事件；而把这条链落成 append-only 日志的是 sessions 插件。

关键是，所有高级功能都是这条事件流的消费者，而不是散落在代码里的 if 分支。Trajectory（轨迹）视图按来源检查每一行输入，恢复（resume）、分叉（fork）、回放（replay）都基于同一条流，上下文压缩是订阅 agent/pre-step 事件的插件，审批是 approval/request 事件的瀑布式消费者。

多数 harness 里，turn 是个黑盒单元，以 Claude Code 为例，按下回车后它内部循环调用模型和工具，直到给出答复，整条执行序列不会落成可检查的事件流，也不支持对某一轮做分叉或回放。dsh 把这个单元拆开了，一个 turn 就是一串公开、落盘、可订阅的事件，压缩插件在 agent/pre-step 介入，审批在 approval/request 介入，任何一轮都能 resume、fork、replay。

---

## 四种运行模式

| 模式 | 定位 | 工具面 |
|---|---|---|
| Standard | 全功能编码 agent | 文件、shell、联网搜索、子代理、计划模式 |
| Code | 工具暴露成 TypeScript SDK | 模型直接写一段程序调 SDK，多步操作一次往返完成 |
| Minimal | 极简基准环境 | 只有持久 bash + str_replace_editor 两个工具 |
| Creator | 造自定义 preset | Standard 之上加运行时检查与插件实验 |

有两点值得展开。

- **Minimal 的系统提示词只有一句话："You are a helpful software engineering assistant."** 它的存在就是为了跑分，官方发布的 V4 Pro Code Agent 分数就出自这个模式。Eigent 对此给出了提醒：拿 Minimal 模式的分数去跟别家带完整脚手架的分数对比是不对等的。
- **Code 模式是形态上最有意思的一个**。传统 agent 每个工具调用都是一次模型往返，Code 模式把整个工具面编译成一份 TypeScript SDK，模型写程序、一次调用跑完多步，官方说法是能把五次往返压成一次。代价是模型的代码能力直接决定质量，弱模型甚至可能直接写出BUG程序。

顺带记录模式命名的口径。官方文档叫 Standard / Code / Minimal / Creator，第三方文章里出现过 PTC mode、Creative mode 等别名，本文以官方仓库为准。

---

## 模型与生态：不绑死自家，还能雇佣竞品

- dsh的provider 覆盖 Anthropic、OpenAI、AWS Bedrock、Azure、Google（文档里仍写 Vertex）、DeepSeek 自家端点，外加自定义 OpenAI 兼容网关。换模型是 YAML 里改一行的事，因此可以完全不用 DeepSeek 的 API。
- **它还能把 Claude Code 和 Codex 当子代理**。内置 subagent-claude-code 和 subagent-codex 两个 provider，从 PATH 解析二进制，安装和登录由用户自己来，默认关闭。甚至提供了桥接层去跑两家现成的 hooks.json，不过 README 自己也承认，这只是一条兼容路径，算不上更好的设计（ "a compatibility path rather than the better design"）。
- 协议兼容上，dsh内置了 MCP 客户端，支持 Agent Client Protocol（ACP），会读 AGENTS.md 和 CLAUDE.md。
- 其沙箱做了三个平台支持：Linux 用 Landlock（自定义 Node addon），macOS 用 Seatbelt，Windows 用 ACL 受限令牌。对 Windows 用户这么上心的开源项目其实不多见。

---

## 用户观感与成本

这里引用两家第三方的实测评价：

MindStudio 拿它做了个 ISS（国际空间站）实时追踪器，地球 shader、太阳方位都得对，用 Playwright 全程调试。结果是**两轮对话烧了约 2000 万 token、跑了 35 分钟**，输出约 24 万 token（约 130 tok/s），缓存命中 95% 到 100%。作者说一个纸面上挺简单的应用，token 账单却很重，结论是开源模型的 token 效率整体仍落后闭源第一梯队。同篇里作者认为 V4 Flash 在编码任务上的性价比高于 Pro，建议把Pro 留给硬骨头（单方观点）。

Medium 在深度解析里贴了一条典型 trajectory 的统计：1 个 turn、57 步，模型侧累计 9 分 53 秒、工具侧 9 分 44 秒，首 token 平均 1.8 秒，53 tok/s，缓存命中 96%，输入 310 万 token、输出 2.6 万 token。**输入比输出大两个数量级，实际账单基本由缓存命中率决定**。

另一个被反复夸的细节是实时遥测。tok/s、缓存命中率、轮次、耗时都直接挂在 UI 上，非常方便用户实时观看。

---

## 社区反应与横向对比

### 热度

2026-08-13 发布，数小时 33,000+ star（The New Stack）。08-14，Medium 称已破 5.5 万。截至08-23 大约有18 万 star、2 万 fork，热度增长曲线非常陡峭。

### 特别的治理方式

dsh官方暂时**不接受外部 PR**，贡献者被引导去 GitHub Discussions 和写插件。官方还说自己仓库里的包并不比社区包更重要，这个仓库是一个想法、一份官方示范和一种灵感来源。社区插件走 dsh-plugin 话题，已经能看到换皮 UI（dsh-web-ui）、"模型答案自动长出界面"（dsh-genui）这类实验。

还有一个很有意思的单源观点：MindStudio 提到 dsh 的 UI 长得像 Codex，还有说法称仓库里不少 commit 出自 Codex 工作树。仓库里也确实同时躺着 .claude 和 .agents 目录，**用 harness 造 harness**，这个自举味儿很正。

### 横向位置

| 项目 | 出品方 | 形态 | 一句话定位 |
|---|---|---|---|
| DeepSeek Harness | DeepSeek | 开源（MIT），内核加插件 | 造 agent 的零件库 |
| Claude Code | Anthropic | 闭源 CLI | 最成熟的成品 agent harness |
| Codex | OpenAI | CLI 加云 | OpenAI 系成品 |
| Qwen Code | 阿里 | 开源 CLI | 成品路线 |
| Kimi CLI / ZCode / Trae Agent | Moonshot / 智谱 / 字节 | 开源 | 国产成品路线 |

顺带提一下发布时间线：Qwen Code、Trae Agent 在 2025 年中，Kimi CLI 在 2025 年 10 月，ZCode 在 2026 年 7 月，deepseek harness则在2026 年 8 月。

---

## 我的看法

前面各节是调研所得的事实转述，这一节讲一点个人判断：

1. 这套设计最亮眼的是两件东西。一件是把 agent 的行为全部事件流化，可以回放，也可以分叉；另一件是把每个能力做成可换插件。对做 agent 研究或想自研 harness 的团队，这个仓库几乎是一份带 159 个参考实现的免费教材。
2. 这套**一切皆插件**的设计理念让全世界开发者都能通过一起插拔的便捷形式，做各种各样的插件来丰富整个DeepSeek Harness的生态，同时也非常方便Agent自进化的研究实验。
3. 它更像一套造成品 harness 的零件库，主要卖点在可拆装。开箱即用的打磨程度和稳定性，v0.1 阶段大概率比不过一线闭源成品，其 README 也明说了预览期会有破坏性兼容变更，所以最好先别急着把生产环境押上去。

想自研 harness、做可观测性研究，或者想复现 V4 榜单分数的人，现在就可以装起来玩！

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

dsh 发布仅十天，处于 developer preview，接口、模式命名、插件清单都在变，star 数随时在涨，**本文一切数字以 2026-08-23 为准，使用前可以先看官方仓库**。本文作为实际上手前的一个调研总览，将指导我后续对dsh的实践测评。
