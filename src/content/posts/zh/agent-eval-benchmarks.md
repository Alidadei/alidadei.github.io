---
title: '扒一扒 Agent 评测'
date: 2026-08-24
tags:
  - Agent
  - 评测
  - Benchmark
  - LLM
categories: ['practice']
knowledge: ['ai/llm/agent']
maturity: 当下热点
lang: zh
---

## 引言

2026 年，Agent 已经从演示走进生产：写代码、操作电脑、接客服工单、跑数据流水线。但「demo 里能跑」和「可靠可用」之间，隔着一套设计良好的评测体系。模型厂商发布会上的分数是怎么来的？哪些评测集是社区公认的「考场」？如果现有考场都不贴合你的业务场景，又该怎么自己为agent出一套卷子？

本文主要调研了三个问题：

- 社区主流都在**用什么方式**测评 Agent？
- 有哪些**权威评测集**可以直接拿来用？
- 如何**构建自己的评测集**？

文中所有论文均给出 arXiv 编号，仓库给出组织路径与大致 star 数（截至 2026-08，经 API 核实），方便溯源。（辅助调研agent：claude code 2.1.190 + openrouter OX  牛来模型）

---

## Agent 评测到底在评什么

普通 LLM 评测多是「单轮问答、静态数据集」；而 Agent 评测的对象是一个**闭环系统**——模型加上脚手架（scaffolding）、工具、记忆，在动态环境里多步执行任务。评的东西主要有：最终结果对不对、过程是否高效稳定、花了多少token。

AGENT 评测从总体上讲有「结果 vs 过程」导向。

结果导向（outcome）只看终态：issue 是否修复、数据库是否变成目标状态；

过程导向（process）则考察轨迹质量：步骤是否合理、有没有绕路、中途是否恢复错误。

工业界目前以结果导向为主流，因为它机器可判定、不易作弊；过程指标多用于调试阶段的归因分析。

目前最系统的学术梳理当属综述《Survey on Evaluation of LLM-based Agents》（[arXiv 2503.16416](https://arxiv.org/abs/2503.16416)），它从五个视角组织整个领域：

- Agent 所需的核心能力：规划、推理、工具使用等；
- 应用特定的基准：Web Agent、软件工程（SWE）Agent 等；
- 通用助手的评测；
- 对各基准本身核心维度的分析；
- 面向开发者的评测框架与工具。

该综述还指出：AGENT评测基准正变得**更真实、更难、且持续更新**；但是针对**成本效率、安全性与鲁棒性的评测仍然不足**，细粒度、可扩展的评测方法也还欠缺。

## 评测方式与关键指标

当前社区的评测方式可以归纳为五类。

### 终态校验（Outcome-based）

把任务成败定义为「终态是否符合预期」，用确定性程序判定：如 τ-bench 比对数据库终态，SWE-bench 看补丁能否通过项目测试，WebArena/OSWorld 用预定义的功能性检查点。优点是无法靠话术蒙混，缺点是**开放任务难以穷举所有正确终态**。

### 可靠性指标（pass^k）

单次成功率会掩盖不稳定。τ-bench 提出 **pass^k**：同一任务独立跑 k 次，统计**全部成功**的比例。这会逼着模型回答「你到底有多稳」，对要部署到生产的 Agent 是比平均分更硬的指标。与之互补的是 pass@k 思路——k 次里至少成功一次，用于衡量agent在某个任务上的能力上限。

### 成本与效率维度

主要指时间成本和token消耗。《AI Agents That Matter》（[arXiv 2407.01502](https://arxiv.org/abs/2407.01502)，Kapoor、Stroebl、Narayanan 等）对此有一段尖锐的分析：当前评测普遍「只盯准确率、不看其他指标」，结果是 SOTA Agent 不必要地复杂和昂贵，社区甚至得出了关于「分数从哪来」的错误结论。他们主张**联合优化成本与准确率**，这也是后来「cost-adjusted score」类指标的源头。

### 人机对照与时间锚定

即把agent的任务分数翻译成人类时间——「你的 Agent 相当于一个能专注干 50 分钟活的人」。这类指标的价值在于沟通便捷性：老板不需要懂 pass@k，但听得懂「相当于几个月的活」。

### LLM-as-Judge

当输出无法程序化判定而需要语义判定时（写作、对话质量、开放任务的中间步），用强模型当裁判。《Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena》（[arXiv 2306.05685](https://arxiv.org/abs/2306.05685)）奠定了这套方法，同时也系统揭示了几种必须防范的偏差：**位置偏差**（偏爱某个位置的答案，需交换顺序互评）、**冗长偏差**（偏爱更长的回答）、**自我偏好**（偏爱自己风格或自己的输出）。对 Agent 场景，裁判面对的是超长轨迹日志，难度远高于单轮问答，rubric 设计和分段评审就更重要。

## 权威评测集盘点

下面按场景分组盘点，每个评测集给出论文编号或仓库路径，star 数为 2026 年 8 月经 GitHub API 核实的大致值。

### 代码与软件工程

- **SWE-bench**（[arXiv 2310.06770](https://arxiv.org/abs/2310.06770)，普林斯顿，Jimenez、Shunyu Yao、Ofir Press 等）：让模型解决真实 GitHub issue。仓库 [SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench) 约 5.7k star。其人工核验的 500 题子集 **SWE-bench Verified** 已成为事实上的行业标准。衍生版本针对不同痛点：**SWE-bench Live**（[2505.23419](https://arxiv.org/abs/2505.23419)）持续更新题库防污染，**SWE-Bench Pro**（[2509.16941](https://arxiv.org/abs/2509.16941)）加长时程，**SWE-MERA**（[2507.11059](https://arxiv.org/abs/2507.11059)）走动态构建路线。
- **SWE-Lancer**（[arXiv 2502.12115](https://arxiv.org/abs/2502.12115)）：把 Upwork 上总价 100 万美元的真实自由职业软件任务搬进考场，直接以「能赚多少钱」计分。
- **MLE-bench**（[arXiv 2410.07095](https://arxiv.org/abs/2410.07095)，[openai/mle-bench](https://github.com/openai/mle-bench)，约 1.7k star）：考机器学习工程能力，如参加 Kaggle 竞赛般训练模型、达标冲榜。
- **Terminal-Bench**（[harbor-framework/terminal-bench-1](https://github.com/harbor-framework/terminal-bench-1)，约 2.6k star）：考终端里的复杂操作任务，配套评测框架 **Harbor**（[harbor-framework/harbor](https://github.com/harbor-framework/harbor)，约 4.6k star，自述「评测并改进 Agent 的框架」）。原 laude-institute 路径已 301 重定向至此，查资料时注意。
- **TheAgentCompany**（[arXiv 2412.14161](https://arxiv.org/abs/2412.14161)，[TheAgentCompany/TheAgentCompany](https://github.com/TheAgentCompany/TheAgentCompany)）：在一个模拟软件公司里完成日常任务——考的是长链条、多角色协作的综合职业能力。

### 网页、GUI 与深度检索

- **WebArena**（[arXiv 2307.13854](https://arxiv.org/abs/2307.13854)，CMU，Zhou、Neubig 等，[web-arena-x/webarena](https://github.com/web-arena-x/webarena) 约 1.6k star）：自托管一套仿真真实网站（购物、论坛、GitLab 等），让 Agent 在里面自主完成任务。
- **OSWorld**（[arXiv 2404.07972](https://arxiv.org/abs/2404.07972)，NeurIPS 2024，[xlang-ai/OSWorld](https://github.com/xlang-ai/OSWorld) 约 3.1k star）：在真实操作系统虚拟机里完成开放式计算机任务，是「Computer Use」类能力的代表考场。
- **AndroidWorld**（[arXiv 2405.14573](https://arxiv.org/abs/2405.14573)）：安卓模拟器中的动态基准环境。
- **BrowseComp**（[arXiv 2504.12516](https://arxiv.org/abs/2504.12516)）：考浏览 Agent 的深度检索与坚持力；多模态扩展 **MM-BrowseComp**（[2508.13186](https://arxiv.org/abs/2508.13186)）于 2025 年 8 月发布。

### 工具调用与对话式服务

- **AgentBench**（[arXiv 2308.03688](https://arxiv.org/abs/2308.03688)，ICLR 2024，清华团队，[THUDM/AgentBench](https://github.com/THUDM/AgentBench) 约 3.7k star）：早期最全面的多环境 Agent 基准之一，覆盖数据库、网页、游戏等多场景。注意它原在 OpenBMB 名下，现迁移至 THUDM。
- **τ-bench**（[arXiv 2406.12045](https://arxiv.org/abs/2406.12045)，Sierra，Shunyu Yao、Noah Shinn 等，[sierra-research/tau-bench](https://github.com/sierra-research/tau-bench) 约 1.4k star）：模拟「用户—Agent—领域 API+政策约束」三方对话，评法很讲究——**比对对话结束时的数据库状态与标注的目标状态**来判定成败，并提出 **pass^k** 指标衡量可靠性。原文结论相当扎心：当时最强的函数调用 Agent（如 GPT-4o）任务成功率不足 50%，pass^8 在 retail 域低于 25%。
- **τ²-bench**（[arXiv 2506.07982](https://arxiv.org/abs/2506.07982)，Sierra，2025-06）：升级到「双控」环境——用户侧和 Agent 侧都能操作界面，更贴近真人协作排障的场景。

### 通用助手、长时程与经济价值

- **GAIA**（[arXiv 2311.12983](https://arxiv.org/abs/2311.12983)，Meta 与 Hugging Face，Mialon、Fourrier、Wolf、LeCun、Scialom 等）：466 道概念上对人类很简单、对 AI 很难的助理题，需要推理、多模态、联网、工具使用的组合。论文里的反差极具冲击力：**人类答对 92%，带插件的 GPT-4 只有 15%**。它的理念与「出更难的题」背道而驰——考的是像普通人一样稳。排行榜托管在 Hugging Face。
- **METR 时间地平线**（《Measuring AI Ability to Complete Long Software Tasks》，[arXiv 2503.14499](https://arxiv.org/abs/2503.14499)）：提出一个漂亮的人类可比指标——**50%-task-completion time horizon**：AI 能以 50% 成功率完成的任务，人类通常要花多久。实测当时的前沿模型（如 Claude 3.7 Sonnet）约 50 分钟，且该数字自 2019 年以来大约每 7 个月翻一倍。这是目前讨论「Agent 能干多长的活」时被引用最多的框架。
- **GDPval**（[arXiv 2510.04374](https://arxiv.org/abs/2510.04374)）：直接考有真实经济价值的任务。
- **Vending-Bench**（[arXiv 2502.15840](https://arxiv.org/abs/2502.15840)）：用「经营一台自动售货机」考 Agent 的长期一致性与规划，专治短程聪明、长程崩溃。

### 一张速查表

| 评测集 | 场景 | 关键词 |
| --- | --- | --- |
| SWE-bench 系列 | 软件工程 | 真实 issue、事实标准 |
| SWE-Lancer | 软件工程 | 按美元计价 |
| MLE-bench | ML 工程 | Kaggle 式竞赛 |
| Terminal-Bench | 终端操作 | 配 Harbor 框架 |
| TheAgentCompany | 综合职业 | 模拟公司 |
| WebArena / OSWorld / AndroidWorld | 网页与 GUI | 自托管环境、虚拟机 |
| BrowseComp / MM-BrowseComp | 深度检索 | 浏览与坚持力 |
| AgentBench | 多环境 | 早期综合基准 |
| τ-bench / τ²-bench | 对话式服务 | 终态比对、pass^k、双控 |
| GAIA | 通用助手 | 人机反差 92% vs 15% |
| METR 地平线 | 长时程 | 人类时间锚定 |

## 如何构建自己的评测集

现成的agentic考场总有不合身的时候——尤其是垂直业务场景。综合上述论文与从业者经验（Hamel Husain 的《Your AI Product Needs Evals》、Eugene Yan 的 [Task-Specific LLM Evals that Do & Don't Work](https://eugeneyan.com/writing/evals/)），可以把构建流程收敛成八步。

```text
收集真实任务 → 定义可判定终态 → 组合三类判分器
     ↑                                  ↓
定期换新防污染 ← 回归+切片分析 ← 人工抽检校准
```

### 第一步：从真实失败样本出发

Hamel Husain 在《Your AI Product Needs Evals》（[hamel.dev](https://hamel.dev/blog/posts/evals/)，2024-03）中把评测分为人工、模型判分、自动化三层，核心主张是构建**领域专用**的评测体系。实践上的起点不是拍脑袋编题，而是翻产品日志，找出真实的失败模式，再据此设计题目——评测集本质上是「失败模式的清单」。

### 第二步：把任务写成机器可判定的形式

学 τ-bench：与其问「客服表现好吗」，不如定义「对话结束时数据库必须处于目标状态」。每道题都要能落成一句可执行的判定：文件内容等于 X、订单状态变为 Y、测试套件全绿。开放任务可以拆里程碑，给部分分，但主判定必须是确定性的。

### 第三步：组合三类判分器

- 确定性代码校验优先：能写断言就不请裁判；
- 必须用 LLM-as-Judge 时：给 rubric、给参考答案、交换位置评两次，抑制 MT-Bench 揭示的三类偏差；
- 人工抽检一小部分，度量与裁判的一致性，作为 judge 的质检。

### 第四步：公开集与保留集严格分离

《AI Agents That Matter》明确指出：许多 Agent 基准的 holdout 集「不充分，有时干脆没有」，导致 Agent 走捷径、过拟合基准而变得脆弱。自己建集时要留一块从不公开、只用于最终复核的私有测试集。

### 第五步：防污染，警惕agent背题

agent学会“背题”而非“做题”，是 Agent 评测当前最痛的点，而且有了定量证据：

- 《The SWE-Bench Illusion》（[arXiv 2506.12286](https://arxiv.org/abs/2506.12286)）发现，仅凭 issue 描述（不给代码库结构），SOTA 模型定位 SWE-bench 中出错文件的准确率高达 **76%**，而在非 SWE-bench 仓库的任务上只有 53%；答案级文本相似度同样异常（5-gram 最高 35% vs 对照组 18%）——强烈指向训练数据记忆。
- 《Does SWE-Bench-Verified Test Agent Ability or Model Memory?》（[arXiv 2512.10218](https://arxiv.org/abs/2512.10218)）做了更直接的对照：同样的定位任务，模型在 SWE-bench-Verified 上比在题源类似的对照基准上表现好 **3 倍**，找到被修改文件的概率高 **6 倍**——逻辑上这些任务本不该被解出来。

对策已经成型：持续换题（SWE-bench Live）、动态生成（SWE-MERA）、私有保留集、以及最重要的心态转变——**任何公开基准的高分都要先问一句「是不是背过」**。

### 第六步：同时记录成本与方差

每次评测顺手记录两列数据：这次花了多少钱（token、次数、时长）、重复 k 次的波动多大。前者来自《AI Agents That Matter》的联合优化主张，后者对应它指出的「标准化缺失导致不可复现」问题。没有这两列，分数无法比较，进步无从谈起。

### 第七步：环境确定性与版本化

Agent 评测的环境复杂度远高于文本基准，不确定性来源也更多。成熟基准的共同做法：WebArena 自托管全套网站、OSWorld 用虚拟机、Terminal-Bench/Harbor 用容器化沙箱，依赖全部钉死。自建评测至少要做到：环境容器化、任务带版本号、判分脚本与题目同库提交。

### 第八步：持续迭代与切片分析

Eugene Yan 的《Task-Specific Evals that Do & Don't Work》强调评测要贴具体任务、随产品迭代。落到操作层面：每次改 prompt、换模型、调脚手架后跑回归；按任务类型、难度、工具类别切片看分，找到退化最快的那个切片再修。评测集不是一次性工程，而是和产品一起长起来的资产。

## 小结

- **评什么**：针对闭环系统评测任务结果、成本与可靠性；
- **拿什么评**：软件工程看 SWE-bench 系列、GUI 看 OSWorld/WebArena、对话服务看 τ-bench、通用与长时程看 GAIA 和 METR ；
- **怎么自建**：收集真实失败样本起步、定义可判定终态、构建三类判分器组合、公私评测集划分、防止过拟合污染、记录成本、环境版本化、持续迭代。

## 参考资料

- 综述：《Survey on Evaluation of LLM-based Agents》，[arxiv.org/abs/2503.16416](https://arxiv.org/abs/2503.16416)
- 批评：《AI Agents That Matter》，[arxiv.org/abs/2407.01502](https://arxiv.org/abs/2407.01502)
- 评测集论文：SWE-bench [2310.06770](https://arxiv.org/abs/2310.06770)、GAIA [2311.12983](https://arxiv.org/abs/2311.12983)、AgentBench [2308.03688](https://arxiv.org/abs/2308.03688)、WebArena [2307.13854](https://arxiv.org/abs/2307.13854)、OSWorld [2404.07972](https://arxiv.org/abs/2404.07972)、τ-bench [2406.12045](https://arxiv.org/abs/2406.12045)、τ²-bench [2506.07982](https://arxiv.org/abs/2506.07982)、MLE-bench [2410.07095](https://arxiv.org/abs/2410.07095)、TheAgentCompany [2412.14161](https://arxiv.org/abs/2412.14161)、BrowseComp [2504.12516](https://arxiv.org/abs/2504.12516)、SWE-Lancer [2502.12115](https://arxiv.org/abs/2502.12115)、Vending-Bench [2502.15840](https://arxiv.org/abs/2502.15840)、GDPval [2510.04374](https://arxiv.org/abs/2510.04374)、METR [2503.14499](https://arxiv.org/abs/2503.14499)
- 污染研究：SWE-Bench Illusion [2506.12286](https://arxiv.org/abs/2506.12286)、SWE-bench Goes Live [2505.23419](https://arxiv.org/abs/2505.23419)、SWE-Bench Pro [2509.16941](https://arxiv.org/abs/2509.16941)、SWE-MERA [2507.11059](https://arxiv.org/abs/2507.11059)、Model Memory [2512.10218](https://arxiv.org/abs/2512.10218)
- 仓库：[SWE-bench/SWE-bench](https://github.com/SWE-bench/SWE-bench)、[THUDM/AgentBench](https://github.com/THUDM/AgentBench)、[xlang-ai/OSWorld](https://github.com/xlang-ai/OSWorld)、[web-arena-x/webarena](https://github.com/web-arena-x/webarena)、[sierra-research/tau-bench](https://github.com/sierra-research/tau-bench)、[openai/mle-bench](https://github.com/openai/mle-bench)、[harbor-framework/harbor](https://github.com/harbor-framework/harbor)、[UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai)、[openai/simple-evals](https://github.com/openai/simple-evals)、[EleutherAI/lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)、[openai/evals](https://github.com/openai/evals)
- 方法论：Hamel Husain《Your AI Product Needs Evals》[hamel.dev/blog/posts/evals](https://hamel.dev/blog/posts/evals/)、Eugene Yan《Task-Specific LLM Evals that Do & Don't Work》[eugeneyan.com/writing/evals](https://eugeneyan.com/writing/evals/)、《Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena》[2306.05685](https://arxiv.org/abs/2306.05685)

## 时效与局限

**本文一切数字以 2026-08-23 为准，使用前可以先看官方仓库**。
