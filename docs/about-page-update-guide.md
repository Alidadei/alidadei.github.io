# 关于我页面 — 内容更新指南

> 「关于我」页面已改为 **Markdown 内容集合**维护。**只改 `.md` 文件即可更新页面,不需要碰任何代码。**

---

## 0. 只改这两个文件

| 文件 | 语言 | 路径 |
|------|------|------|
| 中文版 | zh | `src/content/about/zh.md` |
| 英文版 | en | `src/content/about/en.md` |

页面地址:`/zh/about/`(中文)、`/en/about/`(英文)。

⚠️ **铁律:中文改 `zh.md`、英文改 `en.md`,两个文件分别维护,不再像以前那样在一个代码文件里切换。改了一边别忘了另一边。**

---

## 1. 文件结构

每个 `.md` 由两部分组成:

```
---
（frontmatter:结构化数据,见下文）
---

（正文:自我介绍,纯 Markdown 自由写）
```

- `---` 之间是 **frontmatter**(YAML 格式),存动态/教育/经历/获奖/技能等结构化数据
- `---` 之后是**正文**,渲染为页面顶部的「自我介绍」,支持加粗、列表、段落等所有 Markdown 语法

---

## 2. frontmatter 各板块字段

所有板块都是**可选**的——把某板块整段删掉,页面上该板块(含标题)就自动隐藏。

### 自我介绍 → 正文(不用 frontmatter)
直接在 `---` 下面写 Markdown,例如:
```markdown
我是 Harry Yu,复旦大学生物医学工程博士在读,
专注**医疗大模型**的多模态融合。

研究之外,我喜欢用 AI Coding 搭小项目。
```

### 近期动态 `news`(新事件放最前)
```yaml
news:
  - date: "2026.04"
    text: 启动医疗大模型多模态融合研究课题
  - date: "2025.09"
    text: 入职复旦大学,攻读 AI 博士
```

### 教育经历 `education`
```yaml
education:
  - school: 复旦大学
    period: "2025.09 - 2030.06"
    degree: 人工智能博士研究生
```

### 实习经历 `internship`(可多条)
```yaml
internship:
  - company: 华为 · 多媒体智能协作实验室
    period: "2026.01 - 2026.04"
    description: 参与 Multi-Agent 协作会议助手项目……
```

### 研究与项目 `research`
```yaml
research:
  - title: 医疗大模型多模态信息融合与可解释性研究
    role: 课题负责人        # 可选
    period: "2025.09 - 至今"  # 可选
    description: 针对罕见病用药疗效预测……
```

### 获奖荣誉 `awards`(`desc` 可省略)
```yaml
awards:
  - title: 复旦大学相辉博士奖学金
    desc: 复旦大学
  - title: 华为HSD证书      # 无 desc 也行
```

### 专业技能 `skills`(`items` 用方括号数组)
```yaml
skills:
  - name: AI-Native 开发
    items: [AI Coding, LangGraph, Agent, A2A]
  - name: 通用技能
    items: [C/C++, MATLAB, "CET-6: 622", 普通话二甲]
```

---

## 3. YAML 注意事项(避免构建报错)

| 情况 | 写法 |
|------|------|
| 值里含 `:`(英文冒号+空格) | 加引号:`"CET-6: 622"`、`"2025.09 - 2030.06"` |
| 值以 `"` 或 `'` 开头 | 用另一种引号包整体:`'"智能自主系统"课题组'` |
| 值里含 `&` `*` 等 | 加引号:`"A & B"` |
| 列表数组 | 行内 `[a, b, c]` 或多行 `- a` 换行 `- b` 都行 |
| 注释 | `#` 开头,会被忽略 |

中文全角冒号「：」和全角括号「（）」**不触发** YAML 特殊语法,可不用引号。

---

## 4. 联系方式(不在 .md 里)

联系方式板块不由 `.md` 控制,统一读 `src/data/site.ts` 的 `siteConfig.author`:

- **Email / GitHub / 位置**:都在 `site.ts` 的 `author` 字段下

改邮箱、GitHub 或位置 → 改 `src/data/site.ts` **一处**即可(about、cv、Footer 都引用它,自动同步)。

---

## 5. 本地预览

```bash
npm run dev
```
打开 `/zh/about/` 和 `/en/about/`,**两个都看一眼**。

改完想发布:
```bash
git add -A
git commit -m "更新关于我内容"
git push
```

---

## 6. 进阶:改板块的字段/样式

- **加新字段**(如教育经历加「GPA」):需同步改两处——
  1. `src/content.config.ts` 里 `about` 集合的 schema(加字段)
  2. `src/pages/[lang]/about.astro` 里对应板块的渲染(显示字段)
- **改卡片/排版样式**:只改 `about.astro` 里的 Tailwind class
- **schema 定义位置**:`src/content.config.ts`(Astro 5 内容集合配置)

一般情况下**不需要**碰这两处,只改 `.md` 即可。
