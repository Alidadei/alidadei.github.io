# PRD: 博客分类系统

## 1. 背景与目标

当前博客系统没有分类功能，所有文章以扁平列表展示。随着博客内容增长，需要引入分类体系帮助读者快速定位不同类型的内容。

**目标**：为博客添加三级分类体系（技术学习/个人实践/个人看法），支持可扩展架构，分类融入 URL 路径，列表页使用 Tab 切换筛选。

## 2. 需求概述

### 2.1 分类定义

| 分类 Slug | 中文名 | 英文名 | 说明 |
|-----------|--------|--------|------|
| `tech-learning` | 技术学习 | Tech Learning | 论文阅读、技术调研、知识点总结等，可能搭配少量个人实践 |
| `personal-practice` | 个人实践 | Personal Practice | 个人动手实践项目记录 |
| `personal-views` | 个人看法 | Personal Views | 基于调研实践后，对一个领域在当前时间节点下的看法 |

### 2.2 功能需求

#### FR-1: 分类 Tab 导航
- 博客列表页 (`/[lang]/blog/`) 顶部显示 Tab 栏
- 四个 Tab：全部 + 三个分类
- Tab 始终显示（空分类不隐藏）
- 当前选中 Tab 有视觉高亮
- 空分类点击后显示"该分类暂无文章"

#### FR-2: 分类融入 URL
- 文章 URL 格式：`/[lang]/blog/[category]/[slug]/`
- 例：`/zh/blog/tech-learning/data-structure/`
- 无 category 的旧文章默认归入 `tech-learning`

#### FR-3: 文章页分类显示
- 文章详情页标题区域显示所属分类
- 分类标签可点击，跳转到对应分类列表

#### FR-4: 可扩展性
- 分类定义集中在配置文件中
- 新增分类只需：修改配置 + 更新 schema enum
- 不需要修改页面组件逻辑

#### FR-5: 搜索兼容
- SearchBar 搜索结果中显示文章分类

#### FR-6: RSS 兼容
- RSS feed 中的文章链接更新为新的 URL 格式

### 2.3 非功能需求

#### NFR-1: 国际化
- 分类名称支持中英文切换
- Tab 标签、空状态提示均需翻译

#### NFR-2: 现有内容兼容
- 现有两篇 CSDN 外链文章标记为 `tech-learning` 分类
- publications/talks/teaching 等学术 collection 保持不变

#### NFR-3: 构建兼容
- `npm run build` 无错误
- 所有静态路径正确生成

## 3. 技术方案

### 3.1 架构设计

```
分类配置层: src/data/categories.ts (定义所有分类)
    ↓
Schema 层: src/content.config.ts (约束 category 字段值)
    ↓
路由层: src/pages/[lang]/blog/[category]/[slug].astro (URL 结构)
    ↓
展示层: 博客列表 Tab + 文章页分类标签
    ↓
周边适配: RSS, SearchBar, 首页链接, i18n
```

### 3.2 数据流

```
文章 Markdown (frontmatter: category: 'tech-learning')
    → Astro Content Collection (schema 校验)
    → getStaticPaths() 生成 /zh/blog/tech-learning/slug/ 页面
    → 博客列表页按 category 筛选展示
```

### 3.3 分类配置结构

```typescript
// src/data/categories.ts
export const categories = [
  {
    slug: 'tech-learning',
    label: { zh: '技术学习', en: 'Tech Learning' },
    description: { zh: '论文阅读、技术调研、知识点总结', en: 'Paper reading, tech research, knowledge summaries' },
  },
  // ... 更多分类
] as const;

export type CategorySlug = typeof categories[number]['slug'];
```

## 4. 影响范围

| 模块 | 影响 |
|------|------|
| 博客文章路由 | URL 结构变更（需处理旧 URL 301 重定向） |
| 博客列表页 | 新增 Tab 组件和分类筛选逻辑 |
| 文章详情页 | 新增分类标签显示 |
| RSS Feed | 链接格式更新 |
| 首页 | 最近文章链接格式更新 |
| 搜索组件 | 数据序列化添加 category 字段 |
| i18n | 新增分类翻译条目 |
| 现有文章 | 补充 category frontmatter |

## 5. 验收标准

- [ ] 博客列表页显示四个 Tab（全部 + 三个分类）
- [ ] 切换 Tab 正确筛选对应分类文章
- [ ] 空分类显示"暂无文章"提示
- [ ] 文章 URL 包含分类路径段
- [ ] 文章详情页显示可点击的分类标签
- [ ] 中英文切换正常
- [ ] RSS feed 链接格式正确
- [ ] 搜索结果显示分类信息
- [ ] `npm run build` 无错误
- [ ] 新增分类只需修改配置文件和 schema enum

## 6. 未来扩展

- 每个分类可配置独立的列表页模板（如个人实践可展示项目卡片）
- 分类页面支持分页
- 分类 RSS feed（如 `/rss/tech-learning.xml`）
