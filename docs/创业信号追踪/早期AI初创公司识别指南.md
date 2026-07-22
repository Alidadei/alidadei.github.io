# 如何在早期识别厉害的 AI 初创公司——并在它们爆红之前加入

> 焕的深度调研。结论先行：**早期 AI 初创公司的"领先信号"是一组可观测的、互相印证的事实，而不是某一条直觉**。能否提前识别，本质上是看你能否比大多数信息源早 3–12 个月看到这组事实。
>
> 本文所有案例均来自公开报道，可逐一核对。日期、金额、人物以原文为准。

---

## TL;DR（如果你只读一段）

厉害的 AI 初创公司在还没爆红之前，几乎都在以下 6 个维度同时表现出"反常的强信号"：

1. **创始人有"非随机"的过去**：要么是顶级实验室的核心成员（DeepMind/Meta FAIR/OpenAI/Google Brain），要么在相邻领域已经赢过一次（量化基金、IOI 金牌、学术引用大户）。
2. **技术路线有清晰的 bet**：不是"什么都做一点"，而是押一个反共识的具体方向（开源/效率/长上下文/具身），并能用论文或产品证明。
3. **首批投资人是谁，比金额更重要**：被 Lightspeed、a16z、Sequoia、红杉中国、真格、砺思这类"知道自己在投什么"的机构抢着下注，本身就说明内部信息已经验证。
4. **工程活动在公开渠道先冒头**：GitHub commit 速度突涨、Hugging Face 模型短时间冲榜、arXiv 论文被同行密集引用——这些信号比 PR 早 3–6 周。
5. **招聘 JD 用语反常**：JD 里出现具体的技术名词（MoE、RLHF、特定 benchmark）、具体的研究方向、甚至引用自家论文——说明真的在做前沿，而不是招人填坑。
6. **组织设计上不模仿大厂**：扁平、talent density、敢用 PBC / 长期权锁定期——这些"反常"的选择本身是创始人价值观的外显。

下面用真实案例展开。

---

## 一、案例：6 家公司在"还没火"之前长什么样

### 1. DeepSeek（深度求索）——量化基金孵化的"反共识"模范

**创始人梁文锋的"非随机过去"**：
- 浙江大学机器视觉方向出身。
- 2015 年（30 岁左右）和浙大同班同学共同创立 **High-Flyer（幻方量化）**，靠"数学 + AI"做策略，是中国最大的量化基金之一。
- 幻方管理规模约 **80 亿美元**，2024 年收益率 **56.6%**，在国内量化中排第二。

**DeepSeek 在爆红前可被外部识别的信号**：
- **资金自给**：DeepSeek 不是从 VC 一轮轮融出来的，而是由幻方"自有资金 + 自建万卡集群"长期供养。这意味着它**不必为了下一轮融资做营销**，可以做"低曝光 + 长周期"的事——这本身就是反共识的信号。
- **2023 年 7 月**：发布 DeepSeek-Coder，在开源代码模型里表现突出，Hugging Face 上一周登顶。
- **2024 年 5 月**：DeepSeek-V2 把 MoE 推到极致，把 API 价格打到行业的 1/10——价格信号让所有 to-B 客户立刻注意到这家公司。
- **2024 年 12 月**：DeepSeek-V3 公开技术报告，**预训练成本约 557.6 万美元**（278.8K H800 GPU 小时）——这个数字后来成为整个 AI 行业的标志性事件。
- **2025 年 1 月 27 日**：R1 发布引发 NVIDIA 单日市值蒸发约 **5890 亿美元**（美股史上最大单日跌幅），但这对"早期识别者"来说已经晚了——V3 技术报告才是真正的早期信号。

**为什么这家公司在没火之前就值得识别**：技术报告 + 极低 API 价格 + 完全开源，是三个互相印证、可被工程师在公开渠道观察到的信号，且不需要任何内部信息。

---

### 2. 智谱 AI（Zhipu）——"清华系 + 学术产业化"的中国样本

**唐杰团队的"非随机过去"**：
- 智谱 2019 年 6 月成立，**脱胎于清华大学计算机系知识工程实验室（KEG）**，唐杰是发起人兼首席科学家。
- 唐杰是中国大模型领域的学术领军人物，AML、BigGraph、GLM 系列学术工作早就被业内熟知。

**早期信号**：
- **2019 年中**：天使轮即由 **中科创星** 投 4000 万元——这是国内最早押"大模型"赛道的天使之一。
- **ChatGLM 系列开源**：从 GLM-130B 到 ChatGLM-6B，智谱是国内最早把大模型以开源形式释放给中文社区的公司，长期占据中文开源大模型榜首——开发者口碑在 2023 年 ChatGPT 引爆国内大模型热之前就已经形成。
- **2024 年下半年**：半年内密集完成超 50 亿元融资，社保基金、美团、蚂蚁、阿里、杭州城投、上城资本全部进入——当国资 + 互联网巨头同时下注时，估值已经反映了大量公开信息，不是早期了。
- **2025 年初港股上市**：成为"大模型第一股"，唐杰在上市当天发内部信要求"全面回归基础模型研究"。

**为什么这家公司在 2019-2022 年就值得识别**：学术实验室产业化 + 早期开源 + 顶级机构天使 = 三重信号叠加。

---

### 3. 月之暗面（Moonshot AI / Kimi）——"长上下文"的精准 bet

**杨植麟的"非随机过去"**：
- 清华出身，是 **Transformer-XL** 和 **XLNet** 的核心作者——这两篇论文是 LLM 长序列建模的奠基性工作。
- 创始 5 人团队中 4 人来自清华。

**早期信号**：
- 2023 年 3 月成立后，**几乎不做技术发布会**，专注一个反共识方向：**超长上下文**。
- Kimi 早期靠"传文件 → 总结"的功能在产品极不完善时就吸引了大量学生和分析师用户——产品口碑信号先于融资信号。
- 早期投资方包括**红杉中国、真格、砺思资本**——这几家在国内同时押中"杨植麟"本身就是市场内的强信号。
- 2024 年初估值约 25 亿美元，2025 年 5 月估值突破 200 亿美元——估值爬升速度本身就是 retrospectively 可见的"领先信号"。

**这家公司辨识度最高的一点**：bet 极其具体（长上下文 = 把 Transformer-XL 的学术工作商业化），创始人论文就是产品说明书。

---

### 4. Mistral AI——"4 周 + 7 页 memo + €105M 种子轮"的欧洲奇迹

**三人创始团队的"非随机过去"**：
- **Arthur Mensch（CEO）**：DeepMind 巴黎，**Chinchilla 论文**共同作者——"compute-efficient training"是 founding DNA。
- **Guillaume Lample（首席科学家）**：Meta FAIR，**LLaMA 项目**的负责人。
- **Timothée Lacroix（CTO）**：Meta 巴黎 AI 团队。
- 三人 30 岁出头，从学生时代就认识。

**早期信号（值得逐条记下来，这是教科书级的"早期识别"案例）**：
- **2023 年 4 月 28 日**成立。
- **5 月**：用一份 **7 页 memo** 融资（不是 60 页 PPT）——这本身就是反共识。
- **6 月 13 日**：成立仅 4 周，宣布 **€105M 种子轮**（约 $113M），估值 **€240M**，**Lightspeed 领投**，红点、Index、前 Google CEO **Eric Schmidt**、法国富豪 **Xavier Niel**、CMA CGM 的 Rodolphe Saadé 全部参投——这是当时**欧洲史上最大种子轮**。
- **9 月 27 日凌晨 5 点**：Mensch 用一个几乎没活跃过的 Twitter 账号发出 **Mistral 7B 的磁力链接（bare torrent link）**，刻意把模型做小到能在笔记本上跑——**24 小时内百万浏览**。
- **12 月**：Mixtral 8x7B 发布，超越 Llama 2 70B 和 GPT-3.5。
- **2023 年 12 月**：a16z 领投 $415M Series A，估值 $2B。

**Mistral 把开源作为信号弹的三重用途**（Mensch 在 20VC 访谈里讲过）：
1. **零成本分发**：开发者本地跑 = 免费用户。
2. **招聘磁铁**：发出"最好的小模型"等于对全球工程师发招募信号。
3. **政治善意**：成为"欧洲开源冠军"后，BNP、CMA CGM 这类法国大企业直接成为早期客户。

**为什么这家公司在 2023 年 6 月就值得识别**：种子轮的"领投方 + co-investor 名单 + 估值 + memo 长度"四个维度，每一个都不是普通初创公司会出现的。Lightspeed 合伙人 Antoine Moyroud 在 TechCrunch 的采访里直接说："全世界能优化 LLM 的人只有 70–100 个，他们占了三个。"

---

### 5. Anthropic——"7 个 OpenAI 联创 + 安全分歧"的逃逸案例

**8 人创始团队的"非随机过去"**：
- 2021 年初，**Dario Amodei**（OpenAI 研究 VP）和妹妹 **Daniela Amodei** 带 **7 个前 OpenAI 同事**出走——**8 个创始人中只有 1 个不是 OpenAI 出身**。
- 直接动因：对 OpenAI **营利化转向**和**安全研究节奏**的分歧（GPT-3 之后内部权力斗争激化）。

**组织设计上的反常选择**：
- 注册为 **Delaware Public Benefit Corporation（公益公司）**——这在 2021 年的 AI 圈非常罕见。
- 早期最大金主是 **FTX/SBF**（后来重组为其他股东），后续由 Google、Amazon、Salesforce 等大资本支撑。
- "talent density + safety-first" 的文化对 Effective Altruism 社区高度友好——从 EA 圈吸引了一批别处挖不动的工程师和研究员。

**早期信号**：
- Dario 在 OpenAI 内部就主导了 GPT-2、GPT-3 的安全发布策略——这个角色本身已经是"行业里有名字的人"。
- 2022 年夏天 Claude 完成训练但**故意不发布**，直到 2023 年 3 月才上线——这种"敢慢"的姿态本身就是反共识。
- 2023 年 11 月 OpenAI 内乱期间，OpenAI 董事会主动接触 Dario 接任 CEO + 合并——这等于市场公开承认 Anthropic 是 OpenAI 的头号替代。

**为什么这家公司在 2021-2022 年就值得识别**：8 个 OpenAI 联创的"集体行动"本身就是行业内最高强度的信号——这种密度的核心团队出走，过去十年只发生过这一回。

---

### 6. Sakana AI（东京）+ Cognition（Devin）+ 宇树（Unitree）——三条不同的"非随机"路径

**Sakana AI**（东京，2023 成立）：
- **David Ha**（前 Google Brain 研究负责人、前 Stability AI）+ **Llion Jones**（**Transformer 论文 8 个作者之一**）+ Ren Ito。
- $30M 种子轮，主推 "nature-inspired" 训练方法（进化、群体智能）。
- 早期信号：**Transformer 原作者 + 东京地缘 + 反共识研究方向**，三个维度叠加。

**Cognition AI**（Devin，2024 走红）：
- CEO **Scott Wu** 是 **3 次 IOI 金牌**得主，团队几乎全是顶赛程序员。
- 主打 AI coding agent，Devin 发布即引爆。
- 2 年内估值达 **$26B**。
- 早期信号：**竞赛编程金字塔尖 + 编程 agent 这个反共识方向**——这种背景的团队去做"代码 agent"几乎是必然值得跟踪。

**宇树科技**（杭州，2016 成立）：
- **王兴兴**研究生期间造出 XDog 四足机器人原型机，**2015 年参赛获二等奖 + 8 万元奖金**——这就是"第一桶金"。
- 2016 年天使轮估值 0.13 亿元，2025 年 Pre-IPO 投后估值 127 亿元，**9 年估值涨约 1270 倍**。
- 早期信号：**硬件能卖钱 + 不烧钱**（机器人卖 16.8 万还能净赚 6 亿）——硬件公司里有正毛利本身就是反常。

---

## 二、归纳：早期 AI 初创的"领先信号清单"

把上面 6 家公司的早期特征去重，得到一份**可操作 checklist**。**每一条单独都不够，多条同时出现才形成"信号簇"**：

| 维度 | 强信号（值得跟踪） | 弱信号 / 红旗（要警惕） |
|---|---|---|
| **创始人背景** | 顶级实验室/顶级竞赛/上一段已成功 | 创始人背景只有"连续创业者"而无技术分量 |
| **联合创始人密度** | 5-8 个核心人，集体来自同一顶级机构 | 单点创始人 + 拼凑的高管团队 |
| **技术 bet 的清晰度** | 能用一句话讲清具体押什么（开源/效率/长上下文/具身） | "做通用 AGI"/"全栈 AI" |
| **首批投资人** | Tier-1 早期专项基金领投 + 行业级 co-investor | 只有不懂行的钱、或财务投资无产业方 |
| **早期融资速度** | 种子轮 4-12 周内完成，金额反常地大或反常地小 | 融资 18 个月还没关 |
| **开源 / 论文产出** | 有具体的开源仓库或论文被同行密集引用 | 全闭源 + 没有任何技术输出 |
| **GitHub 工程信号** | commit velocity / contributor 数短期陡升 | 仓库半年没提交 |
| **HuggingFace 信号** | 模型短期内冲榜、下载量曲线非线性增长 | 只有营销、没有模型权重 |
| **产品口碑** | 工程师 / 研究员在小圈子自发讨论 | 只有 PR 稿和投流广告 |
| **组织设计** | PBC / 长期权 / 扁平 / talent density | 完全照搬大厂的组织图 |
| **招聘 JD 用语** | 出现具体技术名词（MoE / RLHF / 具体 benchmark）/ 引用自家论文 | "我们使用最先进的 AI 技术" |
| **客户结构** | 已有 1-2 个有名有姓的企业客户（Mistral 的 BNP、CMA CGM） | 只有"多家行业龙头"而无名 |

---

## 三、可操作：你（学生/新人）如何早 3-12 个月识别这类公司

下面这一节是给你**直接拿来用**的工具清单和操作流。所有工具都是公开的、免费的或可白嫖的。

### 信号源 1：GitHub（工程信号——通常最早）

- **看 commit velocity**：一家 startup 的 GitHub org 在 14 天内 commit 速度涨 200%、contributor 数涨 50% 以上，通常是**刚关完一轮 + 大规模招人**的信号——**比 PR 早 3-6 周**。
- 已有现成工具在用这套方法论做 dealflow（参考 IndieHackers 上的 [VC Deal Flow Signal](https://www.indiehackers.com/post/i-built-a-tool-that-reads-github-to-find-breakout-startups-before-vcs-do-1d77fa0e75)，逻辑是 14 天 commit velocity + contributor growth + repo expansion）。
- 自己能做的：订阅 [`star-history`](https://www.star-history.com/)，盯 star 增速；用 GitHub 的 `trending` + 自定义关键词（如 `moe`、`agent`、`vllm` 周边）。

### 信号源 2：Hugging Face（模型信号）

- 直接看 **HF Trending Models** 和 **Spaces Trending**。
- 关注下载量曲线形状：**非线性陡升**（不是缓慢线性增长）才说明产品/论文爆了。
- 关注**模型卡作者机构**：很多初创公司发布模型权重时会带 org 标识，**第一次出现就值得记下**。

### 信号源 3：arXiv + Semantic Scholar（学术信号）

- 订阅 `cs.CL`、`cs.LG`、`cs.RO`（机器人）的每日推送。
- 在 [Semantic Scholar](https://www.semanticscholar.org/) 关注**某篇论文发出后 30 天内被引次数**——一周内被引 10+ 次几乎可以确定是热门。
- 关注 **NeurIPS / ICML / ICLR 的 Oral/Spotlight** 论文作者的去向——很多人发完论文就跳去初创公司。

### 信号源 4：Tier-1 VC 的 portfolio 公开页（融资信号）

**国外**：
- [a16z portfolio](https://a16z.com/portfolio/)、[Sequoia portfolio](https://www.sequoiacap.com/companies)、[Lightspeed portfolio](https://lsvp.com/portfolio)——这三家在 AI 领域命中率最高。
- Sequoia 美国投了 134 家独角兽（Series A 及更早），a16z、Lightspeed 紧随。
- 加速器：**Y Combinator**、**Neo**、**South Park Commons**、**Epoch** 的 demo day 公司列表。

**国内**：
- 红杉中国、真格、砺思资本、高瓴、五源、今日资本的 portfolio 页。
- **智谱 Z 计划**这种大厂生态基金（如智谱的 [DemoDay](https://hub.baai.ac.cn/view/48666)）——大模型公司反向做生态投资，等于在帮你做筛选。

### 信号源 5：技术圈社交信号（人信号）

- **Twitter/X**：盯 DeepMind/OpenAI/FAIR/Anthropic 的现役研究员 follow 了谁、转了谁。**当一群圈内人同时转发一个新账号时**，几乎可以确定这家公司刚发出信号弹（参考 Mistral 5am 那条）。
- **国内**：小红书的"AI 圈技术博主"、即刻的"AI 话题"、B 站的 AI up 主——这些人比媒体早 1-2 个月开始讨论。
- **LinkedIn**：关注头部研究员的 job change——研究员的简历变动是**最硬的早期信号**，比新闻早。

### 信号源 6：JD 用语（招聘信号——被严重低估）

打开一家公司的招聘页，**直接读 JD 全文**：
- 出现 **MoE / RLHF / RLAIF / 长上下文 / KV cache / 具体某个 benchmark** 的具体技术词 = 真的在做前沿。
- 出现 **"基于最先进的 AI 技术"**、**"拥抱变化"**、**"AGI 时代"** 这类空话 = 大概率是套壳或 ppt 公司。
- JD 引用自家论文 = 强信号。
- **同一周内突然放出 10+ 高级岗位** = 刚融完资（和 GitHub commit spike 互相印证）。

### 信号源 7：产品和价格信号

- **API 价格异常低**（DeepSeek-V2 的案例）= 公司想用价格逼出市场注意力。
- **产品 demo 比同行明显好一个量级**，但公司还没融大轮 = 强信号。
- **有 1-2 个真实企业客户公开背书**（如 Mistral 的 BNP、CMA CGM）= 已经过了 PMF 验证。

### 推荐的"每周 30 分钟扫描"流程

```
周一（15min）：扫 HF Trending + arXiv cs.CL/cs.LG 周推送
周三（10min）：扫三家 Tier-1 VC 的 portfolio 更新
周五（5min）：  扫盯的 10-20 个研究员 Twitter，看转发了谁
```

每周记录到一张表：**公司名 / 创始人 / 押的方向 / 已出现的信号 / 时间戳**。**3 个月后回看，会出现明显的"信号簇"——同一家公司在多个维度同时冒头时，就是该投简历的时候**。

---

## 四、诚实的部分：早期加入的真实代价和风险

> 这一段是给你**泼冷水**的。早期加入不是免费的——你需要知道你付的是什么。

### 风险 1：股权的数学残酷性

- **早期员工的股权通常只有 0.1% - 1.5%**（[SaaStr 基于 50,000 家 startup 的数据](https://www.saastr.com/how-much-equity-to-give-your-first-employees-the-real-data-from-50000-startups/)）。第二个员工比第一个员工**立刻少 43%**。
- **实习生通常拿不到股权**，或只有 token 象征性的份额——你的回报主要来自"这段经历本身能为你下一段路开多少门"，而不是股权。
- 创始人持股 15-50%，员工 1-2%，**差一个数量级**——这是个**结构性事实**，不是公司黑心。
- [Matthew Goldman 的计算](https://www.matthewgoldman.com/founders-initial-employees-and-risk/)：把风险折现后，startup 员工的期望回报**大概率不如去大厂拿 RSU**。如果你的目标是"稳定地赚更多钱"，早期加入 startup **从来不是数学最优解**。

### 风险 2：公司大概率会死

- 即使是 Tier-1 投的公司，**5 年存活率也不到 50%**。
- 技术路线可能赌错：今天的"领先方向"（比如某个特定的 agent 架构）6 个月后可能被证伪。
- 红旗清单（来自 [Technical Due Diligence: 11 Red Flags](https://moeidsaleem.com/writing/technical-due-diligence-11-red-flags-that-kill-ai-startup)）：
  - **"我们的 AI" 实际上是别人 API 的封装**——这是最常见的红旗。
  - **没有任何技术博客 / 论文 / 开源仓库**——技术是黑箱。
  - **创始人说不清自己押的是什么技术 bet**。
  - **数据来源说不清**（合规和可持续性风险）。
  - **核心团队 6 个月内有人离职潮**。
  - **估值和实际产品/收入严重脱钩**。

### 风险 3：身份和签证

- 国内实习生的法律身份比较清晰，但**国外 AI 公司对国际实习生的签证支持差异极大**——Anthropic、Mistral 这类公司通常能办，但 10 人以下的小初创可能根本办不了。
- 实习结束后**转正的不确定性**远高于大厂。

### 风险 4：你学到的东西可能"窄"

- 早期公司人少，每个人深度但窄。你可能在某一个小方向上**成为世界前 50**，但整体工程视野不如大厂。
- 如果公司死了，**这段经历的"信号价值"取决于公司最后火到什么程度**——加入一个最后倒闭的明星公司（比如某些 agent 初创），简历价值仍然不低；加入一个从来没火过的公司，简历价值≈0。

### 给你的判断标准（降低踩雷概率）

把"是否值得加入"拆成 4 个判断：

1. **学习价值**：能不能在这里学到外面学不到的东西？（关键看团队里有没有 1-2 个真正强的人愿意带你）
2. **信号价值**：这家公司 12 个月后会不会被业内人知道？（用本文第三节的信号源验证）
3. **退出选项**：如果公司死了，这段经历能让我去哪里？（参考前同事的去向）
4. **个人匹配**：你能不能承受 80% 概率失败的财务后果？

**如果 1、2、3 都满足，4 自己能扛——那就去**。如果只是为了"早期加入"而早期加入，**不如去大厂做前沿方向**。

---

## 五、给你的具体行动建议（接下来 3 个月）

1. **建立信号表**：用本文第三节的 7 个信号源，每周扫 30 分钟，记录到一张表里。3 个月后你会有一份**自己跟踪出来的早期公司 shortlist**。
2. **直接联系创始人**：早期公司（<30 人）的创始人通常会**亲自读冷邮件**。一封好的冷邮件 = "我读了你们 X 论文，做了 Y 复现，发现 Z，我想加入"。这比海投简历有效 10 倍。
3. **公开做技术**：在 GitHub / HF / arXiv 上公开你做的东西。早期公司招人最看的是"**有公开证据你能做这件事**"——DeepSeek、智谱、Mistral 都偏好这种招聘方式。
4. **先做开源贡献**：给你 shortlist 里的公司贡献 PR（修 bug、加 feature、复现论文）。这是**最强信号**——你已经在做他们的工作了。
5. **去 demo day / 学术会议**：智谱 Z DemoDay、智源大会、NeurIPS、ICML 的 poster session——**直接线下认识**比线上联系有效得多。
6. **设定止损**：给自己一个"如果 6 个月没拿到 offer / 公司死了"的 plan B——比如同时保留大厂实习选项。

---

## 六、一句话总结

> **早期识别厉害的 AI 初创公司，不是靠"内幕消息"或"运气"，而是靠有意识地、长期地观察一组互相印证的公开信号——创始人背景、技术 bet、首批投资人、开源/论文产出、工程活动、招聘 JD 用语、客户结构——当多个维度同时冒头，就是该行动的时候。**
>
> 而早期加入的真实回报，主要不是股权，而是**学习价值 + 信号价值 + 退出选项**——这三个才是你要押注的东西。

---

## 参考来源（按引用顺序）

- [DeepSeek: From Hedge Fund to Frontier Model Maker — ChinaTalk](https://www.chinatalk.media/p/deepseek-from-hedge-fund-to-frontier)（早期与幻方关系）
- [DeepSeek Founder Liang's Funds Surge 57% — Bloomberg](https://www.bloomberg.com/news/articles/2026-01-12/deepseek-founder-liang-s-funds-surge-57-as-china-quants-boom)（幻方量化基金 2024 年收益）
- [Meet DeepSeek founder Liang Wenfeng — Fortune](https://fortune.com/2025/01/27/deepseek-founder-liang-wenfeng-hedge-fund-manager-high-flyer-quant-trading/)
- [DeepSeek sparks AI stock selloff; Nvidia posts record — Reuters, 2025-01-27](https://www.reuters.com/technology/chinas-deepseek-sets-off-ai-market-rout-2025-01-27/)（NVIDIA 单日蒸发 ~$589B）
- [超500亿，清华系智谱敲钟 — 创业邦](https://www.cyzone.cn/article/821069.html)（2019 年成立、中科创星 4000 万天使）
- [智谱再融10亿元 — 新浪财经](https://finance.sina.com.cn/stock/t/2025-07-07/doc-infermiq4481177.shtml)（脱胎清华 KEG 实验室）
- [智谱 — 维基百科](https://zh.wikipedia.org/zh-cn/%E6%99%BA%E8%B0%B1)
- [四面出击的智谱：这家最像 OpenAI 的中国公司 — 品玩](https://www.pingwest.com/a/288857)
- [月之暗面的发展历程 — 飞书 wiki](https://docs.feishu.cn/v/wiki/NCp5wLd1CiEcIEkCoHAcPhlDnSe/a5)（创始 5 人 4 人清华）
- [200亿估值后，月之暗面们的考验 — 36kr](https://m.36kr.com/p/2857111512959619)
- [Mistral AI: $0 to $400M ARR — StartupRiders](https://www.startupriders.com/p/mistral-growth-playbook)（7 页 memo、Chinchilla 作者、开源策略、BNP/CMA CGM 客户）
- [France's Mistral AI blows in with a $113M seed round — TechCrunch](https://techcrunch.com/2023/06/13/frances-mistral-ai-blows-in-with-a-113m-seed-round-at-a-260m-valuation-to-take-on-openai/)（4 周 €105M 种子轮细节、Lightspeed/Moyroud 引语）
- [Meet Europe's Next Great Generative AI Startup: Mistral AI — Lightspeed](https://medium.com/lightspeed-venture-partners/meet-europes-next-great-generative-ai-startup-mistral-ai-25ee537b1f9e)
- [Dario Amodei — Wikipedia](https://en.wikipedia.org/wiki/Dario_Amodei)（8 人联创、Princeton/Stanford/OpenAI 背景）
- [Anthropic vs OpenAI rivalry timeline — Business Insider](https://www.businessinsider.com/sam-altman-dario-amodei-anthropic-openai-rivalry-timeline-2026-2)（2020/12 离开 OpenAI、2021 成立、PBC 结构）
- [We raised $30M — Sakana AI Seed Round 公告](https://sakana.ai/seed-round/)（David Ha / Llion Jones 创始背景）
- [Sakana AI Corporate Info](https://sakana.ai/company-info/)
- [Introducing Devin — Cognition](https://cognition.com/blog/introducing-devin)（Scott Wu 竞赛编程背景）
- [90后王兴兴：偏科者的逆袭 — 中国新闻周刊](https://news.inewsweek.cn/people/2025-08-06/26202.shtml)（宇树天使轮、务实风格）
- [宇树过会，王兴兴身家或超140亿 — 钛媒体](https://www.tmtpost.com/8010525.html)（XDog 8 万奖金、1270 倍估值）
- [宇树净赚6亿：撕开遮羞布 — 铅笔道](https://m.pencilnews.cn/p/46668.html)（硬件正毛利）
- [I built a tool that reads GitHub to find breakout startups — IndieHackers](https://www.indiehackers.com/post/i-built-a-tool-that-reads-github-to-find-breakout-startups-before-vcs-do-1d77fa0e75)（14 天 commit velocity 方法论）
- [How Much Equity to Give Your First Employees — SaaStr](https://www.saastr.com/how-much-equity-to-give-your-first-employees-the-real-data-from-50000-startups/)（第一个员工 1.5% → 第二个 0.85%）
- [Founders, Initial Employees, and Risk — Matthew Goldman](https://www.matthewgoldman.com/founders-initial-employees-and-risk/)（早期员工期望回报数学）
- [Technical Due Diligence: 11 Red Flags — Moeid Saleem](https://moeidsaleem.com/writing/technical-due-diligence-11-red-flags-that-kill-ai-startup)（"Our AI 只是 API" 等红旗清单）
- [Top Early-Stage Unicorn VCs — Ilya Strebulaev / LinkedIn](https://www.linkedin.com/posts/ilyavcandpe_top-early-stage-unicorn-vcs-sequoia-capital-activity-7391866923581513728-bxuX)（Sequoia 投了 134 家独角兽）
- [Leading Investors in Unicorns — Crunchbase News](https://news.crunchbase.com/venture/leading-unicorn-investors-ai-chips-sequoia-lightspeed/)
- [2025 智谱 Z DemoDay — 智源社区](https://hub.baai.ac.cn/view/48666)（大厂生态基金的筛选价值）

---

*文档版本：v1.0｜生成日期：2026-07-20｜维护：焕 + Claude Code deep-research 工作流*
