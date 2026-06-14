# 项目(Portfolio)数据维护说明

「项目」页(`/{lang}/projects/`)的数据维护方式。

## 数据模型:一项目 = 一个 Markdown 文件

项目数据放在 `src/content/portfolio/{slug}.md`,文件名即 slug,每个文件是一个项目。字段由 `src/content.config.ts` 的 `portfolio` schema 约束。

## Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `title` | ✅ | 项目标题 |
| `excerpt` | — | 一句话简介(列表卡片显示,纯文本) |
| `collection` | ✅ | 固定值 `portfolio`(标识集合) |
| `image` | — | 卡片缩略图原图,指向 `public/images/xxx.png` |
| `link` | — | 详情页地址(独立 HTML 或外链),卡片点击新标签打开 |
| `categories` | — | 分类标签数组(如 `["数据分析"]`),前端自动聚合成分类 tabs |

> ⚠️ **md 正文目前闲置**:没有 portfolio 详情路由,详情页用独立 HTML(`public/portfolio/*.html`)。md 正文不渲染,仅 frontmatter 被列表页使用。

## 数据流

```
md frontmatter → getCollection('portfolio') → src/pages/[lang]/projects.astro(列表页)
      │
      ├─ image      → npm run thumbs → public/images/thumbs/*.webp(压缩缩略图)
      ├─ link       → 卡片点击新标签打开独立 HTML 详情
      └─ categories → 自动聚合成分类 tabs
```

## 新增 / 修改项目

1. 在 `src/content/portfolio/` 新建 `{slug}.md`(或改现有)
2. 填 frontmatter:`title`、`excerpt`、`image`、`link`、`categories`
3. 项目原图放 `public/images/`(如需)
4. 本地跑一次 `npm run thumbs` 生成缩略图(`npm run build` 会自动前置)
5. 列表页自动出现该项目,分类自动聚合——**不用动任何代码**

## 缩略图

- 脚本:`scripts/gen-portfolio-thumbs.mjs`(用 sharp 压成 webp,宽 ≤ 480px,质量 ~78)
- 命令:`npm run thumbs`(已链入 `npm run build`)
- **GitHub 部署自动生成**:CI(`deploy.yml`)跑 `npm ci`(装含 sharp 的 devDeps)+ `npm run build`(跑 thumbs),推 master 即自动生成
- 缩略图是构建产物,已 gitignore(`public/images/thumbs/`),不进仓库

## 详情页

- 现状:独立 HTML(`public/portfolio/*.html`),通过 `link` 字段新标签打开
- **没有**「md 自动渲染成详情页」的路由
- 新项目要么手写 HTML 放 `public/portfolio/`,要么 `link` 直接填外链(GitHub / Demo / HuggingFace)

## 分类

- 在 frontmatter `categories` 数组里自由打标签
- 前端动态聚合所有项目的标签,生成分类 tabs
- 加新分类不用改代码,直接在 md 写即可
- 列表页带无限滚动:每批 6 个,滚到底自动加载下一批;切分类重置到第一批
