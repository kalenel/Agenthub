# Agenthub

多智能体协作中枢 — 记忆分层架构 + DAG 子智能体协作 + Electron 桌面客户端。

## 是什么

Agenthub 是一个 AI 智能体管理平台，让多个 AI 智能体在群聊中协作完成任务。核心理念：

- **记忆分层**：不是把所有对话塞进 prompt，而是按 `session / project / core` 三层存储，按 `coding / chat / recovery` 模式智能加载
- **DAG 协作**：子智能体按有向无环图编排，互不阻塞，自动汇总结论
- **桌面原生**：Electron 客户端，一键启动，体验接近本地应用

## 核心能力

### 记忆系统

| 层 | 说明 |
|---|---|
| `core` | 长期硬记忆：原则、身份、稳定事实，只追加不删除 |
| `project` | 项目工作台：当前任务、决策、阻塞 |
| `session` | 会话便签：当前对话临时上下文 |

- **Progress Memory**：进度链，回答"现在做到哪了"
- **Transition Ledger**：变化日志，记录上下文切换原因
- **Evidence Pack**：发给模型的证据包，只送判断所需的最小信息
- **Distribution Layer**：同一份记忆，按 mode + recipient 切成不同包

| mode | 条数 | token | 用途 |
|---|---|---|---|
| `coding` | 3+2+1 | 700 | 写代码，最轻 |
| `chat` | 8+6+4 | 2800 | 聊天，最重 |
| `recovery` | 10+8+6 | 2200 | 断点恢复 |

- **MemoryPack 导出**：`manifest.json` + 三层 `jsonl` + `attachments/`，可跨实例导入
- **记忆抽屉 UI**：Evidence Pack 面板、Pin 面板、scope 搜索、whyLoaded 说明

### DAG 子智能体协作

- 子智能体按 DAG 编排，并行执行
- 自动汇总结论、合并冲突
- 进度追踪 + 任务报告

### 智能体管理

- 内置 Claude Code、Codex、GPT 适配器
- 自定义智能体配置
- 模型切换
- 群聊上下文管理

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 启动 Electron 桌面客户端
.\启动AgentHub.ps1
```

然后浏览器打开 `http://localhost:3000`，或等桌面客户端自动启动。

## 项目结构

```
src/
  app/api/yi-memory/      记忆系统 API (CRUD + 导出导入)
  server/yi-memory/        记忆引擎
    memory-store.ts        SQLite 存储引擎
    structured-memory.ts   结构化写入 (Progress/Transition)
    archive.ts             MemoryPack 导入/导出
    service.ts             服务门面
    bridge.ts              外部桥接
  components/
    memory-drawer.tsx      记忆抽屉主面板
    memory-highlights.tsx  Evidence Pack 面板
    memory-conversation-pin-panel.tsx  会话 Pin
    memory-archive-actions.tsx         导入/导出按钮
    sub-agent-panel.tsx    DAG 子智能体面板
    chat-panel.tsx         聊天面板
  server/
    sub-agent-manager.ts   DAG 子智能体管理
    hooks-system.ts        钩子系统
    tools/                 工具注册与执行
  lib/memory-api.ts       前端记忆 API 客户端
docs/superpowers/specs/   设计文档
```

## 技术栈

- **前端**：Next.js 15 + React + TypeScript + Tailwind CSS + shadcn/ui
- **后端**：Next.js API Routes + SQLite (better-sqlite3)
- **桌面**：Electron
- **测试**：Vitest
- **包管理**：pnpm

## 设计文档

- [记忆分层设计](./docs/superpowers/specs/2026-06-20-agenthub-memory-layer-design.md)
- [记忆模式与 Token 规则](./docs/superpowers/specs/2026-06-21-agenthub-memory-mode-token-rules.md)
- [DAG 协作设计](./docs/superpowers/specs/2026-06-19-collaboration-dag-design.md)
- [记忆系统总架构](./docs/superpowers/specs/2026-06-23-agenthub-memory-architecture.md)

## 许可

MIT