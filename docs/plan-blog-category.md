# 实施计划: 博客多级分类系统 + Web CMS（v2）

> 基于 Codex 审查报告 `docs/codex-review.md` 修订，对应 PRD v2。

## 概述

分三个阶段实施：
- **Phase 0**：架构决策（必须先完成）
- **Phase A**：多级分类系统（P1-P3）
- **Phase B**：Web CMS 编辑系统（P4-P7）

---

## Phase 0: 架构决策（P0）

> 在写任何代码前必须确认的四件事（Codex 建议 #7）。

### 决策清单

| 决策项 | 确认方案 |
|--------|----------|
| URL 规则 | 文章稳定 `/${lang}/blog/${slug}/`；分类独立 `/${lang}/blog/category/[...path]/` |
| 分类存储 | `categories.json`（数据） + `categories.ts`（读取/校验工具） |
| 认证方案 | Cloudflare Worker + GitHub App |
| 部署分支 | `master`（与 `deploy.yml` 一致） |

### Step 0.1: 创建 GitHub App

在 GitHub Settings → Developer settings → GitHub Apps 创建：
- 名称：`YHL Blog CMS`
- 回调 URL：`https://admin.alidadei.workers.dev/api/auth/callback`（Worker 部署后填写）
- 权限：Contents (Read/Write)、Actions (Read)
- 安装目标：仅 `Alidadei/YHL.github.io` 仓库
- 记录 App ID、Client ID，生成 Private Key

### Step 0.2: 创建 Cloudflare Worker 项目

在项目仓库中新建 `worker/` 目录：
- 使用 Wrangler CLI 初始化
- 实现 OAuth callback + API 代理 + 会话管理
- 部署到 `admin.alidadei.workers.dev`

---

## Phase A: 多级分类系统

### Step 1: 创建分类数据与工具

**新建**: `src/data/categories.json`

```json
[
  {
    "slug": "tech-learning",
    "label": { "zh": "技术学习", "en": "Tech Learning" },
    "description": { "zh": "论文阅读、技术调研、知识点总结等", "en": "Paper reading, tech research, knowledge summaries" },
    "aliases": [],
    "children": []
  },
  {
    "slug": "personal-practice",
    "label": { "zh": "个人实践", "en": "Personal Practice" },
    "description": { "zh": "个人动手实践项目记录", "en": "Hands-on project records" },
    "aliases": [],
    "children": []
  },
  {
    "slug": "personal-views",
    "label": { "zh": "个人看法", "en": "Personal Views" },
    "description": { "zh": "基于调研实践的领域观点", "en": "Domain perspectives based on research & practice" },
    "aliases": [],
    "children": []
  }
]
```

**新建**: `src/data/categories.ts`

工具模块（只读，不改）：
```typescript
import categoryData from './categories.json';

export type CategoryNode = typeof categoryData[number];

export function getTopLevelCategories(): CategoryNode[] { ... }
export function findCategoryByPath(path: string[]): CategoryNode | null { ... }
export function getCategoryLabel(path: string[], lang: 'zh' | 'en'): string { ... }
export function flattenCategoryPaths(): string[][] { ... }
export function validateSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length > 0;
}
export function validateUniqueSlugs(tree: CategoryNode[], seen = new Set<string>()): string[] {
  // 返回冲突的 slug 列表
}
```

### Step 2: 更新 Content Schema

**修改**: `src/content.config.ts`

```typescript
// 新增 categories 字段（保留旧 category 字段做兼容）
categories: z.array(z.string()).optional(),
  // 完整分类路径，如 ['tech-learning', 'deep-learning']
  // 构建时通过 categories.ts 校验路径是否存在
```

> 旧 `category: z.string().optional()` 暂时保留，迁移完成后移除。

### Step 3: 更新文章路由（保持稳定 URL）

**修改**: `src/pages/[lang]/blog/[...slug].astro`

保持现有路由结构不变（文章 URL 不含分类），只需在 `PostLayout` 中传入分类信息：

```typescript
const { post } = Astro.props;
const { Content } = await render(post);
const cats = post.data.categories || post.data.category ? [post.data.category || 'tech-learning'] : [];
---

<PostLayout title={post.data.title} ... categories={cats} lang={lang}>
  <Content />
</PostLayout>
```

### Step 4: 创建分类列表页路由

**新建**: `src/pages/[lang]/blog/category/[...path].astro`

独立的分类浏览页面：

```typescript
export async function getStaticPaths() {
  const allPaths = flattenCategoryPaths();
  const langs: Lang[] = ['zh', 'en'];

  return langs.flatMap(lang =>
    allPaths.map(path => ({
      params: { lang, path: path.join('/') },
      props: { categoryPath: path },
    }))
  );
}

// 同时为 aliases 生成重定向页面
```

页面内容：
- 面包屑导航
- 该分类及子分类下的文章列表
- 子分类树侧栏

### Step 5: 更新博客列表页

**修改**: `src/pages/[lang]/blog/index.astro`

- 添加一级分类 Tab（全部 + 三个分类）
- Tab 切换通过前端 JavaScript 筛选（纯客户端行为）
- 文章卡片中显示分类标签
- 分类标签链接到 `/[lang]/blog/category/${cats.join('/')}/`
- 序列化数据中包含 `categories` 字段

### Step 6: 更新 i18n

**修改**: `src/i18n/ui.ts`

```typescript
// zh 新增
'blog.category.all': '全部',
'blog.category.tech-learning': '技术学习',
'blog.category.personal-practice': '个人实践',
'blog.category.personal-views': '个人看法',
'blog.noPosts': '该分类暂无文章',
'blog.subcategories': '子分类',
'blog.viewCategory': '查看分类',

// en 新增
'blog.category.all': 'All',
'blog.category.tech-learning': 'Tech Learning',
'blog.category.personal-practice': 'Personal Practice',
'blog.category.personal-views': 'Personal Views',
'blog.noPosts': 'No posts in this category',
'blog.subcategories': 'Subcategories',
'blog.viewCategory': 'View category',
```

> 子分类名称从 `categories.json` 读取，不逐一加到 ui.ts。

### Step 7: 更新 PostLayout

**修改**: `src/layouts/PostLayout.astro`

- 添加 `categories` 和 `lang` Props
- 标题上方显示分类面包屑（从 categories.json 读取标签名）
- 每级面包屑链接到对应分类列表页
- 修复日期硬编码 `'zh-CN'` → 根据 lang 动态选择

### Step 8: 新建组件

**新建**: `src/components/blog/Breadcrumb.tsx`

通用面包屑 React 组件：
- 输入：分类路径数组 + 语言
- 输出：`技术学习 > 深度学习 > Transformer`
- 每级可点击，链接到 `/${lang}/blog/category/${path}/`

**新建**: `src/components/blog/CategoryTree.tsx`

分类树组件：
- 从 categories.json 读取树结构
- 支持展开/折叠
- 显示每个节点的文章数量
- 当前选中节点高亮

### Step 9: 更新 SearchBar

**修改**: `src/components/blog/SearchBar.tsx`

Codex 指出当前 SearchBar 只有搜索框和计数，需补完整结果 UI：
- 搜索结果展示为文章列表（标题 + 分类标签 + 日期）
- 分类标签可点击跳转到分类页
- 序列化数据中包含 `categories` 字段

### Step 10: 更新首页 + RSS

**修改**: `src/pages/[lang]/index.astro`
- 最近文章卡片中添加分类标签
- 文章链接格式不变（稳定 URL）

**修改**: `src/pages/rss.xml.ts`
- 文章链接使用稳定 URL：`/${post.data.lang}/blog/${slug}/`
- item 中添加 category 元数据

### Step 11: 标记现有文章

**修改**:
- `src/content/posts/zh/data-structure.md` → 添加 `categories: ['tech-learning']`
- `src/content/posts/zh/microcomputer.md` → 添加 `categories: ['tech-learning']`

### Step 12: 添加示例子分类（验证多级功能）

在 `categories.json` 的 `tech-learning` 下添加示例子分类：

```json
{
  "slug": "deep-learning",
  "label": { "zh": "深度学习", "en": "Deep Learning" },
  "description": { "zh": "神经网络、深度学习相关", "en": "Neural networks & deep learning" },
  "aliases": [],
  "children": [
    {
      "slug": "transformer",
      "label": { "zh": "Transformer", "en": "Transformer" },
      "description": { "zh": "Transformer 架构相关", "en": "Transformer architecture" },
      "aliases": [],
      "children": []
    }
  ]
}
```

---

## Phase B: Web CMS 编辑系统

### Step 13: Cloudflare Worker 基础

**新建目录**: `worker/`

```
worker/
├── wrangler.toml         ← Worker 配置
├── src/
│   ├── index.ts          ← 主入口 + 路由
│   ├── auth.ts           ← GitHub App OAuth 逻辑
│   ├── github-api.ts     ← GitHub API 代理
│   ├── batch.ts          ← GraphQL 批量操作
│   ├── session.ts        ← 会话管理（KV 存储）
│   └── utils.ts          ← 工具函数
└── package.json
```

核心功能：
- OAuth callback 端点（code → token → 验证 user ID → 设置 cookie）
- API 代理（浏览器 → Worker → GitHub API）
- 会话管理（使用 Cloudflare KV 存储）
- CORS 和安全头设置

### Step 14: Admin 页面路由

**新建**: `src/pages/[lang]/admin/index.astro`

- 检查会话 cookie（通过 Worker API `/api/user`）
- 未登录 → 显示 GitHub 登录按钮（链接到 Worker 授权端点）
- 已登录 + 已授权 → 加载 Admin React App
- 已登录 + 未授权 → 显示 403

### Step 15: Admin React App

**新建目录**: `src/components/admin/`

```
src/components/admin/
├── AdminApp.tsx          ← 主框架（侧边栏 + 路由）
├── AuthGuard.tsx         ← 权限守卫
├── LoginScreen.tsx       ← 登录页
├── PostList.tsx          ← 文章列表
├── PostEditor.tsx        ← 文章编辑器（Markdown + frontmatter）
├── TagManager.tsx        ← 标签管理
├── CategoryManager.tsx   ← 分类管理
├── ImageManager.tsx      ← 图片管理
└── DeployStatus.tsx      ← 部署状态
```

### Step 16: 文章编辑器

**新建**: `src/components/admin/PostEditor.tsx`

安装依赖：`npm install @uiw/react-md-editor dompurify @types/dompurify`

功能：
- 左右分栏：Markdown 编辑 + 实时预览
- 预览使用 DOMPurify sanitize（防 XSS）
- Frontmatter 可视化编辑面板
- 分类选择器（树状多选，从 categories.json 读取）
- 标签选择器（多选 + 创建新标签）
- 自动保存草稿到 localStorage
- 保存与发布分离（`draft: true/false`）
- 通过 Worker API 提交到 GitHub

### Step 17: 文章 CRUD

**修改**: `src/components/admin/PostList.tsx`

- 列出所有文章（标题、分类、日期、标签、draft 状态）
- 按分类筛选
- 搜索
- 新建 → 打开编辑器（默认 draft: true）
- 编辑 → 读取 → 打开编辑器
- 删除 → 二次确认 → Worker API

### Step 18: 标签管理

**新建**: `src/components/admin/TagManager.tsx`

- 从所有文章提取标签列表及使用次数
- 创建/重命名/删除标签
- **批量操作**：通过 Worker `/api/batch` 端点，使用 GraphQL `createCommitOnBranch` 单次 commit

### Step 19: 分类管理

**新建**: `src/components/admin/CategoryManager.tsx`

- 树状展示分类结构
- 添加子分类（修改 categories.json）
- 重命名分类（自动添加 aliases + 批量更新文章 categories）
- 删除分类（选择处理方式：上移到父级 / 删除）
- 所有修改走 Worker API，不改 TS 源码

### Step 20: 图片上传

**新建**: `src/components/admin/ImageManager.tsx`

- 拖拽/选择上传
- 安全约束（MIME 白名单、≤ 5MB、文件名唯一化）
- 图片浏览（缩略图网格）
- 点击复制 Markdown 插入语法
- 删除图片

### Step 21: 部署状态集成

**新建**: `src/components/admin/DeployStatus.tsx`

- 提交后轮询 Worker `/api/deploy/status`
- 显示：构建中 / 部署成功 / 部署失败
- 失败时提供查看日志链接

### Step 22: 部署分支对齐

**检查**: `.github/workflows/deploy.yml`

当前已监听 `master` 分支，无需修改。确认 CMS 提交目标分支为 `master`。

---

## 文件变更总清单

### Phase A（多级分类）

| 文件 | 操作 | Step |
|------|------|------|
| `src/data/categories.json` | 新建 | 1 |
| `src/data/categories.ts` | 新建 | 1 |
| `src/content.config.ts` | 修改 | 2 |
| `src/pages/[lang]/blog/[...slug].astro` | 修改 | 3 |
| `src/pages/[lang]/blog/category/[...path].astro` | 新建 | 4 |
| `src/pages/[lang]/blog/index.astro` | 修改 | 5 |
| `src/i18n/ui.ts` | 修改 | 6 |
| `src/layouts/PostLayout.astro` | 修改 | 7 |
| `src/components/blog/Breadcrumb.tsx` | 新建 | 8 |
| `src/components/blog/CategoryTree.tsx` | 新建 | 8 |
| `src/components/blog/SearchBar.tsx` | 修改 | 9 |
| `src/pages/[lang]/index.astro` | 修改 | 10 |
| `src/pages/rss.xml.ts` | 修改 | 10 |
| `src/content/posts/zh/data-structure.md` | 修改 | 11 |
| `src/content/posts/zh/microcomputer.md` | 修改 | 11 |

### Phase B（Web CMS）

| 文件/目录 | 操作 | Step |
|-----------|------|------|
| `worker/` 整个目录 | 新建 | 13 |
| `src/pages/[lang]/admin/index.astro` | 新建 | 14 |
| `src/components/admin/*.tsx` (8个文件) | 新建 | 15-21 |
| `.github/workflows/deploy.yml` | 检查 | 22 |

共 **~28 个文件**：Phase A 15 个，Phase B 13+ 个。

---

## 依赖安装

```bash
# Phase A 无新依赖

# Phase B
npm install @uiw/react-md-editor dompurify @types/dompurify
```

---

## 验证步骤

### Phase A 验证

1. `npm run dev` 启动
2. `/zh/blog/` — 确认 Tab 显示和切换
3. `/zh/blog/category/tech-learning/` — 确认分类列表页独立路由
4. 文章 URL 保持稳定：`/zh/blog/data-structure/`
5. 文章页面包屑正确且可点击到分类页
6. 子分类树展开/折叠正常
7. SearchBar 显示完整结果列表
8. RSS 链接格式正确
9. `npm run build` 无错误
10. 修改 categories.json 中的无效 slug → 构建报错

### Phase B 验证

1. 访问 `/zh/admin/` → 跳转 GitHub 授权
2. 浏览器 DevTools → 无 GitHub token 泄露到 JS
3. 非 owner 登录 → 403
4. 创建文章 → 默认 draft: true
5. 发布文章 → 确认仓库有新 commit
6. Markdown 预览 → 检查 XSS 被 sanitize
7. 重命名标签 → 确认单次 commit 修改多文件
8. 添加子分类 → 确认只改 JSON 不改 TS
9. 上传超大/非法文件 → 被拒绝
10. 提交后确认 GitHub Actions 触发并部署成功

---

## Codex 审查问题对照

| Codex 问题 | 本版解决方案 | 对应 Step |
|------------|-------------|-----------|
| #1 认证架构不成立 | 改用 Worker + GitHub App | 0.1, 0.2, 13 |
| #2 URL 命名空间冲突 | 文章稳定 URL + 分类独立 `/category/` 前缀 | 3, 4 |
| #3 CMS 改 TS 源码 | 改用 categories.json，CMS 只写 JSON | 1 |
| #4 URL 强耦合无 redirect | 文章 URL 不含分类 + aliases 机制 | FR-A5 |
| #5 批量 API 错误 | 改用 GraphQL createCommitOnBranch | 13, 18 |
| #6 安全设计不足 | 补齐 state/nonce、ID 白名单、sanitize、CSP、上传约束 | FR-B1, B.4 |
| #7 计划遗漏 | 统一 URL 方案、SearchBar 完整改造 | 5, 9 |

---

## 扩展指南

### 添加新的一级分类

1. 在 `categories.json` 数组中添加新节点
2. 在 `ui.ts` 中添加 Tab 翻译 key
3. 新文章使用新分类 slug

### 添加子分类

1. 在 `categories.json` 对应节点的 `children` 中添加
2. 无需修改 schema 或路由代码

### 通过 CMS 管理

Phase B 完成后，分类/标签管理均通过 Web 界面完成。CMS 只修改 JSON 数据文件和 Markdown 文章，不触碰 TS 源码。
