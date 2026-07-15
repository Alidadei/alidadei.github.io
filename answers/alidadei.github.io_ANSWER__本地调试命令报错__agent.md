# ANSWER.md

当前对话仓库：R:\Project\TOYS\alidadei.github.io
当前输出文件：answers/alidadei.github.io_ANSWER__本地调试命令报错__agent.md
当前 session：agent

## 暂存区

- 未修改项目源码。
- 排查前工作区已有 `src/data/quotes.json` 未提交修改，本轮保留。

## 本轮回答区

### 结论

三个命令不是同一个原因：

1. `npm run build` 的确定性失败原因是 Tailwind v4 扫描 Markdown 中的 Windows 路径时，把路径片段误当成 CSS 候选，最终触发非法 Unicode 码点。
2. `npm run dev` 和 `npm run preview` 的默认端口 4321、4322、4323 已被多个 Node 进程监听；Astro 尝试递增到 4323 时收到 `listen EACCES: permission denied ::1:4323`。
3. 使用空闲端口验证后，`dev` 和 `preview` 都能正常启动，说明这两个命令的脚本和 Astro 配置本身没有在启动阶段报错。

### 复现记录

- Node：`v22.22.3`，满足文档要求的 `>=22.12.0`。
- npm：`10.9.8`（通过 `cmd.exe` 调用 `npm.cmd`）。
- 依赖树完整，`astro@6.1.3`、`tailwindcss@4.2.2`、`@tailwindcss/vite@4.2.2` 版本一致。
- `cmd.exe /d /c "npm run build"`：3D 打包、每日一句同步、缩略图生成均成功；Astro/Tailwind 阶段失败：

  ```text
  [@tailwindcss/vite:generate:build] Invalid code point 11971895
  file: .../src/styles/global.css
  ```

- `cmd.exe /d /c "npm run dev"` 和 `cmd.exe /d /c "npm run preview"`：4321、4322 已占用，尝试 4323 时失败：

  ```text
  listen EACCES: permission denied ::1:4323
  ```

- `npm run dev -- --port 4330`：显示 `astro v6.1.3 ready` 和 `http://localhost:4330/`。
- `npm run preview -- --port 4331`：显示 `astro v6.1.3 ready` 和 `http://localhost:4331/`。

### Tailwind 错误的具体链路

`docs/DRAFT/CC dynamic workflow 的局限性.md:11` 有如下文本：

```text
C:\Users\y7\.claude\projects\R--FDU-courses-------------\b6ad377c-e04f-468a-bb54-a56e8f79298f\workflows\scripts
```

Tailwind Oxide 扫描器实际提取到的候选是：

```text
--FDU-courses-------------\b6ad377c-e04f-468a-bb54-a56e8f79298f\workflows\scripts）
```

Tailwind v4 对以 `--` 开头的候选按主题变量处理，并把 `\b6ad37` 当作 CSS Unicode 转义。`0xB6AD37` 的十进制值正是 `11971895`，但它超过 Unicode 最大码点 `0x10FFFF`，所以构建失败。`src/styles/global.css:1-8` 的 `@import "tailwindcss"` 和主题变量是触发扫描流程的入口，但不是包含错误字符的源文本。

### 端口错误的证据

复现时当前监听情况为：

```text
0.0.0.0:4321  LISTENING  34324
0.0.0.0:4322  LISTENING  44540
0.0.0.0:4323  LISTENING  5740
[::1]:4321   LISTENING  36396
[::1]:4322   LISTENING  34176
```

这些 PID 对应的进程名均为 `node`。没有停止这些进程，因为本轮只做排查，且无法仅凭端口信息断言它们都属于本项目。

### 文档中的问题

`docs/quick-commands.md:163` 说预览端口被占会自动换；这只覆盖 Astro 能够继续绑定的情况。当前 4321-4323 都已被占用，且 4323 的 IPv6 绑定返回 `EACCES`，因此不能按文档假定继续正常换端口。文档没有说明 Tailwind 会扫描 `docs/DRAFT` 里的 Windows 路径，这也是构建错误不容易从命令本身看出的原因。

### 上一轮排查时未执行的动作

- 没有改动 `docs/DRAFT`、`src/styles/global.css`、`package.json` 或依赖版本。
- 没有终止任何 Node 进程。
- 只保留了原有的 `src/data/quotes.json` 工作区修改。

### 本轮修复与验证

- `src/styles/global.css:1-3` 改为关闭 Tailwind 全仓库自动扫描，并显式只扫描 `src`。
- 新增 `scripts/run-astro.mjs`，`dev` 和 `preview` 在未显式传入 `--port` 时从 4321 开始探测可用端口，避免 Windows 上已占用端口返回 `EACCES` 后直接退出。
- `package.json:9,18` 已让 `npm run dev` 和 `npm run preview` 使用该启动器。
- `docs/quick-commands.md` 已同步说明自动选端口，并把手机端命令改为复用 npm 脚本。
- 完整 `npm run build` 通过，生成 44 个页面；构建末尾的 friend-feed `fetch failed` 仅为远程友链抓取警告，进程退出码为 0，不是构建失败。
- 在 4321-4323 被占用时，原命令均自动选择 4324 并显示 `astro v6.1.3 ready`。
