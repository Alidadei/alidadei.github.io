

## 项目结构维护：

使用不同文件夹来归类不同的文件！保持项目结构整洁清晰！

以下文件夹如果项目目录下没有，则创建！

backup文件夹：原来跑通验证过的代码，或者旧的数据，在加入新的相同功能代码/数据后，询问用户同意后放入此文件夹！

docs 文件夹：所有用户和agent输出的技术文档和经验总结都放在这里

record 文件夹：放所有的实验结果记录

tests文件夹：所有单独测试或问题验证代码都需要放到这个文件夹

  包括但不限于：
  - 验证类文件（如 verify_*.txt）

  - 测试脚本

    给codex/agent看的验证提示文件

### 知识图谱维护

本项目的知识图谱为"docs\knowledge-graph-en\knowledge-graph.md"，每一次提交推送之后，都需要根据当前项目的实际结构来更新这个知识图谱。

### 技术文档维护

假如本项目的博客排版规则有变化，必须更新"docs\技术博客排版规范.md"

### Git 钩子维护

钩子由 `git config core.hookspath .githooks` 启用（新克隆需执行一次）。

`.githooks/` 下钩子的第一行（shebang，声明脚本用哪个解释器执行）必须写 `#!/bin/sh` 且只用 POSIX 语法，禁止 `#!/bin/bash` 及 bash 独有写法（`[[ ]]`、数组、`local`、`function`、`source`）。原因：GitHub Desktop 内嵌 Git 没有 bash.exe，会误用 Windows 自带的 WSL 别名 `bash.exe` 导致提交报错；`sh` 各环境通用。









