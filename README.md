# RemoteVibe - BaoMiHua Agent Gateway

将移动设备（手机/平板）转化为家庭内网 AI Agent 的**原生控制中枢与审批面板**。通过 ACP 协议实现 Agent 的远程管理、思维链展示与高危操作审批。

## 项目结构

```
RemoteVibe/
├── server/          # Go 后端 - WebSocket 网关 & ACP 代理
│   ├── main.go
│   ├── go.mod
│   ├── go.sum
│   ├── config.example.yaml
│   └── internal/
│       ├── acp/       # ACP 协议客户端
│       ├── agent/     # Agent 进程管理
│       ├── config/    # 配置加载
│       └── gateway/   # WebSocket 网关
├── web/             # React 前端 - PWA 移动端界面
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
└── PRD.md           # 产品需求文档
```

## 快速开始

### 一键启动（推荐）

```bash
./dev.sh          # 同时启动前端和后端
./dev.sh server   # 仅启动后端
./dev.sh web      # 仅启动前端
```

### 后端

```bash
cd server
cp config.example.yaml config.yaml
# 按需编辑 config.yaml
go run main.go
```

### 前端

```bash
cd web
npm install
npm run dev
```

前端开发服务器默认运行在 `http://localhost:5173`，并自动代理 WebSocket 和 API 请求到后端 `http://localhost:3710`。

## 技术栈

- **后端**: Go + gorilla/websocket + JSON-RPC 2.0
- **前端**: React 19 + TypeScript + Vite + TailwindCSS + Zustand
- **协议**: ACP (Agent Client Protocol)
