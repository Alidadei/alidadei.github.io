# 常用快捷命令

所有命令都在项目根目录下执行(先 cd 到项目根)。Node 要求 >= 22.12.0。
文档里的命令都是纯文本,直接双击选中、复制即可。

---

## 博客地址

```
src\content\posts\zh
```

```
public\images\posts
```

## 图片地址

```
public\images
```

博客正文图片仍放在 `public\images\posts`。文章 Markdown 使用相对路径
`../../../../public/images/posts/xxx.png`，这样 Typora 可以本地预览；Astro 构建时会自动转换为线上路径 `/images/posts/xxx.png`。

## 图注

<figure style="text-align: center;">
  <img src=" " style="width: 60%; max-width: 360px; margin: 1.5em auto 0.5em;" />
  <figcaption style="font-size: 0.9em; color: #777;"> 这是图注 </figcaption>
</figure>

## 其他内容地址

维护网站正文与配置时改这些源文件(都是源,不是构建产物):

### 每日一句

(改这里;build 会复制到 public\quotes.json) 

```
src\data\quotes.json
```

### 作品集 / 项目页

```
src\content\portfolio
```

### 关于页

(中/英,含新闻、教育、实习、研究、获奖、技能)

```
src\content\about
```

### 站点配置

(站名、导航菜单、作者信息、邮箱、GitHub)

```
src\data\site.ts
```

### 博客分类树

(平时用 npm run cms 改,也可直接编辑)

```
src\data\categories.json
```

### 知识主题树

(文章 knowledge 字段引用,构建时校验路径)

```
src\data\knowledge.json
```

### 友链

```
src\data\friends.json
```

### 旧链接重定向

(cms 改分类 slug 时自动追加)

```
src\data\redirects.json
```

## cms标签维护工具 

| 命令 | 作用 |
|------|------|
| npm run cms | 分类/标签 CLI 维护工具(交互式菜单)。增删改分类和标签、批量删除、重命名 slug(自动同步文章并生成旧链接重定向) |

| 命令                              | 作用                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| node tests/cms-functions.test.mjs | 跑 cms 工具的纯函数测试(61 项,验证分类/标签的解析、改写、匹配逻辑)。改过 scripts/cms.mjs 后建议跑一遍 |

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

## 头像&icon

| 命令 | 作用 |
|------|------|
| npm run favicon | **换网站 favicon**。源图支持 PNG/JPG/WebP/SVG/GIF/TIFF/AVIF/ICO,生成 favicon.png 并自动递增 ?v 版本号 |
| npm run avatar | **换关于页头像**。自动判断源图透明度:透明→PNG 融入背景,不透明照片→jpg(体积小) |

favicon 用法:
- 命令: `npm run favicon -- <源图> [尺寸]`,例 `npm run favicon -- public/images/my_profile.png`
- 源图: PNG/JPG/WebP/SVG/GIF/TIFF/AVIF/ICO。非正方形会**居中裁剪**成方形;ICO 在内存提取内嵌最大的 PNG(不落地临时文件,无需清理中间产物)。
- 尺寸: 输出 favicon.png 边长,默认 180(兼顾标签页和高 DPI),一般不用传。
- 生成: `public\favicon.png` + 把 `src\layouts\BaseLayout.astro` 的 `favicon.png?v=N` 递增 +1(破缓存),再打印 git 命令。
- **注意:** 源图路径尽量别用中文，若有报错可以改成英文名(Windows 命令行传给 node.exe 可能会导致乱码从而无法找到文件)。

avatar 用法:
- 命令: `npm run avatar -- <源图>`,例 `npm run avatar -- ~/Downloads/photo.jpg`
- 自动判断: 透明源图(PNG 图标)→输出透明 PNG(contain 保留完整图,融入背景);不透明照片→输出 jpg(cover 居中裁剪,体积小)。会清掉旧格式文件,避免两份并存。
- 生成: `public\images\violin.*` + 更新 `src\pages\[lang]\about.astro` 两处(PC + 移动端)的 img src。
- **注意:** 源图路径别用中文(同 favicon,Windows 命令行传 node 可能乱码)。

## 缩略图&3D

| npm run thumbs   | 重新生成作品集缩略图(public/images/thumbs/*.webp,基于 src/content/portfolio/*.md 的 image 字段,sharp 压缩)。增量执行,源图没变会跳过 |
| ---------------- | ------------------------------------------------------------ |
| npm run build:3d | 只重新打包 3D 背景脚本(public/three-bg.js),不跑完整 build。改了 src/3d/background.ts 后用 |
| **npm run compress-posts** | 批量压缩 public/images 图:原地压缩(默认)或转 webp(--webp) |

compress-posts 用法:
- `npm run compress-posts` 原地压缩 posts/ 下 >50KB 的图(不换格式,不动引用)。
- `npm run compress-posts -- --all` 压缩整个 public/images/(跳过 thumbs/ 和已有 webp)。
- `npm run compress-posts -- --webp` 把 posts 图转 webp(删原图 + 自动改 .md 引用,省 50%+)。**--webp 不要和 --all 同用**(非 posts 图引用散在 friends.json/site.ts/about,自动改不全)。
- 都先写临时文件再 rename(避开 Windows 文件占用);压缩无收益(会变大)的自动保留原图。

---

## 本地调试

| 命令            | 作用           | 说明                                                         |
| --------------- | -------------- | ------------------------------------------------------------ |
| npm run dev     | 本地开发服务器 | 启动后访问终端提示的 URL(通常 http://localhost:4321/ ),改代码热更新。会先打包 3D 背景、自动选择可用端口，并清除本站遗留的生产 SW/CSS 缓存 |
| npm run sky-preview | 桌面天空全天预览 | 一键启动开发服务器和独立 Microsoft Edge，把首页一整天的天空配色压缩成约 2 分钟循环播放 |
| npm run check:dev-cache | 开发缓存回归 | 验证 dev 只清除本站生产 Service Worker/缓存，并防止自动刷新死循环 |
| npm run check:reading-progress | 阅读进度单测 | 验证正文起止、短文章与手机动态视觉视口的进度几何计算 |
| npm run check:mobile-overflow | 移动端横向溢出回归 | 自动启动开发服务器和无界面 Microsoft Edge，遍历全站路由并在 320、360、390、430 px 下验证页面、正文和极端宽内容 |
| npm run build   | 完整构建       | 打包 3D + 同步每日一句 + 生成缩略图 + Astro 构建,产物在 dist/。提交/部署前用它验证 |
| npm run preview | 预览构建产物   | 启动静态服务器预览 dist/ 的构建结果(和线上一致)。必须先跑过 npm run build。会自动选择可用端口 |
| npx kill-port   | 释放端口       | 应明确指定端口，如：  npx kill-port 4321                     |

dev 和 preview 的区别:

- dev 是开发模式,改文件实时刷新,但缓存/压缩等行为和线上不同。
- dev 页面会自动注销同源遗留的本站 Service Worker，并清理 `heavy-v*`、`runtime-v*` 缓存；若页面正被旧 SW 控制，会自动刷新一次后进入正常 HMR。
- preview 跑的是 build 产物,和 GitHub Pages 线上完全一致。想确认线上效果用 preview。

### 桌面端天空全天预览

用途:把首页从 `00:00` 到 `23:59` 的天空配色压缩成约 2 分钟循环播放，也可以停在任意分钟检查。命令会自动选择可用端口、启动开发服务器、打开独立的 Microsoft Edge 并注入时间轴；不会修改日常 Edge 配置，也不会修改正常网页的时间和显示。

在项目根目录只运行这一条命令:

```powershell
npm run sky-preview
```

启动成功后，终端会输出 `[sky-preview] 已就绪` 和一行 JSON。以下字段可用于核对:

- `panel: true`:底部全天预览控制条已经显示。
- `width: 1440`:当前按桌面端宽度渲染。
- `frameReady: "complete"`:3D 背景已经加载完成。
- `time` 与 `frameTime` 相同:首页天空与 3D 背景使用同一个模拟时间。

控制条用法:

- 默认自动播放,一整天约 2 分钟。
- 拖动滑杆会自动暂停,可精确停在任意分钟。
- 点「播放/暂停」继续或停止循环。
- 点「当前时刻」跳到电脑当前时间并暂停。

结束调试:关闭这个独立 Microsoft Edge 窗口，或在终端按 `Ctrl+C`。命令会同时停止开发服务器并清理本次预览使用的临时 Edge 配置目录。

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
| 换网站 favicon | npm run favicon -- <源图> |
| 换关于页头像 | npm run avatar -- <源图> |
| 改了 3D 背景代码 | npm run build:3d(或直接 npm run build) |
| 查看桌面端天空一整天的配色 | npm run sky-preview |
| 检查博客阅读进度几何 | npm run check:reading-progress |
| 检查所有移动端横向溢出 | npm run check:mobile-overflow |
| 提交推送前最终验证 | npm run build(必须全绿才能部署) |

---

## 注意事项

- 端口被占:dev 和 preview 从 4321 开始探测可用端口并自动换端口,看终端输出的实际地址；也可用 `npm run dev -- --port 4330` 指定端口。
- `localhost` 与 `127.0.0.1` 都表示本机: `127.0.0.1` 强制使用 IPv4 回环地址; `localhost` 是主机名,Windows 可能优先解析到 IPv6 回环地址 `::1`。如果 `localhost` 打不开但 `127.0.0.1` 能打开,通常是 IPv6 监听异常,可改用 `http://127.0.0.1:实际端口/`。
- preview 前要先 build:preview 只服务 dist/,没构建过会看不到新改动。
- build 会改 public/:three-bg.js、quotes.json、images/thumbs/ 是构建产物(images/thumbs 已 gitignore),不用手动管。
- 每一次调试完后释放端口:在终端按 Ctrl+C。

---

## 安装依赖(偶尔用)

| 命令 | 作用 |
|------|------|
| npm install | 首次拉取项目或 package.json 变动后,安装全部依赖 |
| npm install -D 包名 | 安装开发依赖(如 npm install -D @inquirer/prompts) |

---

## 手机端调试

启动 dev 或 preview 后,用浏览器内置的设备模拟即可调试手机端效果,不用真机:

- Microsoft Edge:打开页面 → 按 F12 开发者工具 → 按 Ctrl+Shift+M(或点工具栏左上角的「设备」图标)切换到设备模式 → 顶部选手机型号(如 iPhone 12、Pixel 5)→ 刷新页面查看。
- 可调设备型号、屏幕尺寸、DPR,横竖屏切换。
- 模拟触摸交互(无 hover),适合验证手机端按钮/菜单等只在触摸设备表现不同的样式。

真机调试(可选):需要手机访问时,把启动命令换成带 --host 的形式暴露到局域网:

| 命令 | 作用 |
|------|------|
| npm run dev -- --host | dev 模式暴露到局域网,终端会打印一个可被手机访问的 IP 地址(手机和电脑连同一 WiFi) |
| npm run preview -- --host | preview 模式暴露到局域网,用于查看 build 产物的真机效果 |

提示:平时端口被占,astro 会自动换端口(如 4322、4323),看终端输出的实际地址。清理被占端口可用:

| 命令 | 作用 |
|------|------|
| npx kill-port 端口号 | 结束占用指定端口的进程(如 npx kill-port 4321 4322) |

---

## 项目数据说明

### 构建时的两条数据通道

```
【通道1】src 被消化进页面
  src/ (代码·数据) --import/收集--> astro 处理 --> dist/ (HTML/JS/CSS)

【例外】源在 src,先变产物放进 public
  src\3d\background.ts --esbuild--> public\three-bg.js
  src\data\quotes.json -----cp----> public\quotes.json
  portfolio 源图 -------sharp-----> public\images\thumbs

【通道2】public 原样复制到 dist
  public/ (图片·字体·PDF + 上面3个产物) --> dist/ (原文件,URL=路径)
```

说明:通道1的原始 .md/.json 不以原文件出现在 dist(被消化成 HTML/JS/CSS);例外那 3 个产物先进 public,再随通道2进 dist。

### 每样东西从哪来、走哪条

| 内容 | 源在哪 | 走哪条 | 说明 |
|------|--------|--------|------|
| 博客文章 / 作品集 / 关于页 | src\content\ 下 .md | 通道1 | content collection 收集,渲染成页面 |
| 站点配置、导航、作者信息 | src\data\site.ts | 通道1 | 被 layout/header 等 import |
| 分类树 | src\data\categories.ts | 通道1 | 被博客页 import(.json 是 cms 后端运行时读) |
| 友链 | src\data\friends.json | 通道1 | 被 links.astro import |
| 知识树 | src\data\knowledge.json | 通道1 | 被 content.config + 博客页 import |
| 重定向 | src\data\redirects.json | 通道1 | 被 astro.config.mjs import |
| 每日一句 | src\data\quotes.json | 例外 | 不被 import,cp 到 public,前端运行时 fetch |
| 3D 背景脚本 | src\3d\background.ts | 例外 | esbuild 编译成 three-bg.js 放 public |
| 图片 / 字体 / PDF / favicon | public\ | 通道2 | 原样投放,源就在 public |
| 缩略图 | portfolio 源图 | 例外 | sharp 生成到 public\images\thumbs |

### 作品集(portfolio)的特殊构建

作品集是双层拼装 —— 列表卡片走通道1,详情页走通道2(独立 HTML):

```
src/content/portfolio/*.md
  frontmatter: 标题·摘要·缩略图·分类·link
        │ getCollection(通道1)
        ↓
projects.astro ──→ /zh/projects/ 列表卡片
        │
        │ 卡片 link 字段指向(点击新标签打开)
        ↓
public/portfolio/music-signal-analysis.html (通道2 原样投放)
  = 详情页,独立 HTML,不是 astro 生成的
```

要点:
- 列表卡片(src):projects.astro 只读 frontmatter(标题/摘要/图/分类/link),渲染成 /zh/projects/ 的卡片网格(分类 tab + 无限滚动)。
- 详情页(public/portfolio/*.html):独立静态 HTML,不是 astro 生成的(src/pages 无 portfolio 路由)。卡片 link 指向它,点击新标签打开。改详情直接改这个 html。
- md 正文(body)目前没被任何页面渲染 —— 只有 frontmatter 进了列表,详情内容来自 public html(另一套)。写 body 不会显示。

