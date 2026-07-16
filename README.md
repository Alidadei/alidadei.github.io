# Harry Yu 的个人网站

> Astro 静态生成的个人网站与博客,中英双语,部署在 GitHub Pages。
> 站点:https://alidadei.github.io

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Astro 6 (SSG) |
| 交互组件 | React 19 |
| 样式 | Tailwind CSS 4 |
| 数学公式 | remark-math + rehype-katex |
| 3D 背景 | Three.js(自托管) |
| 农历 | lunar-javascript |
| CMS 后端 | Cloudflare Worker + KV(远程管理) |
| 部署 | GitHub Pages(GitHub Actions) |
| Node | >= 22.12.0 |

---

## 特性

- **三层渐进加载首页**:2D 宇宙星空(立即)→ 3D 星球(requestIdleCallback)→ SunArc 天空动画(3D 后淡入),保证首屏速度
- **中英双语 i18n**:全站 /zh/ /en/ 路由,内容集合按语言分文件
- **数据驱动**:分类树、友链、每日一句、重定向均为 JSON,改数据即更新
- **本地维护工具**:npm run cms 交互式管理分类/标签/友链(增删改 + 批量 + 重命名自动同步文章与重定向)
- **玻璃质感 UI**:友链卡片、Header 毛玻璃,暖棕米色调
- **KaTeX 公式 + 代码块**:数学公式渲染、代码块浅色主题 + 一键复制按钮
- **移动端适配**:响应式布局、汉堡菜单、触摸友好
- **SEO**:sitemap、Open Graph、RSS、分类改名自动重定向

---

## 项目结构

```
alidadei.github.io/
├── src/
│   ├── pages/[lang]/        页面路由(i18n):首页/关于/简历/项目/博客/友链/admin
│   ├── content/             内容集合:posts(博客) portfolio(作品) about(关于)
│   ├── data/                JSON 数据:categories friends quotes redirects site
│   ├── components/          组件:Header Footer SunArc AwardWall Timeline SearchBar AdminApp
│   ├── layouts/             布局:BaseLayout PageLayout PostLayout
│   ├── styles/global.css    全局样式 + 主题色
│   └── 3d/background.ts     3D 背景场景源码
├── scripts/                 维护脚本:cms.mjs(分类标签友链) gen-portfolio-thumbs.mjs(缩略图)
├── tests/                   验证脚本:cms-functions.test.mjs
├── public/                  静态资源:3d-background.html sw.js fonts/ images/
├── worker/                  Cloudflare Worker CMS 后端源码
├── docs/                    文档:知识图谱 quick-commands 排版规范
└── .github/workflows/       CI/CD:deploy.yml
```

---

## 常用命令

> 命令均为纯文本,直接双击选中复制即可。在项目根目录执行。

| 命令 | 作用 |
|------|------|
| npm install | 安装依赖 |
| npm run dev | 本地开发服务器(实时热更新,含 3D 打包) |
| npm run build | 完整构建到 dist/(3D + 缩略图 + Astro) |
| npm run preview | 预览构建产物(和线上一致) |
| npm run cms | 分类/标签/友链 CLI 维护工具(交互式) |
| npm run thumbs | 重新生成作品集缩略图(sharp) |
| npm run build:3d | 只重新打包 3D 背景脚本 |
| node tests/cms-functions.test.mjs | 跑 cms 纯函数测试 |

写文章/调样式用 dev(实时);提交前确认线上效果用 build + preview。

---

## 内容维护

- **写博客**:在 src/content/posts/zh/ 新建 .md,frontmatter 按 docs/技术博客排版规范.md(单行 categories、tags 多行、正文从 ## 起);正文图片使用相对 `../../../../public/images/posts/` 的路径,Typora 与线上均可查看。
- **分类/标签/友链**:npm run cms 交互式管理(增删改 + 批量)。
- **每日一句**:改 src/data/quotes.json(按日期自动轮换)。
- **关于我**:改 src/content/about/zh.md / en.md(含教育/实习/研究/奖项等结构化字段)。
- **作品集**:在 src/content/portfolio/ 新建 .md,缩略图自动生成。

详细维护流程见 docs/quick-commands.md。

---

## 部署

推送到 master 即触发 GitHub Actions(.github/workflows/deploy.yml),自动构建并部署到 GitHub Pages。

- 构建产物在 dist/(已 gitignore)
- 3D 背景脚本 public/three-bg.js 由 esbuild 打包(已 gitignore)
- 作品集缩略图 public/images/thumbs/ 由 sharp 生成(已 gitignore)

---

## 文档

- docs/knowledge-graph-en/knowledge-graph.md — 完整项目知识图谱(架构/路由/组件/数据流)
- docs/quick-commands.md — 常用命令速查(含手机端调试)
- docs/技术博客排版规范.md — 博客文章 frontmatter 与排版规范

---

## 致谢

本项目的 3D 背景场景基于 [weekly-vibe-coding](https://github.com/ChenZiHong-Gavin/weekly-vibe-coding) 项目的「专题五」内容,在此向原作者表示感谢。在原作品的基础上做了修改、大小压缩以及网页加载优化,以适配本站的三层渐进加载架构与首屏性能要求。

---

## License

个人作品,保留所有权利。
