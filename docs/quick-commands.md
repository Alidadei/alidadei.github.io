# 常用快捷命令

项目根目录:R:\Code\MY project\alidadei.github.io
所有命令都在项目根目录下执行(先 cd 到项目根)。Node 要求 >= 22.12.0。
文档里的命令都是纯文本,直接双击选中、复制即可。

---

## 日常开发

| 命令 | 作用 | 说明 |
|------|------|------|
| npm run dev | 本地开发服务器 | 启动后访问终端提示的 URL(通常 http://localhost:4321/ ),改代码热更新。会先打包 3D 背景 |
| npm run build | 完整构建 | 打包 3D + 同步每日一句 + 生成缩略图 + Astro 构建,产物在 dist/。提交/部署前用它验证 |
| npm run preview | 预览构建产物 | 启动静态服务器预览 dist/ 的构建结果(和线上一致)。必须先跑过 npm run build。端口被占会自动换(如 4322) |

dev 和 preview 的区别:
- dev 是开发模式,改文件实时刷新,但缓存/压缩等行为和线上不同。
- preview 跑的是 build 产物,和 GitHub Pages 线上完全一致。想确认线上效果用 preview。

---

## 内容维护

| 命令 | 作用 |
|------|------|
| npm run cms | 分类/标签 CLI 维护工具(交互式菜单)。增删改分类和标签、批量删除、重命名 slug(自动同步文章并生成旧链接重定向) |

cms 菜单结构:
- 分类管理
  - 列出分类
  - 新增分类
  - 重命名 slug(改网址段,自动改文章并加旧链接跳转)
  - 改 中/英文名称与描述(只改显示名,不动网址)
  - 删除分类
  - 批量删除分类(多选)
- 标签管理
  - 列出标签
  - 重命名标签
  - 删除标签
  - 批量删除标签(多选)
- 退出

操作键位:
- 空格键勾选(多选)/ 回车确认 / 方向键移动
- 任何输入步骤按 Ctrl+C = 取消当前操作、返回菜单(不会退出程序)
- 选择列表里有「← 返回」可选

---

## 资源处理

| 命令 | 作用 |
|------|------|
| npm run thumbs | 重新生成作品集缩略图(public/images/thumbs/*.webp,基于 src/content/portfolio/*.md 的 image 字段,sharp 压缩)。增量执行,源图没变会跳过 |
| npm run build:3d | 只重新打包 3D 背景脚本(public/three-bg.js),不跑完整 build。改了 src/3d/background.ts 后用 |

---

## 测试

| 命令 | 作用 |
|------|------|
| node tests/cms-functions.test.mjs | 跑 cms 工具的纯函数测试(61 项,验证分类/标签的解析、改写、匹配逻辑)。改过 scripts/cms.mjs 后建议跑一遍 |

---

## 常见场景速查

| 我想做 | 用什么 |
|--------|--------|
| 写/改博客文章后实时看效果 | npm run dev |
| 确认改动能构建、和线上一致 | npm run build,再 npm run preview |
| 改分类名 / 标签 | npm run cms |
| 改分类的网址(slug) | npm run cms,选「重命名 slug」 |
| 新增或删除分类/标签 | npm run cms |
| 改了作品集图,刷新缩略图 | npm run thumbs |
| 改了 3D 背景代码 | npm run build:3d(或直接 npm run build) |
| 提交推送前最终验证 | npm run build(必须全绿才能部署) |

---

## 注意事项

- 端口被占:dev 和 preview 默认 4321,被占会自动换端口(如 4322),看终端输出的实际地址。
- preview 前要先 build:preview 只服务 dist/,没构建过会看不到新改动。
- build 会改 public/:three-bg.js、quotes.json、images/thumbs/ 是构建产物(images/thumbs 已 gitignore),不用手动管。
- 停止后台服务器:在终端按 Ctrl+C。

---

## 安装依赖(偶尔用)

| 命令 | 作用 |
|------|------|
| npm install | 首次拉取项目或 package.json 变动后,安装全部依赖 |
| npm install -D 包名 | 安装开发依赖(如 npm install -D @inquirer/prompts) |

---

## 手机端调试

启动 dev 或 preview 后,用浏览器内置的设备模拟即可调试手机端效果,不用真机:

- Chrome / Edge:打开页面 → 按 F12 开发者工具 → 按 Ctrl+Shift+M(或点工具栏左上角的「设备」图标)切换到设备模式 → 顶部选手机型号(如 iPhone 12、Pixel 5)→ 刷新页面查看。
- 可调设备型号、屏幕尺寸、DPR,横竖屏切换。
- 模拟触摸交互(无 hover),适合验证手机端按钮/菜单等只在触摸设备表现不同的样式。

真机调试(可选):需要手机访问时,把启动命令换成带 --host 的形式暴露到局域网:

| 命令 | 作用 |
|------|------|
| npx astro dev --host | dev 模式暴露到局域网,终端会打印一个可被手机访问的 IP 地址(手机和电脑连同一 WiFi) |
| npx astro preview --host | preview 模式暴露到局域网,用于查看 build 产物的真机效果 |

提示:平时端口被占,astro 会自动换端口(如 4322、4323),看终端输出的实际地址。清理被占端口可用:

| 命令 | 作用 |
|------|------|
| npx kill-port 端口号 | 结束占用指定端口的进程(如 npx kill-port 4321 4322) |
