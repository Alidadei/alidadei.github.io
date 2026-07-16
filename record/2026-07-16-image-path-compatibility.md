# 博客图片本地/线上兼容验证

## 变更

- 文章源文件使用 `../../../../public/images/posts/<file>`，Typora 可按文件位置读取。
- Astro 的 `remark-public-image-paths` 构建期适配器把该路径转换为 `/images/posts/<file>`。
- CMS 图片上传与图片列表复制出的 Markdown 采用同一相对路径。

## 验证

- `node tests/image-paths.test.mjs`：通过。
- `node --check src/plugins/remark-public-image-paths.mjs`：通过。
- `node --check scripts/compress-post-images.mjs`：通过。
- `npm.cmd run build`：通过，构建 44 个页面。
- `dist/zh/blog/agent-context/index.html`：生成 `/images/posts/image-20260422201632381.png`，未出现 `public/` 源路径。
- `public/images/posts/image-20260422201632381.png`：相对源路径实际存在。
