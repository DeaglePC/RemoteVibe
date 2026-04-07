这份 PRD 与技术方案将以“移动端原生体验”为核心，利用 ACP 协议的结构化通信能力，彻底取代传统的终端截获方案。

为了契合你正在打造的命令行体系，暂且将这个网关项目代号命名为 **BaoMiHua Agent Gateway**。

---

# BaoMiHua Agent Gateway - 第一阶段 (Phase 1)
## 产品需求文档 (PRD)

### 1. 产品愿景与定位
打破 AI Coding Agent 必须在电脑屏幕前、通过终端或厚重 IDE 交互的物理限制。将移动设备（手机/平板）转化为家庭内网 AI Agent 的**“原生控制中枢与审批面板”**。让代码 Review、高危指令授权和思维链追踪，如同回复聊天消息一样自然。

### 2. 第一阶段核心目标 (MVP)
* **协议级接管：** 放弃 ANSI 终端流解析，全面实现 ACP (Agent Client Protocol) 的 Client 端代理逻辑。
* **无缝兼容：** 首批完美支持基于 ACP 的标准 Agent，如 OpenCode、Gemini CLI 等。
* **移动端原生化：** 实现 PWA (Progressive Web App) 移动端界面，将核心的 ACP 请求（特别是需人工介入的阻塞式请求）渲染为美观的 UI 卡片。

### 3. 核心业务流程 (User Flows)
1.  **Agent 唤醒与连接：** 用户在手机端点击“启动 OpenCode”，后端在 PC 上以 ACP 模式 (`stdio`) 拉起对应进程，手机端进入对话态。
2.  **思维链展示 (Streaming)：** Agent 思考过程中的 Markdown 输出，在手机端以聊天气泡形式流式渲染，支持代码块高亮。
3.  **高危操作审批 (Human-in-the-loop)：**
    * 当 Agent 尝试执行 Bash 命令或修改核心文件时，触发 ACP `tool_call`。
    * 后端挂起 Agent，向手机端推送一条【授权卡片】。
    * 用户点击【Approve】或【Reject】，手机端回传指令，Agent 继续执行。
4.  **代码 Diff 审查：** Agent 提议修改代码时，手机端以类似 GitHub PR 的分屏/单行 Diff 组件进行展示，清晰展现修改上下文。

---

## 技术方案设计 (Technical Architecture)

本方案采用经典的 **“胖后端代理 + 瘦前端渲染”** 架构，最大化复用开发效能与系统级控制力。



### 1. 架构总览
* **后端核心 (BaoMiHua Daemon)：** 使用 **Go** 语言开发。充当 ACP Server Proxy，管理本地 Agent 的进程生命周期，并维持与前端的长连接。
* **前端展示 (Web/PWA)：** 使用 **React + TailwindCSS** 构建。通过配置 Manifest 和 Service Worker，打包为 PWA，实现类似原生 App 的全屏与沉浸式体验。
* **反向代理与网络：** 使用 **Nginx** 进行端口转发和 WebSocket 的 `Upgrade` 处理，方便在内网或通过内网穿透进行安全访问。

### 2. 后端技术实现 (Go Daemon)

Go 后端需要扮演“欺上瞒下”的角色：对前端它是一个 WebSocket Server，对 Agent 它是一个伪装的 IDE (ACP Client)。

**2.1 进程与协议管理 (Subprocess & ACP Bridge)**
* **启动模式：** 使用 Go 的 `os/exec` 包启动 Agent 子进程。绝大多数 ACP Agent 支持通过标准输入输出交互（例如 `exec.Command("opencode", "acp")`）。
* **管道劫持：** 将子进程的 `Stdout` 和 `Stdin` 接管。ACP 底层是标准的 **JSON-RPC 2.0** 协议。
* **JSON-RPC 解析器：** 在 Go 中实现一个循环读取 `Stdout` 的 Decoder，将逐行的 JSON 字符串反序列化为 Go 结构体。

**2.2 会话状态机 (State Machine)**
* 由于 JSON-RPC 是异步的，后端需要维护一个 Map：`map[string]chan Response`。
* 当前端下发 Prompt 时，Go 生成一个带有 `id` 的 JSON-RPC Request 写入子进程 `Stdin`。
* 当 Agent 请求调用工具（例如 `method: "workspace/executeCommand"`）并附带 `id` 时，Go 将此请求转化为 WebSocket 消息发给前端，并**阻塞**当前协程，等待前端的 WebSocket 回复，再将回复通过 `Stdin` 喂给 Agent。

**2.3 通信总线 (WebSocket Gateway)**
* 使用 `gorilla/websocket` 建立全双工通道。
* 定义内部数据包结构（封包/拆包）：
    ```json
    {
      "channel": "acp_event", // 区分是纯文本、状态更新还是交互卡片
      "type": "tool_authorization",
      "payload": { ... } // 具体的 Diff 数据或命令文本
    }
    ```

### 3. 前端技术实现 (React PWA)

前端抛弃所有关于“终端”的 UI 概念，将其设计为一个现代化的 ChatOps 面板。

**3.1 UI 组件库选型与重构**
* **聊天流 (Message List)：** 引入 `react-markdown` 配合 `remark-gfm` 和 `highlight.js`，完美渲染 Agent 的思考文本和代码片段。
* **结构化卡片 (Action Cards)：** 针对 ACP 的特定 `method` 开发独立组件。
    * `<CommandConfirmCard />`：展示待执行的命令文本，配有通过/拒绝按钮。
    * `<DiffViewerCard />`：引入 `react-diff-viewer` 等库，将后台传来的旧代码与新代码片段，渲染成直观的红绿对比图。

**3.2 状态管理与连接恢复**
* 维持 WebSocket 心跳。
* 断线重连逻辑：由于 Go 后端维护了 Agent 进程的生命周期，即便手机在地铁上信号中断，Agent 依然在 PC 上挂起等待。PWA 重新连上后，拉取最新的待审批状态队列，即可无缝继续操作。

### 4. 核心数据流转时序 (以 OpenCode 提议修改代码为例)

1.  **用户 (PWA):** 输入框发送 "把 server.go 里的端口改成 8080" $\rightarrow$ 发送 WS 消息。
2.  **Go Daemon:** 接收 WS 消息 $\rightarrow$ 构造 JSON-RPC 格式 $\rightarrow$ 写入 `opencode` 的 `Stdin`。
3.  **OpenCode:** 收到请求，计算 Diff $\rightarrow$ 向 `Stdout` 写入 JSON-RPC 请求，Method 为 `textDocument/applyEdit`，携带 Diff 数据。
4.  **Go Daemon:** 拦截到 `Stdout` 输出 $\rightarrow$ 解析 JSON $\rightarrow$ 识别到需要用户审批 $\rightarrow$ 封装为 `DiffViewerCard` 需要的数据格式 $\rightarrow$ 通过 WS 推送给 PWA，并挂起等待。
5.  **用户 (PWA):** 屏幕弹出一个漂亮的 Diff 对比卡片 $\rightarrow$ 点击 [Approve] $\rightarrow$ 发送包含操作结果的 WS 消息。
6.  **Go Daemon:** 收到 Approve 消息 $\rightarrow$ 构造 JSON-RPC Response (返回成功状态) $\rightarrow$ 写入 `opencode` 的 `Stdin`。
7.  **OpenCode:** 收到许可，将修改真正落盘，并继续后续输出。