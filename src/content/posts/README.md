# 博客文章写作指南

## 文件命名

- 放在 `posts/zh/` 或 `posts/en/` 目录下
- 使用小写英文 + 短横线命名，如 `my-new-post.md`

## Frontmatter 模板

```yaml
---
title: '文章标题'
description: '一句话摘要（可选，用于列表页预览）'
date: 2026-06-12
tags:
  - 标签1
  - 标签2
categories: ['分类路径', '子分类']
lang: zh
---
```

## 正文写作规范

### ✅ 正确写法

```markdown
---
title: 'Git Rebase 完全指南'
date: 2026-06-12
tags: [Git]
categories: ['tech-learning']
---

## 什么是 Rebase

正文内容从这里开始...
```

### ❌ 错误写法

```markdown
---
title: 'Git Rebase 完全指南'
date: 2026-06-12
---

# Git Rebase 完全指南    ← 不要这样写！标题会重复显示

## 什么是 Rebase

正文内容...
```

### 原因

PostLayout 会自动把 frontmatter 中的 `title` 渲染为页面大标题（H1）。
如果正文中再写 `# 标题`，页面上就会出现两个一样的标题。

**规则：标题在 frontmatter 写，正文从 `##` 开始。**
