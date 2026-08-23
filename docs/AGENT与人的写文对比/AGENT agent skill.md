---
title: 'Agent Skill 详解'
date: 2026-08-23
tags:
  - Agent Skills
  - Claude Code
  - Context Engineering
categories: ['practice']
knowledge: ['ai/llm/agent']
maturity: 当下热点
lang: zh
---

## 引言

这篇的缘起很简单。我自己的博客仓库里养着两个 agent skill，一个管中文写作的活人感，一个管技术文章刊发前的排版检查。用了大半年，一直把它们当成顺手的配置文件，没多想。

直到前段时间我去翻 anthropics/skills 的 star 数，发现这个 2025 年 10 月才创建的仓库已经堆到 51.3K stars，高峰期一个月涨了两万多。OpenAI、Google、Microsoft 都跟进支持了同一套格式，arXiv 上相关论文也攒出了一批。我意识到 skill 已经从 Claude Code 的一个功能长成了一个生态，而我只用到它最表面的一层。于是花几天时间把官方工程博客、开放标准、撰写规范、高 stars 仓库和四篇核心论文都翻了一遍，整理成这篇详解。

先给一句话定义。**Agent Skill 是一个装着说明文档、脚本和资源的文件夹，agent 在任务匹配时把它加载进上下文，从而获得完成某类特定任务的完整能力。** 下文按发展历史、机制、规范、生态、学术研究的顺序展开，最后是我的个人看法。

## Agent Skill 的发展历史

### 2025 年 10 月，Anthropic 发布 Agent Skills

2025 年 10 月 16 日，Anthropic 发表工程博客 [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)，正式推出 Agent Skills。官方给的定义是，skill 是由指令（instructions）、脚本（scripts）和资源（resources）组成的文件夹，模型通过把任务路由到对应能力来完成工作。

为什么命名为 skill？官方没有单独写一段命名说明，但从工程博客的表述看，skill 对应的是「做某件事的成套方法」。官方用了一个很传神的类比，skill 像一份**新员工入职手册**，先给你一张全貌地图，细节等到真正用到时再翻。我个人还有一个理解，心理学上知识分成陈述性知识和程序性知识，前者是「知道是什么」，后者是「知道怎么做」。RAG 往上下文里塞的主要是陈述性知识（资料、事实），而 skill 装的是程序性知识（流程、方法、判断标准）。这解释了为什么它叫 skill 而不叫 knowledge base。

发布同时，Anthropic 还开源了 [anthropics/skills](https://github.com/anthropics/skills) 仓库，里面除了 pptx、docx、xlsx、pdf 这批随功能首发的文档处理 skill，还有一个叫 skill-creator 的「元技能」，专门用来创建、验证和打包新 skill。

### Skill 在 agent 技术栈里的位置

把 skill 放回时间线里看，它解决的是一条延续已久的问题。function calling 让模型能调用外部函数，MCP 把工具聚成统一协议，skill 则把怎么做事的知识本身标准化了。

```text
2023-06  function calling
           └─ 让模型能调用预定义函数，打通动作执行
2024-11  MCP（Model Context Protocol）
           └─ 把外部工具聚成统一协议，解决连接与发现
2025-10  Agent Skills
           └─ 把做事方法打包成文件夹，解决知识与经验复用
2025-12  开放标准（agentskills.io）
           └─ SKILL.md 成为跨客户端格式，OpenAI 等厂商跟进
```

skill 和 MCP 的分工，官方的说法很清楚，**MCP 负责给模型接上新工具，skill 负责教模型新知识**。一个 MCP server 暴露的是「这里有哪些接口可以调」，一个 skill 描述的是「这类任务该按什么流程、注意什么坑、产出什么格式」。两者经常配合，skill 的正文里可以引用 MCP 提供的工具。

### 渐进式披露，skill 的核心机制

skill 具体如何工作？官方工程博客把核心设计原则叫 **progressive disclosure（渐进式披露）**，分三级加载。

```text
agent 启动
   │
   ▼
Level 1  预载所有 skill 的 name + description
   │      每个 skill 约 30~50 tokens
   │
   ▼  任务描述命中某个 description
Level 2  加载该 skill 的 SKILL.md 正文（完整方法论）
   │
   ▼  正文引用了细节文档或需要执行脚本
Level 3  按需读取 reference 文件 / 加载资源 / 在沙箱中运行脚本
```

这套机制的本质是给上下文窗口做经济核算。官方给过一笔账，39 个 skill 的元数据加起来，只相当于一篇完整系统提示的 0.06%。反过来，一份 764K tokens 的 PDF 若直接塞进上下文，相当于 15 篇完整系统提示的体量，而把它包成 skill 后，平时只占元数据那一小格，用到才展开。

也正因为加载、路由全部发生在 prompt 层，skill 的编写门槛极低，一个文件夹加一份 markdown，不需要写代码，不需要改部署。

### 从产品功能到开放标准

2025 年 12 月 18 日，Anthropic 把 skill 规范发布为[开放标准](https://agentskills.io)，同站提供 SDK，任何 agent 平台都可以免费实现。规范把 skill 的生命周期定义为三个阶段，discovery（扫描元数据）、activation（任务相关时加载正文）、execution（按需执行附属文件与脚本）。

后续的跟进速度超出很多人预期。OpenAI 的 Codex、Google 的 Gemini CLI、Cursor、Windsurf、Amp、Goose、Opencode 等四十多个客户端宣布兼容，Google 甚至开设了 [google/skills](https://github.com/google/skills) 官方仓库。一个由单一厂商发起的格式，三个月内变成了 agent 领域的事实标准，这也是 anthropics/skills 能冲到 51.3K stars 的大背景。

## Skill 和 Prompt 的区别

个人认为，当前的大部分 skill 就是一种方便 agent 系统管理和加载的 prompt 文档。它的优点是只在特定任务时机才加载进模型上下文，同时方便复用和版本迭代，算是 prompt engineering 和 context engineering 的一种融合。

有一个很直接的证据支持这个判断。官方文档明确说，把 SKILL.md 的内容直接粘贴进 system prompt 能达到几乎一样的效果，skill 系统还专门保留这种「无路由」的用法。也就是说，skill 的正文和一份精心写的 prompt 在内容层面没有本质区别，区别全在进入上下文的方式上。

| 维度 | 一次性 prompt | skill |
|---|---|---|
| 存放位置 | 聊天框、笔记、CLAUDE.md | 独立文件夹，带元数据 |
| 加载时机 | 手动粘贴或全局常驻 | 任务命中才加载，按层级展开 |
| 上下文成本 | 常驻型配置持续占用窗口 | 平时只占 30~50 tokens 元数据 |
| 复用与分发 | 复制文本，容易失真 | git 管理整目录，直接分享安装 |
| 版本迭代 | 改完没有沉淀 | diff、issue、release 齐全 |

所以我对 skill 的定位是，**它首先是一套 prompt 的工程化管理制度，其次才是某种新能力**。prompt 是弹药，skill 是弹药库加上按需取用的调度逻辑。这个判断在后文的学术研究部分还会再遇到，学术界把这件事叫 context engineering。

## 官方撰写规范

skill 的本质是一个帮助 LLM 完成特定任务的资料包，但要让资料包顺畅地融入整个 agent 工作流，官方在[撰写规范](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)里给了相当具体的约束。

### 一个 skill 长什么样

```text
my-skill/
├─ SKILL.md        元数据（name + description）+ 正文地图
├─ reference.md    细节文档，正文引用时才被读取
├─ assets/         模板、样例等静态资源
└─ scripts/        可执行脚本，交给沙箱运行
```

元数据是整个路由系统的关键，两个字段都有硬性数字要求。

| 字段 | 约束 | 写法要点 |
|---|---|---|
| name | 不超过 64 字符 | 第三人称描述动作，如 Processing insurance claims |
| description | 不超过 1024 字符 | 第三人称写清 what 和 when，包含触发关键词 |
| SKILL.md 正文 | 建议不超过 500 行 | 当地图用，细节移入 reference 文件 |

### 撰写原则

官方规范里反复强调的第一原则是简洁。原文说得很直接，"Claude is already very smart"，skill 要提供的是任务特有的流程和判断，通用的能力不需要教。与之配套的两条操作建议是，**多写判断依据，少写死规则**，让模型保留根据实际情况变通的余地；**一个 skill 只做一件事**，主题有重叠时靠 description 的边界描述来分工。

规范里我个人觉得最有价值的部分是 eval-first 的工作流。官方建议在动笔写 skill 之前，先准备至少三个评测输入，覆盖该 skill 的主要使用场景，明确每个输入的期望输出。迭代阶段甚至不需要搭建评测基建，直接让 Claude 用同一个 prompt 分别跑新旧两个版本，对比输出差异即可。这个「先定验收标准再写说明书」的思路，和软件工程里测试先行的理念完全同构。

### 怎么判断 skill 的好坏

这是我自己最关心的问题，调研后的答案是，**目前没有官方的 gold answer 或 benchmark**。Anthropic 的规范只给了撰写层面的启发式约束，没有发布过一个可以量化打分的评测集。社区的判断基本靠 star 数和口口相传。

学术侧刚刚补上这个空位。2026 年 5 月的一篇论文构建了第一个 skill 评测基准 SkillBench（下一篇节详述），但它的结论主要揭示「skill 越多越糟」的机理，对单个 skill 的好坏评分仍未覆盖。也就是说，判断一个 skill 好不好，目前最可靠的办法还是官方建议的那套土办法，先写三个测试场景，让 agent 实际跑给你看。

## Skill 生态

### 生态全景

开放标准落地后不到一年，生态已经分层。下面是 2026 年 8 月时点的主要节点。

| 仓库 / 站点 | 定位 | 规模与状态 |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic 官方示范仓库 | 51.3K stars，含 skill-creator 元技能 |
| [google/skills](https://github.com/google/skills) | Google 官方仓库 | 围绕 Google 产品与技术栈 |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 社区精选清单 | 收录 1000+ skill，标注兼容客户端 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 个人工程师经验蒸馏 | grill-me 出身处，后文详述 |
| [agent-skills.cc](https://agent-skills.cc/claude-skills/hot) | skill 排行榜 | 按 stars 和 forks 排序热度 |
| skills.sh | 跨 agent 安装器 | 一条命令把 skill 装进多种 CLI |

生态繁荣的另一面是安全。SkillRisk 对 GitHub 上 star 数前 100 的 skill 做过漏洞分析，Red Hat 开发者站点也专文讨论过 skill 的攻击面。skill 本质是让第三方文本进入你的 agent 上下文，安装前应当像引入依赖一样过一眼内容。

### 优秀 skill 案例，grill-me

grill-me 出自 [mattpocock/skills](https://github.com/mattpocock/skills)，作者是知名 TypeScript 教育者 Matt Pocock。README 里的一句话介绍是，"Get relentlessly interviewed about a plan or design until every branch of the design tree is resolved"。执行起来就是，你给 agent 一个计划或设计，agent 反复向你提问，逼着你把每个没想清楚的分支都补齐，全问完了才开始动手写代码。

这个 skill 小，但很好地示范了什么叫「给 agent 一个可识别的工作习惯」。它没有教模型任何新知识，只是把「动手前先拷问计划」这条工程纪律固化成了默认行为。仓库 README 把工程师用 agent 的四大失败模式和对应的 skill 修复整理成了一张表。

| 失败模式 | 对应 skill | 修法 |
|---|---|---|
| agent 做的不是我想要的 | grill-me / grill-with-docs | 实施前把计划拷问到位 |
| agent 太啰嗦 | 共享语言 CONTEXT.md | 用项目术语表对齐表达 |
| 代码跑不起来 | /tdd、/diagnosing-bugs | 红绿重构，先测试后实现 |
| 代码库烂成泥球 | /improve-codebase-architecture | 按 Ousterhout 的深模块理念重构 |

这张表的底色是几十年的软件工程文献。README 明说这些 skill 蒸馏自《The Pragmatic Programmer》、Eric Evans 的领域驱动设计、Kent Beck 的测试实践和 Ousterhout 的《A Philosophy of Software Design》。这也是我个人心中 skill 最正当的用法之一，**把久经考验的书本经验变成 agent 的默认行为**。

### 把人或书籍蒸馏成 skill

顺着上面的思路，社区已经把「蒸馏」做成了固定玩法。做法高度一致，把一本书或一个人的全部文字喂给模型，让它用 skill-creator 把内容蒸馏成若干个 skill，正文只留方法论骨架，原书章节降级为按需加载的 reference 文件。Ruben Hassid 公开演示过五分钟把一本技术书变成 skill 的完整流程，Reddit 上也有用户用整个书架的书构建自己的 agent 技能库。

对个人创作者，这条路更诱人。把某位作者的文章、某个博主全部帖子喂进去，蒸馏出他的选题嗅觉、行文节奏和判断标准，再让 agent 用这套标准参与你的创作。distill 一词在这里用得很准确，和蒸馏酒一样，得到的是浓缩物，原料的大部分体积被扔掉了。

## 学术界的 skill 研究

学术界对 skill 的关注比 Anthropic 的产品发布更早，2026 年之后两者明显合流。下面按时间线梳理四篇代表性工作。

### Voyager，技能库的起点

[Voyager](https://arxiv.org/abs/2305.16291)（2023）是 skill library 概念的起点。这个玩 Minecraft 的具身 agent 由三个组件构成，自动课程负责提出越来越难的目标，技能库把验证过的代码技能存起来供后续组合调用，迭代提示机制负责自我验证与修正。后续综述转引它的数字，技能库让 Voyager 解锁的独特物品数量达到 3 倍，里程碑推进速度快 15 倍。**它证明了经验一旦沉淀为可复用的技能单元，agent 就能做终身学习式的累积**，这个思想直接铺向了后面的工作。

### SkillRL，让技能库跟着策略一起进化

[SkillRL](https://arxiv.org/abs/2602.08234)（2026 年 2 月，ICLR 2026 自我改进研讨会）把 skill 库搬进了强化学习训练期。它维护一个分层的 SkillBank，技能以自然语言描述加可执行 workflow 的形式存放；训练过程中用 RL 信号把成功轨迹蒸馏进技能库，再通过任务感知的自适应检索把相关技能取回注入策略。关键的洞见是**技能库和策略必须共同进化**，只存不取或只取不进化都会失效。效果上，SkillRL 在 ALFWorld、WebShop 和七个搜索增强任务上取得 SOTA，超过基线 15.3%，同时因为技能比原始轨迹日志紧凑，token 消耗降低 10% 以上。

### SkillOpt，把 skill 优化当成零阶优化问题

[SkillOpt-Lite](https://arxiv.org/abs/2607.03451)（2026 年 7 月）做了一件我觉得概念上很漂亮的事，把「改 skill」形式化成零阶（Zeroth-Order）优化。经典优化里的中心差分映射为文件系统上的轨迹探索，置信域映射为共识属性挖掘，下降步映射为独立验证门控。落地的方式轻得出奇，只需向 agent 注入一行 vibe 提示，agent 就能自主挖掘跨任务可复用的技能。数字相当能打，LiveMathCode 上 GPT-5.5 提升 8.8 分，GPT-5.4-nano 提升 25.4 分；SpreadsheetBench 上，配了 HarnessOpt 的 nano 达到 0.7758，反超裸奔的 GPT-5.5（0.7620），而 nano 的价格只有前者的九分之一。**小模型加好技能，能干过大模型裸奔**，这个结论对工程实践的冲击不小。

### SkillBench，skill 过多会怎样

[More Skills, Worse Agents?](https://arxiv.org/abs/2605.24050)（2026 年 5 月）是我个人认为对生态最及时的一盆冷水。作者从 18 个真实 agent 项目收集了 202 个 skill，构建了首个 skill 评测基准 SkillBench，并同步调查了 405 个真实用户的 skill 库，人均挂着 19 个 skill。实验结论直白，**库内 skill 从 4 个涨到 16 个时，任务完成率下降 21%**。

论文拆出了两种独立的失效机理。skill shadowing 指选中了 skill 但执行仍被带偏，三种表现是 skill 内容覆盖不了任务的边界情形、新 skill 干扰了对旧 skill 的正确使用、skill 只被部分加载。context overhead 则更隐蔽，即便选择完全正确，膨胀的上下文本身也会拉低执行质量，这条机理可以追溯到 Lost in the Middle（[arXiv 2307.03172](https://arxiv.org/abs/2307.03172)）的经典发现，长上下文中间位置的信息利用率显著更低。论文的落地建议是按任务域把库规模控制在 4 到 6 个。

综合这四篇，学术界对 skill 的定位可以收拢成一句话，**skill 是把原始经验压缩成可执行知识的最小单元，也是 agent 自我改进循环里目前最可行的载体**。SkillRL 和 SkillOpt 站在「怎么自动产出好 skill」这一端，SkillBench 站在「怎么克制地用 skill」这一端，两端共同框定了当前的认知边界。

## 什么时候用 skill，什么时候用 prompt

把上面的材料消化完，我的实践判断如下。

用 prompt 就够的场景，一次性任务，方法论简单到一两段话能讲清，或者任务本身不会再出现。为它们建 skill 是杀鸡用牛刀，还会白白占用元数据那一格。

值得升级成 skill 的信号有三个。同一套指令你粘贴超过三次；方法论长到塞进 CLAUDE.md 会挤压其他配置的常驻空间；或者你想把这套经验分享给别人、挂在 GitHub 上迭代。三者命中其一，就值得把 prompt 抽出来，补上 name 和 description，做成一个文件夹。

还有一个维度是任务频率与上下文的权衡。skill 的加载机制天然适合「低频但深度」的知识，一年用几次、每次要展开几百行细节的，放进 skill 最省。高频知识反而可以考虑直接常驻 prompt，省去路由失败的代价，SkillBench 的数据提醒我们路由本身并不免费。

## 个人看法

### skill 的最大意义

我的核心判断是，**skill 的最大意义在于把针对特定任务的资源包（大部分其实是 prompt 信息）打包管理、迭代，并分发给别人的 agent 复用**。它用人类智慧结晶来辅助 LLM 更好地完成人类擅长的任务。56 年软件工程攒下的经验、一本经典书的方法论、一位资深工程师的工作习惯，过去只能靠人肉阅读内化，现在可以打包成 skill 直接挂到 agent 身上。SkillOpt 那组「nano 加技能反超大模型」的数字说明，这笔人类遗产的杠杆率相当高。

### 两点局限

第一，skill 过多会反噬。这一点我在 SkillBench 一节已经给过数据，库从 4 个涨到 16 个，完成率掉 21%，失效既发生在选择环节也发生在执行环节。很多用户的人均 19 个 skill 已经站在危险区里了。skill 的检索是模型在元数据层面做的语义匹配，没有倒排索引兜底，量一大必然漏配和误配。**装 skill 的手要比装 npm 包更克制**。

第二，大量 skill 不具备通用性，甚至会把 skill 退化成一份 reference 文档。典型样本是专门针对某家公司规范或某位老板口味写的内部说明书，离开那个环境就失效。这类内容本来该走 RAG 或知识库，被硬塞进 skill 的壳子里，既占了路由位，又稀释了「skill 是做事方法」这个语义。我翻社区市场时，相当比例的 skill 属于这类场景特化品，star 数掩盖了它们的可迁移性其实很低。

### 我的用法

落到日常，我现在按对口程度分两档。高 stars 且和我场景高度对口的 skill，直接安装照搬，比如官方文档处理三件套和我仓库里的排版检查。不确定对不对口的，我不装，而是把它的 SKILL.md 读完，把里面可迁移的设计思路（怎么写 description 的触发条件、怎么组织 reference 文件、怎么设验收场景）借鉴到自己的 skill 上。skill 生态对我更大的价值在于它是一座公开的方法论样本库，每个高 stars skill 都是一位作者公开的工作方式，读 skill 本身就是在学做事。

## 信息来源

| # | 来源 | 链接 |
|---|---|---|
| 1 | Anthropic 工程博客，Agent Skills 发布文（2025-10-16） | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills |
| 2 | Agent Skills 开放标准官网（2025-12-18） | https://agentskills.io |
| 3 | Claude 平台文档，skill 撰写最佳实践 | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices |
| 4 | anthropics/skills 官方仓库 | https://github.com/anthropics/skills |
| 5 | mattpocock/skills（grill-me 出处） | https://github.com/mattpocock/skills |
| 6 | VoltAgent/awesome-agent-skills 生态清单 | https://github.com/VoltAgent/awesome-agent-skills |
| 7 | Voyager 论文（arXiv 2305.16291） | https://arxiv.org/abs/2305.16291 |
| 8 | SkillRL 论文（arXiv 2602.08234） | https://arxiv.org/abs/2602.08234 |
| 9 | SkillOpt-Lite 论文（arXiv 2607.03451） | https://arxiv.org/abs/2607.03451 |
| 10 | More Skills, Worse Agents? 论文（arXiv 2605.24050） | https://arxiv.org/abs/2605.24050 |
| 11 | Lost in the Middle 论文（arXiv 2307.03172） | https://arxiv.org/abs/2307.03172 |
| 12 | Medium，The Skills Revolution（stars 增长数据） | https://medium.com/codex/the-skills-revolution-how-4-github-repos-are-making-ai-10x-smarter-and-why-youre-already-behind-33d89c477ab0 |
| 13 | SkillRisk，Top 100 skills 安全分析 | https://skillrisk.org/blog/top-100-github-skills-security-vulnerabilities-analysis/ |
| 14 | dev.to，The most popular AI coding skills right now | https://dev.to/aws/the-most-popular-ai-coding-skills-right-now-4183 |

## 时效与局限

- 生态数据（stars、客户端名单、市场规模）均为 2026 年 8 月检索时点，skill 生态变化很快，具体数字以各仓库实时数据为准。
- SkillBench 的结论基于 18 个项目、202 个 skill 与 405 名受访用户，样本在社区里算大，但相对整个生态仍属小样本，21% 这个数字的适用边界要看任务域。
- SkillRL、SkillOpt 出自不同团队，但 SkillOpt 系列与其前作结论同源，跨团队复现还没有看到，数字先按论文口径引用。
- 文中提到的社区 skill（grill-me 等）我只读了仓库与文档，未逐个实测效果。
