# PRD: 博客分类系统 + Web CMS

## 1. 背景与目标

当前博客系统没有分类功能，所有文章以扁平列表展示。随着博客内容增长，需要：

1. **引入多级分类体系**：支持无限层级嵌套，帮助读者和博主组织内容
2. **提供 Web 端编辑能力**：通过 GitHub API 实现网页端文章/标签/分类管理，无需本地操作

**目标**：构建一个完整的博客内容管理系统，包含树状分类导航和基于 GitHub API 的 Web 编辑器。

---

## Part A: 多级分类系统

### A.1 分类结构定义

**一级分类（固定三大类）**：

| 分类 Slug | 中文名 | 英文名 | 说明 |
|-----------|--------|--------|------|
| `tech-learning` | 技术学习 | Tech Learning | 论文阅读、技术调研、知识点总结等 |
| `personal-practice` | 个人实践 | Personal Practice | 个人动手实践项目记录 |
| `personal-views` | 个人看法 | Personal Views | 基于调研实践的领域观点 |

**子分类（不限层级）**：
- 在一级分类下可自由创建二级、三级子分类
- 例：`技术学习 > 深度学习 > Transformer`（三级）
- 例：`个人实践 > 嵌入式开发`（二级）
- 分类层级无硬性限制

### A.2 功能需求

#### FR-A1: 分类数据模型
- 分类采用**树状结构**存储，定义在 `src/data/categories.ts`
- 每个节点包含：`slug`、`label`（中英文）、`description`（中英文）、`children`（子分类数组）
- 文章的 frontmatter 使用 `categories` 数组字段表示完整路径：`['tech-learning', 'deep-learning', 'transformer']`

#### FR-A2: 分类导航（博客列表页）
- 博客列表页顶部显示一级分类 Tab（全部 + 三个分类）
- 选中一级分类后，下方展开该分类的子分类树
- 子分类支持折叠/展开
- 当前路径使用面包屑导航显示
- 空分类仍显示，标注"暂无文章"

#### FR-A3: 分类融入 URL
- 文章 URL 包含完整分类路径：`/[lang]/blog/[cat1]/[cat2]/[cat3]/[slug]/`
- 例：`/zh/blog/tech-learning/deep-learning/transformer/attention-mechanism/`
- 分类列表页 URL：`/[lang]/blog/[cat1]/[cat2]/`
- 无 `categories` 字段的旧文章默认归入 `tech-learning`

#### FR-A4: 文章页分类显示
- 文章详情页显示面包屑导航：`技术学习 > 深度学习 > Transformer > 注意力机制`
- 面包屑每级可点击跳转到对应分类列表

#### FR-A5: 可扩展性
- 分类树通过配置文件定义
- 新增子分类只需在配置中添加节点 + 更新 schema
- 分类相关 UI 组件自动适配任意深度

#### FR-A6: 搜索与 RSS
- SearchBar 搜索结果中显示文章分类路径
- RSS feed 链接使用新 URL 格式

### A.3 非功能需求

#### NFR-A1: 国际化
- 每级分类名称支持中英文
- 面包屑、Tab、子分类导航均需翻译

#### NFR-A2: 现有内容兼容
- 现有两篇 CSDN 文章归入 `tech-learning`
- publications/talks/teaching 不动

#### NFR-A3: 构建兼容
- `npm run build` 无错误
- 所有静态路径正确生成（含多级分类路径）

---

## Part B: Web CMS 编辑系统

### B.1 架构概述

```
用户浏览器 (React SPA)
    ↓ GitHub OAuth 登录
    ↓ 获取 GitHub Token
    ↓ 调用 GitHub REST API (Contents API)
GitHub 仓库 (Markdown 文件)
    ↓ push 触发 GitHub Actions
    ↓ 自动 build + deploy
GitHub Pages (静态站点)
```

### B.2 功能需求

#### FR-B1: 认证与权限
- 使用 GitHub OAuth App 进行身份验证
- 仅仓库 owner（Alidadei）可进入编辑模式
- 访问 `/[lang]/admin/` 时检查 GitHub 身份
- 非授权用户看到 403 页面

#### FR-B2: 文章管理（CRUD）
- **创建文章**：填写标题、分类、标签 → 自动生成 Markdown 文件 → 提交到仓库
- **编辑文章**：从仓库读取 Markdown → 在线编辑（Markdown 编辑器）→ 提交更新
- **删除文章**：确认后从仓库删除文件 → 提交
- **Frontmatter 编辑**：可视化编辑标题、日期、分类、标签、语言等字段
- **实时预览**：编辑时右侧实时渲染 Markdown 预览

#### FR-B3: 标签管理
- **查看所有标签**：列表展示所有在用标签及其文章数量
- **创建标签**：输入新标签名
- **重命名标签**：批量更新所有使用该标签的文章
- **删除标签**：从所有文章中移除该标签
- **合并标签**：将多个标签合并为一个

#### FR-B4: 分类管理
- **树状可视化管理**：展示当前分类树结构
- **添加分类节点**：选择父级，输入 slug + 中英文名
- **重命名分类**：修改分类的 slug 或名称
- **删除分类**：删除分类节点，子分类和文章需选择处理方式（上移到父级 / 同时删除）
- **排序**：调整同级分类的显示顺序

#### FR-B5: 图片上传
- **拖拽/选择上传**：上传图片到 `public/images/posts/` 目录
- **自动插入 Markdown**：上传完成后自动在编辑器中插入 `![](path)` 语法
- **图片浏览**：查看已上传图片，可选择插入文章
- **图片删除**：删除不需要的图片

#### FR-B6: 自动部署
- 每次保存操作通过 GitHub API 提交 commit
- 触发已有的 GitHub Actions 工作流自动 build + deploy
- 编辑界面显示部署状态

### B.3 技术方案

#### B.3.1 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 编辑器框架 | React SPA（Astro 的 React island） | 与现有项目一致 |
| Markdown 编辑器 | `@uiw/react-md-editor` 或 `react-markdown-editor-lite` | 轻量、支持实时预览 |
| 认证 | GitHub OAuth App (PKCE flow) | 无需后端，纯前端 |
| API | GitHub REST API v3 (Contents API) | 读写仓库文件 |
| 部署触发 | GitHub Actions (已有 workflow) | push 自动触发 |
| UI 组件 | Tailwind CSS（已有） | 风格统一 |

#### B.3.2 OAuth 流程

```
1. 用户访问 /admin/ → 检测未登录
2. 重定向到 GitHub OAuth 授权页
3. 用户授权 → GitHub 回调携带 code
4. 前端用 code 换取 access_token（需 CORS 代理或 GitHub Device Flow）
5. 调用 GitHub API 获取用户信息 → 验证是否为仓库 owner
6. 存储 token 到 sessionStorage（关闭浏览器即失效）
```

> **注意**：纯前端 GitHub OAuth 存在 CORS 限制。备选方案：
> - 使用 GitHub Device Flow（适合 CLI/桌面场景）
> - 使用 Cloudflare Worker 作为 OAuth 代理（免费）
> - 使用 GitHub Apps 替代 OAuth App

#### B.3.3 文件操作流程（以创建文章为例）

```
1. 用户在 CMS 填写标题、分类、标签
2. CMS 生成 Markdown 文件内容（含 frontmatter）
3. 调用 GitHub Contents API: PUT /repos/{owner}/{repo}/contents/{path}
   - path: src/content/posts/zh/{slug}.md
   - message: "cms: create post {title}"
   - content: base64 编码的文件内容
4. GitHub 创建 commit → 触发 GitHub Actions → build → deploy
```

### B.4 非功能需求

#### NFR-B1: 安全性
- Token 仅存储在 sessionStorage，不写入 localStorage
- 所有 API 请求通过 HTTPS
- 敏感操作（删除等）需二次确认

#### NFR-B2: 性能
- 编辑器加载 < 3 秒
- 文件列表按需加载（不一次加载所有文章内容）

#### NFR-B3: 用户体验
- 编辑时自动保存草稿到 localStorage（防止丢失）
- 操作反馈：loading 状态、成功/失败提示
- 响应式设计（支持移动端基本操作）

---

## 4. 整体影响范围

| 模块 | Part A 影响 | Part B 影响 |
|------|-------------|-------------|
| 分类配置 | 新建 categories.ts | CMS 可动态修改 |
| Content Schema | categories 字段改为数组 | - |
| 博客路由 | 多级路径 `[...path]` | - |
| 博客列表页 | Tab + 子分类树 | - |
| 文章详情页 | 面包屑导航 | - |
| i18n | 分类翻译 | CMS UI 翻译 |
| RSS / SearchBar | URL 格式更新 | - |
| Admin 页面 | - | 新建 SPA |
| GitHub OAuth | - | 新建 |
| Markdown 编辑器 | - | 新建 |
| 图片上传 | - | 新建 |
| 首页链接 | URL 格式更新 | - |

## 5. 验收标准

### Part A 验收
- [ ] 一级分类 Tab 正确显示和切换
- [ ] 子分类树可展开/折叠
- [ ] 面包屑导航正确显示完整路径
- [ ] 文章 URL 包含完整分类路径
- [ ] 任意层级深度的分类均可正确路由
- [ ] `npm run build` 无错误

### Part B 验收
- [ ] GitHub OAuth 登录流程正常
- [ ] 非授权用户无法访问编辑功能
- [ ] 可创建/编辑/删除文章
- [ ] Markdown 编辑器实时预览正常
- [ ] 标签可创建/重命名/合并/删除
- [ ] 分类树可添加/重命名/删除节点
- [ ] 图片可上传并插入文章
- [ ] 保存后自动触发构建部署
- [ ] 编辑界面有中英文支持

## 6. 实施优先级

| 优先级 | 内容 | 依赖 |
|--------|------|------|
| P0 | 一级分类系统（Tab + URL + 面包屑） | 无 |
| P1 | 多级子分类（树状导航 + 深层路由） | P0 |
| P2 | Web CMS - 文章 CRUD + 图片上传 | P0（需分类系统完成） |
| P3 | Web CMS - 标签管理 | P2 |
| P4 | Web CMS - 分类管理 | P1 + P2 |

## 7. 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| GitHub API 速率限制（5000次/小时） | 编辑操作可能受限 | 操作合并、批量 API 使用 |
| 纯前端 OAuth CORS 限制 | 无法完成 Token 交换 | 使用 Cloudflare Worker 代理或 Device Flow |
| 分类树深层路由性能 | 构建时间增加 | 限制实际使用深度（建议 ≤ 4 层） |
| 并发编辑冲突 | 两人同时编辑同一文章 | 基于 SHA 检测冲突，提示用户 |
