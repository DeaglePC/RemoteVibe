# Chat Runtime Status & Tool UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为聊天窗口增加统一底部状态条，并将 tool use 渲染升级为独立、跨 agent 通用的 UI。

**Architecture:** 前端以 `chatStore` 为中心统一收敛 agent 运行态信息，新增底部状态条组件与独立的 tool activity 面板；后端仅做最小协议补强，确保不同 agent 在统一协议下都能提供一致的状态字段。实现以最小侵入方式重组 `ChatView` 与 `InputBar`，避免继续分散状态来源。

**Tech Stack:** Go、React 19、TypeScript、Zustand、Vite。

---

### Task 1: 统一聊天运行态模型
- 修改 `web/src/stores/chatStore.ts`
- 修改 `web/src/types/protocol.ts`
- 修改 `web/src/hooks/useWebSocket.ts`
- 目标：把工作路径、模型、最近一轮统计、agent 活动类型统一沉淀到 store，并确保会话切换时状态一致。

### Task 2: 底部状态条 UI
- 新建 `web/src/components/ChatView/ChatStatusBar.tsx`
- 修改 `web/src/App.tsx`
- 修改 `web/src/components/ChatView/InputBar.tsx`
- 目标：在聊天窗口下方增加固定状态条，展示 agent、模式、工作路径、模型、上下文使用、最近一轮工具数/耗时等。

### Task 3: Tool use 独立 UI
- 新建 `web/src/components/ChatView/ToolActivityPanel.tsx`
- 修改 `web/src/components/Cards/ToolCallCard.tsx`
- 修改 `web/src/components/ChatView/ChatView.tsx`
- 目标：把 tool use 从聊天消息里剥离为独立区域，统一展示进行中/已完成/失败的工具调用与 diff、terminal、text 内容。

### Task 4: 后端协议补强
- 修改 `server/internal/gateway/protocol.go`
- 修改 `server/internal/gateway/handler.go`
- 如需要修改 `server/internal/agent/backend.go`
- 目标：补充前端状态条所需的可选运行态字段，保证 CLI/ACP agent 都能复用同一套协议。

### Task 5: 验证
- 运行 `go test ./...`（或至少 `./internal/gateway`）
- 运行前端 `npm run build`
- 运行前端 ESLint
- 如有必要补最小测试或修复类型错误
