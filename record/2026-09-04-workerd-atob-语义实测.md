# workerd atob 语义实测(2026-09-04)

## 背景

在线管理后台(worker/src/github-api.ts)原先用 `atob()` 直接解码 GitHub Contents API 返回的 base64。
中文文章内容是否会乱码取决于 workerd 对 atob 的实现语义,故实测确认。

## 方法

- 测试 Worker:`tests/atob-workerd-test/`(wrangler.toml 的 compatibility_date 与生产一致,为 2024-12-01)
- 命令:`cd tests/atob-workerd-test && ../../worker/node_modules/.bin/wrangler dev --port 8791`,curl 触发
- 输入:`atob('5Lit5paH')`('中文' 的 UTF-8 base64)

## 结果

```json
{"charCodes":[228,184,173,230,150,135],"viaTextDecoder":"中文","len":6}
```

- workerd 的 atob 是**浏览器标准语义**:返回「二进制字符串」(一字节一字符,共 6 字符),
  不做 UTF-8 解码。
- 若直接把该返回值当文本使用,中文必然乱码;必须经
  `new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0)))` 转换。

## 结论与修复

- 修复不依赖 atob/btoa:新增 `worker/src/base64.ts` 纯 JS 编解码 + TextDecoder/TextEncoder 显式 UTF-8,
  行为与运行时实现完全解耦(单测 `tests/worker-base64.test.mjs`)。
- Cloudflare 官方 compatibility flags 列表无任何 atob/btoa 条目,即该语义从未被 compat date 门控过,
  本地实测即生产行为。
- 注:博客前台页面不经 Worker(Actions 预构建),前台读中文正常与此问题无关。
