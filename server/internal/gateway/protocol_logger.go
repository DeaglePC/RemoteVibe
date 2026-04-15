package gateway

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ProtocolLogger 将 TX/RX/stderr 协议日志写入本地文件，便于开发调试。
// 日志文件路径：~/.baomima-agent-gateway/protocol.log
// 每次服务启动时创建新文件（追加模式）。
type ProtocolLogger struct {
	file *os.File
	mu   sync.Mutex
}

// NewProtocolLogger 创建协议日志记录器
func NewProtocolLogger() *ProtocolLogger {
	dir, err := sessionsDataDir()
	if err != nil {
		log.Printf("[ProtocolLogger] Failed to get data dir: %v", err)
		return &ProtocolLogger{}
	}

	logPath := filepath.Join(dir, "protocol.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Printf("[ProtocolLogger] Failed to open log file %s: %v", logPath, err)
		return &ProtocolLogger{}
	}

	// 写入分隔线标记新的服务启动
	separator := fmt.Sprintf("\n========== Server started at %s ==========\n",
		time.Now().Format("2006-01-02 15:04:05"))
	f.WriteString(separator)

	log.Printf("[ProtocolLogger] Logging protocol to %s", logPath)
	return &ProtocolLogger{file: f}
}

// Log 写入一条协议日志
func (pl *ProtocolLogger) Log(direction string, message string) {
	if pl == nil || pl.file == nil {
		return
	}

	ts := time.Now().Format("15:04:05.000")

	// 方向标签对齐
	tag := "RX"
	switch direction {
	case "tx":
		tag = "TX"
	case "rx":
		tag = "RX"
	case "stderr":
		tag = "ERR"
	default:
		tag = direction
	}

	line := fmt.Sprintf("[%s] %s  %s\n", ts, tag, message)

	pl.mu.Lock()
	defer pl.mu.Unlock()
	pl.file.WriteString(line)
}

// Close 关闭日志文件
func (pl *ProtocolLogger) Close() {
	if pl == nil || pl.file == nil {
		return
	}
	pl.mu.Lock()
	defer pl.mu.Unlock()
	pl.file.Close()
	pl.file = nil
}
