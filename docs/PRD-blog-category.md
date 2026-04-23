# PRD: 博客分类系统 + Web CMS（v2）

> 基于 Codex 审查报告 `docs/codex-review.md` 修订，解决 7 个审查问题。

## 1. 背景与目标

当前博客系统没有分类功能，所有文章以扁平列表展示。需要：

1. **引入多级分类体系**：支持无限层级嵌套，帮助组织内容
2. **提供 Web 端编辑能力**：通过 Cloudflare Worker + GitHub App 实现安全的网页端内容管理

**目标**：构建博客 CMS，包含树状分类导航和基于 Worker 代理的 Web 编辑器。

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
- 分类层级无硬性限制（建议实际使用 ≤ 4 层）

### A.2 功能需求

#### FR-A1: 分类数据模型
- 分类采用**树状 JSON 文件**存储：`src/data/categories.json`（解决 Codex 问题 #3）
- 每个节点包含：`slug`、`label`（中英文）、`description`（中英文）、`children`（子分类数组）
- `slug` 规则：只允许 `[a-z0-9-]`，不含 `/`，全局唯一，禁止与保留路由段冲突
- 文章 frontmatter 使用 `categories` 数组表示完整路径：`['tech-learning', 'deep-learning', 'transformer']`
- **校验**：构建时通过 `src/data/categories.ts`（读取 JSON 的工具模块）校验路径合法性

```
src/data/
├── categories.json    ← 分类数据（CMS 写此文件）
└── categories.ts      ← 读取 JSON + 校验 + 工具函数（不改此文件）
```

#### FR-A2: 分类导航（博客列表页）
- 博客列表页顶部显示一级分类 Tab（全部 + 三个分类）
- 选中一级分类后，下方展开该分类的子分类树
- 子分类支持折叠/展开，每项显示文章数量
- 当前路径使用面包屑导航显示
- 空分类仍显示，标注"暂无文章"

#### FR-A3: URL 设计（解决 Codex 问题 #2）
- **文章 URL 保持稳定**：`/[lang]/blog/[slug]/`（不含分类路径）
  - 例：`/zh/blog/attention-mechanism/`
  - 理由：文章 permalink 稳定，不受分类调整影响，有利于 SEO
- **分类列表页独立路由**：`/[lang]/blog/category/[...path]/`
  - 例：`/zh/blog/category/tech-learning/`
  - 例：`/zh/blog/category/tech-learning/deep-learning/transformer/`
- 分类和文章使用不同 URL 前缀，完全消除命名冲突
- 文章页和分类页可互相链接，但 URL 命名空间彻底分离

#### FR-A4: 文章页分类显示
- 文章详情页标题上方显示分类面包屑：`技术学习 > 深度学习 > Transformer`
- 面包屑每级可点击跳转到对应分类列表页
- 分类面包屑链接格式：`/${lang}/blog/category/${cats.slice(0, i+1).join('/')}/`

#### FR-A5: 分类重定向策略（解决 Codex 问题 #4）
- 分类配置中每个节点可选配 `aliases` 数组，记录旧 slug
- 例：将 `deep-learning` 重命名为 `dl` 后，`aliases: ['deep-learning']`
- 分类列表页生成时，同时为 aliases 生成 301 重定向页面
- 文章 URL 不受影响（因为文章 URL 不含分类路径）

#### FR-A6: 可扩展性
- 分类树通过 JSON 配置文件定义
- 新增子分类只需在 JSON 中添加节点
- CMS 可在线修改 JSON（不改源码文件）
- 分类相关 UI 组件自动适配任意深度

#### FR-A7: 搜索与 RSS
- SearchBar 显示完整结果列表（含分类路径标签）
- RSS feed 链接使用稳定文章 URL：`/${lang}/blog/${slug}/`
- 搜索结果中分类标签可点击跳转到分类列表页

### A.3 非功能需求

#### NFR-A1: 国际化
- 每级分类名称支持中英文
- 面包屑、Tab、子分类导航均需翻译

#### NFR-A2: 现有内容兼容
- 现有两篇 CSDN 文章归入 `tech-learning`
- publications/talks/teaching 不动
- 旧字段 `category: z.string().optional()` 需迁移为 `categories: z.array(z.string()).optional()`

#### NFR-A3: 构建兼容
- `npm run build` 无错误
- 所有静态路径正确生成
- 分类校验失败时构建报错并给出明确提示

---

## Part B: Web CMS 编辑系统

### B.1 架构概述（解决 Codex 问题 #1）

```
用户浏览器 (React SPA)
    ↓ 访问 /admin/
    ↓ 重定向到 GitHub App 授权页
    ↓ 授权回调 → Cloudflare Worker
    ↓ Worker 换取 token → 设置 HttpOnly 会话 cookie
    ↓ 浏览器携带 cookie 调用 Worker 代理 API
Cloudflare Worker (OAuth 代理 + API 代理)
    ↓ 使用用户 token 调用 GitHub API
    ↓ 单文件操作：Contents API
    ↓ 批量操作：GraphQL createCommitOnBranch
GitHub 仓库 (Markdown + JSON 文件)
    ↓ push 到 master 触发 GitHub Actions
    ↓ 自动 build + deploy
GitHub Pages (静态站点)
```

**关键改进**：
- 浏览器**不直接持有** GitHub token，只持有 Worker 签发的 HttpOnly 会话 cookie
- Worker 作为 OAuth 回调端点和 API 代理，所有敏感操作在服务端完成
- 使用 **GitHub App**（而非 OAuth App），权限可精确到单仓库

### B.2 功能需求

#### FR-B1: 认证与权限
- 使用 **GitHub App**（非 OAuth App）进行身份验证
- 授权回调 URL 指向 Cloudflare Worker
- Worker 使用 `state` 参数防止 CSRF
- 权限校验：固定 GitHub user **ID**（非 login 名）白名单
- 非授权用户看到 403 页面
- 会话 cookie 设置 `HttpOnly`、`Secure`、`SameSite=Strict`

#### FR-B2: 文章管理（CRUD）
- **创建文章**：填写标题、分类、标签 → 生成 Markdown → 新文章默认 `draft: true`
- **保存与发布分离**：保存草稿 vs 正式发布（`draft: false`）
- **编辑文章**：读取 Markdown → 在线编辑 → 提交更新
- **删除文章**：二次确认 → 通过 Worker API 删除
- **Frontmatter 编辑**：可视化编辑标题、日期、分类、标签等
- **实时预览**：右侧渲染 Markdown 预览（经过 HTML sanitize）

#### FR-B3: 标签管理
- 查看所有标签及使用数量
- 创建/重命名/删除标签
- **批量操作**：重命名/合并/删除走单次 commit（通过 GraphQL `createCommitOnBranch`）

#### FR-B4: 分类管理
- 树状可视化管理
- 添加/重命名/删除分类节点（修改 `categories.json`，不改 TS 源码）
- 分类重命名时自动添加 `aliases` 记录旧 slug
- 批量更新受影响文章的 `categories` 字段

#### FR-B5: 图片上传
- 拖拽/选择上传到 `public/images/posts/`
- **安全约束**：限制 MIME 类型（image/png, image/jpeg, image/gif, image/webp）、大小 ≤ 5MB、文件名唯一化（加时间戳前缀）
- 自动在编辑器中插入 Markdown 图片语法
- 图片浏览和删除

#### FR-B6: 自动部署
- 每次保存通过 Worker 提交到 **master** 分支（与当前 workflow 一致）
- 触发 GitHub Actions 自动 build + deploy
- 编辑界面显示部署状态（轮询 Actions API）

### B.3 技术方案

#### B.3.1 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 认证 | **GitHub App + Cloudflare Worker** | 安全，token 不暴露给浏览器 |
| API 代理 | Cloudflare Worker | 免费额度充足，零运维 |
| 单文件操作 | GitHub REST Contents API | 简单直接 |
| **批量操作** | **GitHub GraphQL `createCommitOnBranch`** | 单次 commit 修改多文件 |
| Markdown 编辑器 | `@uiw/react-md-editor` | 轻量、实时预览 |
| HTML 安全 | `DOMPurify` | 防止 XSS |
| UI 组件 | Tailwind CSS（已有） | 风格统一 |
| 部署分支 | `master`（与 `deploy.yml` 一致） | 避免 Codex #5 中的分支错误 |

#### B.3.2 认证流程

```
1. 用户访问 /admin/ → 前端检测无会话 cookie
2. 前端生成随机 state，存入 sessionStorage
3. 重定向到 GitHub App 授权 URL（带 state + redirect_uri 指向 Worker）
4. 用户授权 → GitHub 回调到 Worker 端点 /api/auth/callback?code=xxx&state=yyy
5. Worker 验证 state → 用 code + client_secret 换取 user access token
6. Worker 调用 GitHub API 获取 user ID → 检查白名单
7. Worker 签发 HttpOnly session cookie → 302 重定向回 /admin/
8. 前端后续所有 API 请求携带 cookie → Worker 代理到 GitHub API
```

#### B.3.3 Worker API 端点

```
GET  /api/auth/login          → 发起 GitHub 授权
GET  /api/auth/callback       → OAuth 回调，换 token，设 cookie
POST /api/auth/logout         → 清除 cookie
GET  /api/user                → 获取当前用户信息
GET  /api/posts               → 列出文章（通过 Contents API）
GET  /api/posts/:path         → 读取文章内容
PUT  /api/posts/:path         → 创建/更新文章
DELETE /api/posts/:path       → 删除文章
POST /api/batch               → 批量操作（通过 GraphQL）
POST /api/images/upload       → 图片上传
GET  /api/deploy/status       → 部署状态
```

#### B.3.4 批量提交流程（解决 Codex 问题 #5）

```
1. 用户执行"重命名标签"操作
2. 前端发送 POST /api/batch { operation: "renameTag", from: "旧标签", to: "新标签" }
3. Worker：
   a. 查找所有包含旧标签的文章
   b. 构建多文件修改列表
   c. 调用 GraphQL createCommitOnBranch（一次 commit 修改所有文件）
   d. 返回结果
4. push 触发 → GitHub Actions → build → deploy（仅触发一次）
```

### B.4 非功能需求（解决 Codex 问题 #6）

#### NFR-B1: 安全性
- 会话 cookie：`HttpOnly`、`Secure`、`SameSite=Strict`、短期有效（8h）
- OAuth：`state` 参数防 CSRF
- 权限：固定 GitHub user **ID** 白名单（非 login 名）
- Markdown 预览：使用 `DOMPurify` 做 HTML sanitize
- CSP：Admin 页面设置严格 Content-Security-Policy
- 图片上传：MIME 类型白名单、大小限制、文件名唯一化、路径归一化
- 新文章默认 `draft: true`，防止误发布

#### NFR-B2: 性能
- 编辑器加载 < 3 秒
- 文件列表按需加载
- 批量操作走单次 commit

#### NFR-B3: 用户体验
- 编辑时自动保存草稿到 localStorage
- 操作反馈：loading / 成功 / 失败提示
- 响应式设计

---

## 4. 整体影响范围

| 模块 | Part A | Part B |
|------|--------|--------|
| 分类配置 | 新建 `categories.json` + `categories.ts` | CMS 只写 JSON |
| Content Schema | `categories` 数组 + 校验 | - |
| 博客路由 | 文章保持稳定路径 + 分类独立路由 | - |
| 博客列表页 | Tab + 子分类树 | - |
| 文章详情页 | 分类面包屑 | - |
| i18n | 分类翻译 | CMS UI 翻译 |
| SearchBar | 完整结果列表 + 分类标签 | - |
| RSS / 首页 | 链接格式（稳定 URL） | - |
| Admin 页面 | - | 新建 SPA |
| Worker | - | 新建 Cloudflare Worker |
| GitHub App | - | 新建 |
| Markdown 编辑器 | - | 新建 + DOMPurify |
| 图片上传 | - | 新建 + 安全约束 |
| 部署分支 | - | 对齐 `master` |

## 5. 验收标准

### Part A 验收
- [ ] 一级分类 Tab 正确显示和切换
- [ ] 子分类树可展开/折叠
- [ ] 面包屑导航正确显示完整路径
- [ ] 文章 URL 稳定：`/zh/blog/${slug}/`
- [ ] 分类页 URL 独立：`/zh/blog/category/tech-learning/`
- [ ] 分类与文章 URL 无冲突
- [ ] 分类 aliases 重定向正常
- [ ] SearchBar 显示完整结果列表含分类标签
- [ ] RSS feed 链接格式正确
- [ ] `npm run build` 无错误
- [ ] 分类校验失败时构建报错

### Part B 验收
- [ ] GitHub App + Worker 认证流程正常
- [ ] 浏览器不直接持有 GitHub token
- [ ] 非授权用户无法访问编辑功能
- [ ] 文章 CRUD 正常，新建默认 draft
- [ ] Markdown 编辑器预览经 sanitize
- [ ] 标签批量操作走单次 commit
- [ ] 分类管理修改 JSON 不改 TS 源码
- [ ] 分类重命名自动添加 aliases
- [ ] 图片上传有类型/大小限制
- [ ] 保存后自动触发构建部署（master 分支）
- [ ] 编辑界面有中英文支持

## 6. 实施优先级

| 优先级 | 内容 | 依赖 |
|--------|------|------|
| P0 | Phase 0: 架构决策（URL 规则、分类存储格式、认证方案、部署分支） | 无 |
| P1 | Part A: 一级分类 + 分类页 + 面包屑 + SearchBar 改造 | P0 |
| P2 | Part A: 多级子分类 + aliases 重定向 | P1 |
| P3 | Part A: 现有文章迁移 + 校验 | P1 |
| P4 | Part B: Worker + GitHub App 基础设施 | P0 |
| P5 | Part B: 文章 CRUD + 图片上传 | P4 |
| P6 | Part B: 标签/分类批量管理 | P4 + P5 |
| P7 | Part B: 部署状态集成 | P4 |

## 7. 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| Cloudflare Worker 免费额度（10万次/天） | 日常编辑够用 | 监控用量，超出再升级 |
| GitHub API 速率限制 | 批量操作受限 | 使用 GraphQL 减少请求次数 |
| 分类树深层嵌套 | UI 复杂度增加 | 建议实际使用 ≤ 4 层 |
| 分类 aliases 累积 | 重定向页面增多 | 定期清理不再被引用的 aliases |
| Worker 部署 | 需额外维护 | Worker 代码极简（~200行），与项目同仓库管理 |
