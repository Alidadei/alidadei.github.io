# 实施计划: 博客分类系统

## 概述

本计划基于 PRD `docs/PRD-blog-category.md` 中的需求，详细列出实现博客分类系统的步骤和具体改动。

---

## Step 1: 创建分类配置

**新建文件**: `src/data/categories.ts`

定义三个分类的 slug、中英文名称和描述。导出 `CategorySlug` 类型供其他模块引用。

```typescript
export const categories = [
  {
    slug: 'tech-learning',
    label: { zh: '技术学习', en: 'Tech Learning' },
    description: { zh: '论文阅读、技术调研、知识点总结等', en: 'Paper reading, tech research, knowledge summaries' },
  },
  {
    slug: 'personal-practice',
    label: { zh: '个人实践', en: 'Personal Practice' },
    description: { zh: '个人动手实践项目记录', en: 'Hands-on project records' },
  },
  {
    slug: 'personal-views',
    label: { zh: '个人看法', en: 'Personal Views' },
    description: { zh: '基于调研实践的领域观点', en: 'Domain perspectives based on research & practice' },
  },
] as const;

export type CategorySlug = typeof categories[number]['slug'];

// 工具函数：获取分类标签
export function getCategoryLabel(slug: string, lang: 'zh' | 'en'): string {
  const cat = categories.find(c => c.slug === slug);
  return cat ? cat.label[lang] : slug;
}
```

---

## Step 2: 更新 Content Schema

**修改文件**: `src/content.config.ts`

将 posts collection 的 `category` 字段从 `z.string().optional()` 改为 `z.enum([...]).optional()`：

```typescript
// 修改前
category: z.string().optional(),

// 修改后
category: z.enum(['tech-learning', 'personal-practice', 'personal-views']).optional(),
```

同时 import `categories` 和 `CategorySlug`，保持 enum 值与 categories.ts 一致。

---

## Step 3: 重构博客文章路由

**删除文件**: `src/pages/[lang]/blog/[...slug].astro`

**新建文件**: `src/pages/[lang]/blog/[category]/[slug].astro`

核心改动：
- `getStaticPaths()` 从 `post.data.category` 提取 category 参数
- 对于 `category` 为空的旧文章，默认使用 `'tech-learning'`
- params 输出 `{ lang, category, slug }`
- 传递 `category` 和 `lang` 给 PostLayout

```typescript
export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((post) => {
    const parts = post.id.split('/');
    const lang = parts[0] as Lang;
    const slug = parts.slice(1).join('/');
    const category = post.data.category || 'tech-learning'; // 默认分类
    return {
      params: { lang, category, slug },
      props: { post },
    };
  });
}
```

---

## Step 4: 更新博客列表页

**修改文件**: `src/pages/[lang]/blog/index.astro`

### 4.1 添加 Tab 导航

在页面标题下方、搜索栏上方添加 Tab 栏：
- "全部" Tab：显示所有文章（默认选中）
- 三个分类 Tab：按 `category` 字段筛选
- 当前选中 Tab 使用 `bg-accent text-white` 样式
- 未选中 Tab 使用 `bg-bg-tertiary text-text-secondary` 样式

### 4.2 Tab 切换逻辑

使用客户端 JavaScript（或 Astro 的 `<script>` 标签）实现：
- 点击 Tab 切换时，通过 CSS class 控制文章列表的显示/隐藏
- 序列化所有文章数据到 JSON，包含 `category` 字段
- Tab 切换为纯前端行为（无需服务端路由）

### 4.3 文章链接更新

```typescript
// 修改前
href={`/${lang}/blog/${slug}/`}

// 修改后
href={`/${lang}/blog/${category}/${slug}/`}
```

### 4.4 空状态处理

每个分类 Tab 下的文章区域：
- 有文章：正常显示文章卡片
- 无文章：显示 "该分类暂无文章" / "No posts in this category"

---

## Step 5: 更新 i18n 翻译

**修改文件**: `src/i18n/ui.ts`

在 `zh` 和 `en` 对象中各添加：

```typescript
// zh
'blog.category.all': '全部',
'blog.category.tech-learning': '技术学习',
'blog.category.personal-practice': '个人实践',
'blog.category.personal-views': '个人看法',
'blog.noPosts': '该分类暂无文章',

// en
'blog.category.all': 'All',
'blog.category.tech-learning': 'Tech Learning',
'blog.category.personal-practice': 'Personal Practice',
'blog.category.personal-views': 'Personal Views',
'blog.noPosts': 'No posts in this category',
```

---

## Step 6: 更新 PostLayout

**修改文件**: `src/layouts/PostLayout.astro`

### 6.1 添加 Props

```typescript
interface Props {
  title: string;
  description?: string;
  date?: Date;
  tags?: string[];
  image?: string;
  category?: string;  // 新增
  lang?: Lang;         // 新增
}
```

### 6.2 显示分类标签

在标题上方或标签区域添加分类标签：
- 显示分类名称（通过 `getCategoryLabel` 获取翻译后的名称）
- 标签可点击，链接到 `/${lang}/blog/?category=${category}` 或前端 Tab 切换

### 6.3 修复日期 i18n

```typescript
// 修改前（硬编码）
date.toLocaleDateString('zh-CN', { ... })

// 修改后（动态）
date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { ... })
```

---

## Step 7: 更新首页

**修改文件**: `src/pages/[lang]/index.astro`

- recentPosts 链接格式改为 `/${lang}/blog/${category}/${slug}/`
- category 默认值处理：`post.data.category || 'tech-learning'`

---

## Step 8: 更新 RSS Feed

**修改文件**: `src/pages/rss.xml.ts`

```typescript
// 修改前
link: `/${post.data.lang}/blog/${post.id.split('/').slice(1).join('/')}/`

// 修改后
const slug = post.id.split('/').slice(1).join('/');
const category = post.data.category || 'tech-learning';
link: `/${post.data.lang}/blog/${category}/${slug}/`
```

---

## Step 9: 更新 SearchBar

**修改文件**: `src/components/blog/SearchBar.tsx`

- 在序列化的 JSON 数据中添加 `category` 字段（已在 Step 4 中处理 index.astro 的序列化）
- SearchBar 组件中显示匹配文章的分类信息

---

## Step 10: 标记现有文章

**修改文件**:
- `src/content/posts/zh/data-structure.md`
- `src/content/posts/zh/microcomputer.md`

为两篇文章添加 frontmatter：
```yaml
category: 'tech-learning'
```

---

## 文件变更清单

| 文件路径 | 操作 | 关联 Step |
|---------|------|-----------|
| `src/data/categories.ts` | 新建 | 1 |
| `src/content.config.ts` | 修改 | 2 |
| `src/pages/[lang]/blog/[category]/[slug].astro` | 新建 | 3 |
| `src/pages/[lang]/blog/[...slug].astro` | 删除 | 3 |
| `src/pages/[lang]/blog/index.astro` | 修改 | 4 |
| `src/i18n/ui.ts` | 修改 | 5 |
| `src/layouts/PostLayout.astro` | 修改 | 6 |
| `src/pages/[lang]/index.astro` | 修改 | 7 |
| `src/pages/rss.xml.ts` | 修改 | 8 |
| `src/components/blog/SearchBar.tsx` | 修改 | 9 |
| `src/content/posts/zh/data-structure.md` | 修改 | 10 |
| `src/content/posts/zh/microcomputer.md` | 修改 | 10 |

共 12 个文件：新建 2 个，修改 9 个，删除 1 个。

---

## 验证步骤

1. `npm run dev` 启动开发服务器
2. 访问 `/zh/blog/` 确认四个 Tab 显示正确
3. 点击各 Tab 确认筛选逻辑正常
4. 点击文章卡片，确认 URL 为 `/zh/blog/tech-learning/data-structure/`
5. 确认文章详情页显示分类标签
6. 点击分类标签可跳转回列表页对应 Tab
7. 切换到 `/en/blog/` 确认英文 Tab 和翻译正确
8. 访问 `/rss.xml` 确认链接格式已更新
9. `npm run build` 确认构建无错误
10. `npm run preview` 预览构建结果

---

## 扩展指南

未来添加新分类的步骤：
1. 在 `src/data/categories.ts` 的 `categories` 数组中添加新条目
2. 在 `src/content.config.ts` 的 `category` enum 中添加新值
3. 在 `src/i18n/ui.ts` 中添加对应的翻译 key
4. 新文章的 frontmatter 中使用新分类 slug

无需修改任何页面组件代码。
