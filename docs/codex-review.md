# Codex 审查报告

> 审查时间：2026-04-22
> 审查对象：`docs/PRD-blog-category.md` 和 `docs/plan-blog-category.md`
> 审查者：Codex (gpt-5.4, reasoning: xhigh)

## 整体判断

Part A 在当前 Astro 6 项目里可落地，但 URL 设计需要重做；Part B 按现在"纯前端 GitHub OAuth App + 浏览器持 token"的写法，不建议直接实施。

---

## 发现的问题

### 1. [高] Part B 认证架构不成立
PRD 把 GitHub OAuth App (PKCE flow) 定义为"无需后端，纯前端"。即使加 PKCE，把 code 换 token 和长期持有 token 放在浏览器端，仍然不适合作为 CMS 的生产方案。OAuth App 的权限边界偏粗，不适合"单仓库 CMS"。

### 2. [高] 分类页与文章页 URL 命名空间冲突
`[...path].astro` 与 `[...category]/index.astro` 会生成冲突路径。如果文章 URL 是"分类路径 + slug"，而分类页 URL 也是"分类路径"，文章 slug 与分类 slug 天然可能冲突，catch-all 不能从根上消除这种歧义。

### 3. [高] CMS 直接改 TS 源码风险大
分类配置放在 `src/data/categories.ts`，还计划让 CMS 直接改这个 TS 源文件。这会把"内容管理"变成"在线改源码"：容易写坏语法、难做安全更新、容易制造 merge 冲突。

### 4. [高] URL 与分类强耦合无 redirect 策略
分类重命名/移动/删除没有 redirect/alias 策略。一旦分类树调整，所有相关文章 URL 都会变。当前站点是纯静态 GitHub Pages，真正的 301 能力很弱，旧链接和 SEO 都会受影响。

### 5. [中高] 批量操作 API 选型错误
PRD 以 Contents API 为主，但标签重命名等批量操作需要多文件修改。Contents API 逐文件提交会导致一次操作变成 N 次 commit、N 次 deploy。另外部署工作流监听的是 `master` 而非 `main`。

### 6. [中] 安全设计不足
缺少 OAuth state/nonce、HTML sanitize、CSP、上传文件名/类型/大小限制、路径归一化。用 `owner: 'Alidadei'` 可变 login 名做鉴权不可靠。

### 7. [中] 计划遗漏
Step 4 同时保留两套互斥方案未统一；SearchBar 变更被低估（当前只有搜索框和计数，需要补完整结果 UI）。

---

## 改进建议

1. **认证改为 Worker + GitHub App**：浏览器只持会话不持 token；Worker 负责 OAuth callback、token exchange、会话 cookie 和 API 代理
2. **分离分类页与文章页 URL**：分类页用 `/${lang}/blog/category/[...path]/`，或文章保持稳定 `/${lang}/blog/${slug}/` 不含分类
3. **分类数据改为 JSON**：`categories.json` 存储，TS 只负责读取校验；CMS 只写数据文件不改源码
4. **引入严格分类校验**：路径必须存在、slug 唯一、禁止与保留路由冲突、旧字段迁移策略
5. **批量操作用 GraphQL**：改用 `createCommitOnBranch`，一次操作 = 一个 commit
6. **补齐安全基线**：OAuth state/nonce、固定 user ID 白名单、Markdown sanitize、CSP、上传约束、默认 draft: true
7. **先收敛方案再写代码**：URL 规则、鉴权架构、分类存储格式、部署分支四件事先定

---

## 修正后的实施方案

1. **Phase 0 定架构**：Part B 改成 Worker + GitHub App；分类存储改 categories.json；URL 规则定为"文章稳定 permalink + 分类独立路由"
2. **Part A 只读能力**：content.config.ts 增加 categories 与校验；分类数据加载与树工具；分类页、面包屑、Tab、SearchBar、RSS/首页更新
3. **迁移**：现有文章补 categories；预留 aliases/redirect 数据结构；slug 不允许含 /
4. **Part B 基础设施**：先落 Worker 会话、GitHub API 代理、统一 commitChanges(files[]) 提交抽象、部署分支对齐
5. **文章 CRUD + 图片**：新文章默认 draft: true，保存与发布分离；图片上传加文件校验和唯一命名
6. **标签/分类批量管理**：批量改动走单次 commit；分类重命名/移动同步处理 alias/redirect

---

## 参考

- GitHub OAuth 授权流程：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- GitHub OAuth App 最佳实践：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app
- GitHub Apps vs OAuth Apps：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps
- GitHub Contents API：https://docs.github.com/en/rest/repos/contents
- GitHub GraphQL createCommitOnBranch：https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch
- Astro Routing：https://docs.astro.build/en/guides/routing/
