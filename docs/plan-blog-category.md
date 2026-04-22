# 实施计划: 博客多级分类系统 + Web CMS

## 概述

本计划基于 `docs/PRD-blog-category.md`，分为两个 Part：
- **Part A**：多级分类系统（P0/P1 优先级）
- **Part B**：Web CMS 编辑系统（P2/P3/P4 优先级）

建议按优先级分阶段实施。

---

# Part A: 多级分类系统

## Phase A-1: 一级分类基础（P0）

### Step 1: 创建树状分类配置

**新建**: `src/data/categories.ts`

采用树状结构定义分类，支持无限嵌套：

```typescript
export interface CategoryNode {
  slug: string;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  children?: CategoryNode[];
}

export const categoryTree: CategoryNode[] = [
  {
    slug: 'tech-learning',
    label: { zh: '技术学习', en: 'Tech Learning' },
    description: { zh: '论文阅读、技术调研、知识点总结等', en: 'Paper reading, tech research, knowledge summaries' },
    children: [
      // 未来子分类在此添加
    ],
  },
  {
    slug: 'personal-practice',
    label: { zh: '个人实践', en: 'Personal Practice' },
    description: { zh: '个人动手实践项目记录', en: 'Hands-on project records' },
    children: [],
  },
  {
    slug: 'personal-views',
    label: { zh: '个人看法', en: 'Personal Views' },
    description: { zh: '基于调研实践的领域观点', en: 'Domain perspectives based on research & practice' },
    children: [],
  },
];

// 工具函数
export function getTopLevelCategories(): CategoryNode[] { ... }
export function findCategoryByPath(path: string[]): CategoryNode | null { ... }
export function getCategoryLabel(path: string[], lang: 'zh' | 'en'): string { ... }
export function flattenCategoryPaths(): string[][] { ... }
```

### Step 2: 更新 Content Schema

**修改**: `src/content.config.ts`

将 `category` 改为 `categories` 数组，表示从根到叶的完整路径：

```typescript
// 修改前
category: z.string().optional(),

// 修改后
categories: z.array(z.string()).optional(),
  // 完整分类路径，如 ['tech-learning', 'deep-learning', 'transformer']
  // 旧文章不设此字段则默认为 ['tech-learning']
```

> 使用 `z.array(z.string())` 而非固定 enum，以支持无限层级扩展。
> 分类合法性在构建时通过 `categories.ts` 的工具函数校验。

### Step 3: 重构文章路由

**删除**: `src/pages/[lang]/blog/[...slug].astro`

**新建**: `src/pages/[lang]/blog/[...path].astro`

使用 catch-all 路由匹配任意深度的分类路径：

```typescript
export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((post) => {
    const parts = post.id.split('/');
    const lang = parts[0] as Lang;
    const slug = parts.slice(1).join('/');
    const cats = post.data.categories || ['tech-learning'];
    // path = 分类路径 + slug，如 ['tech-learning', 'deep-learning', 'slug']
    const path = [...cats, slug];
    return {
      params: { lang, path: path.join('/') },
      props: { post },
    };
  });
}
```

URL 示例：
- `/zh/blog/tech-learning/data-structure/`（一级分类）
- `/zh/blog/tech-learning/deep-learning/attention-mechanism/`（二级分类）

### Step 4: 添加分类列表页路由

**新建**: `src/pages/[lang]/blog/[...category]/index.astro`（或在 index.astro 中通过 query param 处理）

为每个分类路径生成独立的列表页：

```typescript
export async function getStaticPaths() {
  // 获取所有分类路径（从 categoryTree 扁平化）
  const allPaths = flattenCategoryPaths();
  return allPaths.flatMap(path => [
    { params: { lang: 'zh', category: path.join('/') } },
    { params: { lang: 'en', category: path.join('/') } },
  ]);
}
```

> **备选方案**：不生成分类列表页，而是在博客 index 页面通过前端 Tab + 子分类树实现筛选，URL 使用 hash 或 query param。这样更简单但 SEO 友好度较低。

### Step 5: 更新博客列表页

**修改**: `src/pages/[lang]/blog/index.astro`

- 顶部显示一级分类 Tab（全部 + 三个分类）
- 选中一级分类后，下方显示该分类的子分类树（可折叠）
- 子分类项显示文章数量
- 文章链接格式：`/${lang}/blog/${cats.join('/')}/${slug}/`
- 序列化数据中包含 `categories` 字段

### Step 6: 更新 i18n

**修改**: `src/i18n/ui.ts`

```typescript
// zh
'blog.category.all': '全部',
'blog.category.tech-learning': '技术学习',
'blog.category.personal-practice': '个人实践',
'blog.category.personal-views': '个人看法',
'blog.noPosts': '该分类暂无文章',
'blog.breadcrumb': '面包屑',
'blog.subcategories': '子分类',

// en
'blog.category.all': 'All',
'blog.category.tech-learning': 'Tech Learning',
'blog.category.personal-practice': 'Personal Practice',
'blog.category.personal-views': 'Personal Views',
'blog.noPosts': 'No posts in this category',
'blog.breadcrumb': 'Breadcrumb',
'blog.subcategories': 'Subcategories',
```

> 子分类的翻译直接从 `categoryTree` 中读取，不需要逐个加到 ui.ts。

### Step 7: 更新 PostLayout

**修改**: `src/layouts/PostLayout.astro`

- 添加 `categories` 和 `lang` props
- 标题上方显示面包屑导航（每级可点击）
- 修复日期硬编码 `'zh-CN'` 问题

### Step 8: 更新首页 + RSS + SearchBar

**修改**:
- `src/pages/[lang]/index.astro` — 链接格式更新
- `src/pages/rss.xml.ts` — 链接格式更新
- `src/components/blog/SearchBar.tsx` — 显示分类路径

### Step 9: 标记现有文章

**修改**:
- `src/content/posts/zh/data-structure.md` → 添加 `categories: ['tech-learning']`
- `src/content/posts/zh/microcomputer.md` → 添加 `categories: ['tech-learning']`

---

## Phase A-2: 多级子分类（P1）

### Step 10: 子分类树组件

**新建**: `src/components/blog/CategoryTree.tsx`

React 组件，渲染分类树：
- 支持展开/折叠
- 显示每个节点的文章数量
- 当前选中节点高亮
- 点击节点筛选文章列表

### Step 11: 面包屑组件

**新建**: `src/components/blog/Breadcrumb.tsx`

通用面包屑组件：
- 输入分类路径数组 → 渲染 `技术学习 > 深度学习 > Transformer`
- 每级可点击跳转
- 支持中英文

### Step 12: 添加示例子分类

在 `categories.ts` 中添加示例子分类用于验证：

```typescript
{
  slug: 'tech-learning',
  children: [
    {
      slug: 'deep-learning',
      label: { zh: '深度学习', en: 'Deep Learning' },
      description: { zh: '神经网络、深度学习相关', en: 'Neural networks & deep learning' },
      children: [
        {
          slug: 'transformer',
          label: { zh: 'Transformer', en: 'Transformer' },
          description: { zh: 'Transformer 架构相关', en: 'Transformer architecture' },
        },
      ],
    },
    {
      slug: 'embedded',
      label: { zh: '嵌入式开发', en: 'Embedded Development' },
      description: { zh: '单片机、嵌入式系统', en: 'MCU & embedded systems' },
    },
  ],
}
```

---

# Part B: Web CMS 编辑系统

## Phase B-1: 基础架构（P2）

### Step 13: GitHub OAuth 配置

**新建**: `src/lib/github/auth.ts`

- GitHub OAuth App 配置（Client ID、回调 URL）
- Device Flow 或 Web Application Flow 实现
- Token 存储管理（sessionStorage）
- 身份验证（检查是否为仓库 owner）

```typescript
export const GITHUB_CONFIG = {
  clientId: import.meta.env.GITHUB_CLIENT_ID,
  repo: 'Alidadei/YHL.github.io',
  owner: 'Alidadei',
};

export async function authenticate(): Promise<string> { ... }
export async function isAuthorized(token: string): Promise<boolean> { ... }
export function getStoredToken(): string | null { ... }
```

### Step 14: GitHub API 封装

**新建**: `src/lib/github/api.ts`

封装 GitHub Contents API 操作：

```typescript
export class GitHubCMS {
  constructor(private token: string) {}

  // 文件操作
  async readFile(path: string): Promise<{ content: string; sha: string }> { ... }
  async createFile(path: string, content: string, message: string): Promise<void> { ... }
  async updateFile(path: string, content: string, sha: string, message: string): Promise<void> { ... }
  async deleteFile(path: string, sha: string, message: string): Promise<void> { ... }
  async listFiles(dir: string): Promise<GitHubFile[]> { ... }

  // 图片上传
  async uploadImage(file: File, path: string): Promise<string> { ... }

  // 部署状态
  async getLatestDeploymentStatus(): Promise<string> { ... }
}
```

### Step 15: Admin 页面路由

**新建**: `src/pages/[lang]/admin/index.astro`

Admin SPA 入口页面：
- 检查认证状态
- 未登录 → 显示 GitHub 登录按钮
- 已登录 + 已授权 → 加载 Admin React App
- 已登录 + 未授权 → 显示 403

### Step 16: Admin React App 骨架

**新建**: `src/components/admin/AdminApp.tsx`

Admin 主组件，包含：
- 侧边栏导航：文章管理 / 标签管理 / 分类管理 / 图片管理
- 主内容区域
- 顶部状态栏：用户信息 / 部署状态 / 退出登录

**新建目录**: `src/components/admin/`
- `AdminApp.tsx` — 主框架
- `PostList.tsx` — 文章列表
- `PostEditor.tsx` — 文章编辑器
- `TagManager.tsx` — 标签管理
- `CategoryManager.tsx` — 分类管理
- `ImageManager.tsx` — 图片管理
- `LoginScreen.tsx` — 登录页
- `AuthGuard.tsx` — 权限守卫

### Step 17: Markdown 编辑器集成

**新建**: `src/components/admin/PostEditor.tsx`

安装依赖：`@uiw/react-md-editor`

功能：
- 左右分栏：左侧 Markdown 编辑，右侧实时预览
- Frontmatter 可视化编辑面板
- 分类选择器（树状选择）
- 标签选择器（多选 + 创建新标签）
- 自动保存草稿到 localStorage
- 提交保存到 GitHub

### Step 18: 文章 CRUD

**新建/修改**: `src/components/admin/PostList.tsx`

功能：
- 列出所有文章（标题、分类、日期、标签）
- 按分类筛选
- 搜索
- 新建文章 → 打开编辑器
- 编辑文章 → 读取文件 → 打开编辑器
- 删除文章 → 确认对话框 → 调用 API

---

## Phase B-2: 标签与分类管理（P3/P4）

### Step 19: 标签管理

**新建**: `src/components/admin/TagManager.tsx`

功能：
- 从所有文章中提取标签列表及使用次数
- 创建新标签
- 重命名标签 → 批量更新所有文章的 frontmatter
- 合并标签 → 将多个标签合并为一个
- 删除标签 → 从所有文章中移除

技术方案：批量操作使用 GitHub API 的 multi-file commit（一次 commit 修改多个文件）

### Step 20: 分类管理

**新建**: `src/components/admin/CategoryManager.tsx`

功能：
- 树状可视化展示当前分类结构
- 添加子分类：选择父节点 → 输入 slug + 中英文名 → 更新 `categories.ts`
- 重命名分类：修改 `categories.ts` 中的节点 → 可选批量更新文章 `categories` 字段
- 删除分类：删除节点 → 选择子分类/文章处理方式
- 拖拽排序：调整同级分类顺序

### Step 21: 图片管理

**新建**: `src/components/admin/ImageManager.tsx`

功能：
- 浏览 `public/images/posts/` 下所有图片（缩略图网格）
- 拖拽/选择上传新图片
- 点击图片 → 复制 Markdown 插入语法
- 删除图片

---

## Phase B-3: 自动部署（P2）

### Step 22: 部署状态集成

**修改**: `src/components/admin/AdminApp.tsx`

- 每次保存后轮询 GitHub Actions API 检查部署状态
- 显示：构建中 / 部署成功 / 部署失败
- 失败时提供查看日志的链接

### Step 23: GitHub Actions 工作流更新

**检查/修改**: `.github/workflows/` 下的部署工作流

确保 push 到 main 分支时自动触发 build + deploy。

---

## 文件变更总清单

### Part A（多级分类）

| 文件 | 操作 | Step |
|------|------|------|
| `src/data/categories.ts` | 新建 | 1 |
| `src/content.config.ts` | 修改 | 2 |
| `src/pages/[lang]/blog/[...path].astro` | 新建 | 3 |
| `src/pages/[lang]/blog/[...slug].astro` | 删除 | 3 |
| `src/pages/[lang]/blog/index.astro` | 修改 | 5 |
| `src/i18n/ui.ts` | 修改 | 6 |
| `src/layouts/PostLayout.astro` | 修改 | 7 |
| `src/pages/[lang]/index.astro` | 修改 | 8 |
| `src/pages/rss.xml.ts` | 修改 | 8 |
| `src/components/blog/SearchBar.tsx` | 修改 | 8 |
| `src/content/posts/zh/data-structure.md` | 修改 | 9 |
| `src/content/posts/zh/microcomputer.md` | 修改 | 9 |
| `src/components/blog/CategoryTree.tsx` | 新建 | 10 |
| `src/components/blog/Breadcrumb.tsx` | 新建 | 11 |

### Part B（Web CMS）

| 文件 | 操作 | Step |
|------|------|------|
| `src/lib/github/auth.ts` | 新建 | 13 |
| `src/lib/github/api.ts` | 新建 | 14 |
| `src/pages/[lang]/admin/index.astro` | 新建 | 15 |
| `src/components/admin/AdminApp.tsx` | 新建 | 16 |
| `src/components/admin/PostList.tsx` | 新建 | 18 |
| `src/components/admin/PostEditor.tsx` | 新建 | 17 |
| `src/components/admin/TagManager.tsx` | 新建 | 19 |
| `src/components/admin/CategoryManager.tsx` | 新建 | 20 |
| `src/components/admin/ImageManager.tsx` | 新建 | 21 |
| `src/components/admin/LoginScreen.tsx` | 新建 | 16 |
| `src/components/admin/AuthGuard.tsx` | 新建 | 16 |
| `.github/workflows/deploy.yml` | 检查/修改 | 23 |

共 **25+ 个文件**，其中 Part A 14 个文件，Part B 12+ 个文件。

---

## 验证步骤

### Part A 验证

1. `npm run dev` 启动
2. `/zh/blog/` — 确认一级 Tab 显示
3. Tab 切换筛选正确
4. 子分类树展开/折叠正常
5. 文章 URL 包含完整分类路径：`/zh/blog/tech-learning/deep-learning/slug/`
6. 文章页面包屑正确且可点击
7. 中英文切换正常
8. RSS 链接格式正确
9. `npm run build` 无错误

### Part B 验证

1. 访问 `/zh/admin/` — 跳转 GitHub 登录
2. 非仓库 owner 登录后 → 显示 403
3. Owner 登录 → 进入管理面板
4. 创建文章 → 填写标题/分类/标签 → 保存 → 确认 GitHub 仓库有新文件
5. 编辑文章 → 修改内容 → 保存 → 确认更新
6. 删除文章 → 确认后文件从仓库删除
7. 标签管理 → 重命名 → 确认所有文章更新
8. 分类管理 → 添加子分类 → 确认 categories.ts 更新
9. 图片上传 → 确认文件上传到仓库 → 插入 Markdown
10. 保存后确认 GitHub Actions 触发并部署成功

---

## 依赖安装（Part B 新增）

```bash
npm install @uiw/react-md-editor
# OAuth 相关无需额外依赖（使用 fetch + GitHub REST API）
```

---

## 扩展指南

### 添加新的一级分类

1. 在 `src/data/categories.ts` 的 `categoryTree` 数组中添加新节点
2. 在 `src/i18n/ui.ts` 中添加 Tab 翻译 key
3. 新文章的 `categories` 字段使用新分类 slug

### 添加子分类

1. 在 `categoryTree` 对应节点的 `children` 中添加子节点
2. 无需修改 schema 或路由代码

### 通过 CMS 管理

Phase B 完成后，所有分类/标签管理均可通过 Web 界面完成，无需手动编辑代码文件。
