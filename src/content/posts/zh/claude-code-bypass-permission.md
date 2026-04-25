---
title: 'Claude Code CLI - Bypass Permission 配置指南'
date: 2026-01-23
tags:
  - Claude Code
  - CLI
  - 配置
categories:
  - tech-learning
lang: zh
---

# Claude Code CLI - Bypass Permission 配置指南

## 概述

Bypass Permission 模式可以让 Claude Code 在执行操作时跳过权限确认提示，提高操作效率。

---

## 开启方法

在你的配置文件中添加以下配置：

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

---

## 配置文件位置

### 方法 1：全局配置（推荐）

作用于所有项目。

**文件路径：** `C:\Users\y\.claude.json`

编辑该文件，添加 `permissions` 配置段：

```json
{
  "numStartups": 59,
  "installMethod": "native",
  ...其他配置...
  "mcpServers": { ... },
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

### 方法 2：项目级别配置

仅作用于当前项目。

**文件路径：** 项目根目录下的 `.claude/settings.json`

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

---

## 所有可用的 defaultMode 模式

| 模式 | 说明 |
|------|------|
| `default` | 默认行为，询问权限 |
| `bypassPermissions` | 绕过权限确认 |
| `acceptEdits` | 自动接受编辑 |
| `delegate` | 委托模式 |
| `dontAsk` | 不询问 |
| `plan` | 计划模式 |

---

## 注意事项

1. **安全性**：启用 `bypassPermissions` 模式后，Claude Code 将自动执行操作而无需确认，请确保你信任所运行的项目和命令
2. **生效时机**：修改配置后需要重启 Claude Code 才能生效
3. **配置优先级**：项目级配置会覆盖全局配置

---

## 禁用 Bypass Permissions 模式

如果想完全禁用绕过权限功能，可以设置：

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  }
}
```
