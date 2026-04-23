//go:build !windows

// Package gateway 的终端 WebSocket 处理逻辑（PTY 版）。
//
// 该文件实现 /ws/terminal 端点：前端以 xterm.js 为前端终端，
// 服务端通过伪终端（PTY）启动一个长驻 shell（zsh/bash/sh），把用户的按键字节
// 直接写入 PTY master，PTY master 的输出字节流回前端由 xterm 渲染。
// 由此获得完整的交互式终端体验：颜色、光标控制、top/vim/htop、Tab 补全、Ctrl+C 等。
//
// 消息协议：
//   客户端 → 服务端：
//     - 二进制帧：直接作为用户键入字节写入 PTY
//     - 文本帧 JSON：{"type":"resize","cols":N,"rows":N} 调整窗口大小
//       {"type":"ping"} 心跳（可选）
//   服务端 → 客户端：
//     - 二进制帧：PTY 输出的原始字节
//     - 文本帧 JSON：{"type":"hello",...} 连接建立，附带 shell/cwd
//       {"type":"exit","code":N} shell 退出
//       {"type":"error","message":"..."} 错误
//
// 注意：
//   - 复用 authMiddleware 做 token 鉴权（与 /ws 一致）。
//   - 本端点开放 shell 执行能力，必须依赖 token 鉴权。若 s.cfg.Auth.Token 为空则完全开放，
//     与项目现有 /ws 通道策略保持一致（由运维配置决定）。
//   - Windows 平台不支持，由 terminal_windows.go 提供的占位实现返回错误。

package gateway

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// terminalClientCtrlMsg 是前端通过文本帧发送的控制消息。
// 普通按键输入直接走二进制帧，不再使用 JSON 包装。
type terminalClientCtrlMsg struct {
	Type string `json:"type"`           // "resize" | "ping"
	Cols uint16 `json:"cols,omitempty"` // resize 时的列数
	Rows uint16 `json:"rows,omitempty"` // resize 时的行数
}

// terminalServerCtrlMsg 是服务端通过文本帧下发的控制消息。
// 命令输出统一走二进制帧，不再经过 JSON。
type terminalServerCtrlMsg struct {
	Type    string `json:"type"`              // "hello" | "exit" | "error" | "pong"
	Shell   string `json:"shell,omitempty"`   // hello 时带上实际使用的 shell 路径
	Cwd     string `json:"cwd,omitempty"`     // hello 时的初始工作目录
	Code    int    `json:"code,omitempty"`    // exit 时的退出码
	Message string `json:"message,omitempty"` // error 时的描述
}

// detectShell 按优先级探测一个可用的登录 shell：
//
//  1. $SHELL（若文件存在且可执行）
//  2. /bin/zsh
//  3. /bin/bash
//  4. /bin/sh（Unix 系统兜底一定存在）
//
// 返回选中的 shell 绝对路径。
func detectShell() string {
	candidates := []string{
		os.Getenv("SHELL"),
		"/bin/zsh",
		"/bin/bash",
		"/bin/sh",
	}
	for _, p := range candidates {
		if p == "" {
			continue
		}
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p
		}
	}
	// 理论不会到这里；保底返回 /bin/sh
	return "/bin/sh"
}

// handleTerminalWebSocket 处理 /ws/terminal 连接。
// 每条连接启动一个独立的 PTY + shell 进程，WebSocket 断开时 kill 进程组。
func (s *Server) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Terminal] WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[Terminal] Client connected: %s", conn.RemoteAddr())

	// writeMu 串行化所有 WebSocket 写操作（二进制帧 + 文本帧），gorilla/websocket 不支持并发写。
	var writeMu sync.Mutex
	writeCtrl := func(msg terminalServerCtrlMsg) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("[Terminal] WriteJSON error: %v", err)
		}
	}
	writeBinary := func(data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(websocket.BinaryMessage, data)
	}

	// 初始 cwd 从查询参数读取（前端连接时 URL 带上 cwd）。
	// 为空则由 shell 自己决定（用户 home 或进程 cwd）。
	initialCwd := r.URL.Query().Get("cwd")
	if initialCwd != "" {
		if info, err := os.Stat(initialCwd); err != nil || !info.IsDir() {
			// cwd 无效时忽略，不让它阻塞连接
			log.Printf("[Terminal] Ignore invalid cwd %q: %v", initialCwd, err)
			initialCwd = ""
		}
	}

	shellPath := detectShell()

	// 启动 shell 进程并挂到 PTY master 上
	execCmd := exec.Command(shellPath, "-l") // -l 让 zsh/bash 读取 profile，体验更接近真实终端
	if initialCwd != "" {
		execCmd.Dir = initialCwd
	}
	// 基础环境变量：继承父进程，并设置 TERM，避免终端应用（vim/less/htop）报错
	env := append(os.Environ(), "TERM=xterm-256color")
	execCmd.Env = env
	// 独立进程组便于统一 kill 子进程（如 shell 里又 fork 出 top）
	execCmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	ptmx, err := pty.Start(execCmd)
	if err != nil {
		writeCtrl(terminalServerCtrlMsg{Type: "error", Message: "pty start: " + err.Error()})
		return
	}
	defer func() {
		_ = ptmx.Close()
		// 进程可能已退出，Kill 出错忽略即可
		if execCmd.Process != nil {
			_ = execCmd.Process.Kill()
		}
	}()

	// 默认 80x24，前端连上后会立刻发 resize 覆盖
	_ = pty.Setsize(ptmx, &pty.Winsize{Cols: 80, Rows: 24})

	// 发送 hello
	writeCtrl(terminalServerCtrlMsg{
		Type:  "hello",
		Shell: shellPath,
		Cwd:   initialCwd,
	})

	// PTY → WebSocket：独立 goroutine 读 PTY 输出并以二进制帧下发
	ptyDone := make(chan struct{})
	go func() {
		defer close(ptyDone)
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				// 必须复制一份再发，因为 buf 会被下一轮复用
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				if werr := writeBinary(chunk); werr != nil {
					log.Printf("[Terminal] write binary error: %v", werr)
					return
				}
			}
			if err != nil {
				if !errors.Is(err, io.EOF) {
					log.Printf("[Terminal] pty read error: %v", err)
				}
				return
			}
		}
	}()

	// WebSocket → PTY：主循环读前端消息
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			if !errors.Is(err, io.EOF) && !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Printf("[Terminal] read error: %v", err)
			}
			break
		}

		switch msgType {
		case websocket.BinaryMessage:
			// 用户按键字节直接写入 PTY（包含 Ctrl+C=\x03、方向键、Tab 等）
			if _, werr := ptmx.Write(data); werr != nil {
				log.Printf("[Terminal] pty write error: %v", werr)
				break
			}

		case websocket.TextMessage:
			var ctrl terminalClientCtrlMsg
			if err := json.Unmarshal(data, &ctrl); err != nil {
				writeCtrl(terminalServerCtrlMsg{Type: "error", Message: "invalid JSON: " + err.Error()})
				continue
			}
			switch ctrl.Type {
			case "resize":
				if ctrl.Cols > 0 && ctrl.Rows > 0 {
					if err := pty.Setsize(ptmx, &pty.Winsize{Cols: ctrl.Cols, Rows: ctrl.Rows}); err != nil {
						log.Printf("[Terminal] pty setsize error: %v", err)
					}
				}
			case "ping":
				writeCtrl(terminalServerCtrlMsg{Type: "pong"})
			default:
				// 未知控制消息忽略，避免污染连接
			}
		}
	}

	// 连接断开时关闭 PTY 触发 shell 退出；等待 PTY 读协程收尾
	_ = ptmx.Close()
	<-ptyDone

	// 取退出码（如果有）
	code := 0
	if werr := execCmd.Wait(); werr != nil {
		if exitErr, ok := werr.(*exec.ExitError); ok {
			code = exitErr.ExitCode()
		} else {
			code = -1
		}
	}
	writeCtrl(terminalServerCtrlMsg{Type: "exit", Code: code})
	log.Printf("[Terminal] Client disconnected: %s (code=%d)", conn.RemoteAddr(), code)
}
