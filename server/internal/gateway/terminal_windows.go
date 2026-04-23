//go:build windows

// Package gateway 的终端 WebSocket Windows 平台占位实现。
//
// 当前项目使用 github.com/creack/pty 实现伪终端，该库在 Windows 下需要搭配
// ConPTY 做较多额外工作；为保持工程简单，Windows 平台直接返回 501 Not Implemented。
// 如后续需要支持 Windows，可以引入 github.com/UserExistsError/conpty 之类的库替换本文件。

package gateway

import (
	"log"
	"net/http"
)

// handleTerminalWebSocket Windows 平台占位：直接拒绝连接并返回 501。
// 不做 WebSocket 升级，直接返回 HTTP 错误，前端会收到普通 HTTP 响应并提示"服务端不支持终端"。
func (s *Server) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Printf("[Terminal] Windows platform is not supported: %s", r.RemoteAddr)
	http.Error(w, "terminal is not supported on windows server", http.StatusNotImplemented)
}
