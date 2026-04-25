package agent

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"

	"agentinhand/internal/config"
)

// CLIBackend 通过 CLI stream-json 模式与 Agent 通信。
// 参照 Multica 的设计，每次 SendPrompt 启动一个新的子进程，
// 进程执行完毕后自动退出。多轮对话通过 --resume sessionID 恢复。
//
// 不同 Agent 的参数传递方式：
//   - Claude Code: claude -p --output-format stream-json （通过 stdin 写入 JSON prompt，然后 Close stdin）
//   - Gemini CLI: gemini -p "prompt" --output-format stream-json （prompt 作为 -p 的参数值）
//   - Codex CLI: codex --quiet （通过 stdin 写入纯文本 prompt）
type CLIBackend struct {
	def config.AgentDef
	cmd *exec.Cmd
	cb  *BackendCallbacks
	mu  sync.Mutex
	done chan struct{}
	closed bool

	parser     StreamParser
	sessionID  string
	toolCallID int    // 自增的工具调用 ID 计数器
	workDir    string // 工作目录
	model      string // 运行时指定的模型名（空字符串使用 agent 默认）
	turnCount  int    // 已执行的 prompt 次数（用于判断是否需要 --resume）
}

// NewCLIBackend 创建一个 CLI 模式的后端
func NewCLIBackend(def config.AgentDef) *CLIBackend {
	return &CLIBackend{
		def:  def,
		done: make(chan struct{}),
	}
}

// Mode 返回后端模式标识
func (b *CLIBackend) Mode() string {
	return "cli"
}

// SetCallbacks 设置事件回调
func (b *CLIBackend) SetCallbacks(cb *BackendCallbacks) {
	b.cb = cb
}

// SessionID 返回当前会话 ID
func (b *CLIBackend) SessionID() string {
	return b.sessionID
}

// Start 初始化 CLI 后端（不启动进程，进程在 SendPrompt 时启动）。
// 参照 Multica 的设计：所有 CLI Agent 都是"每次 prompt 一个进程"。
func (b *CLIBackend) Start(workDir string, sessionID string, model string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// 根据 Agent 类型选择解析器，并传入 session ID 回调
	b.parser = NewStreamParser(b.def.ID, func(sid string) {
		b.mu.Lock()
		defer b.mu.Unlock()
		log.Printf("[CLIBackend] Received real session ID from init event: %s (was: %s)", sid, b.sessionID)
		b.sessionID = sid
	})
	b.workDir = workDir
	b.model = model

	// 记录外部传入的 session ID（如果有）。
	// 注意：对于 Gemini CLI，真正的 session ID 只能从 init 事件获取，
	// 不应在此处自行生成，否则 --resume 会因为格式不合法而报错。
	// 对于 Claude，session ID 也从 result 事件获取。
	// 只有外部明确传入（如恢复已有会话）时才使用。
	if sessionID != "" {
		b.sessionID = sessionID
	}

	log.Printf("[CLIBackend] Initialized %s (workDir=%s, session=%s). Process will launch on SendPrompt.",
		b.def.Name, workDir, b.sessionID)
	return nil
}

// SendPrompt 向 CLI Agent 发送 prompt。
// 参照 Multica 的 Execute 方法：每次启动一个新的子进程。
// 第二次及以后的 prompt 使用 --resume 恢复会话。
func (b *CLIBackend) SendPrompt(text string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// 如果上一个进程还在运行，先停止它
	b.stopCurrentProcess()

	b.turnCount++
	log.Printf("[CLIBackend] Turn #%d: launching new process for prompt", b.turnCount)

	if b.cb != nil && b.cb.OnProtocolLog != nil {
		b.cb.OnProtocolLog("tx", fmt.Sprintf("[turn #%d] %s", b.turnCount, text))
	}

	// 构建命令行参数
	args := b.buildArgs(text)

	log.Printf("[CLIBackend] Command: %s %v (workDir=%s)", b.def.Command, args, b.workDir)

	b.cmd = exec.Command(b.def.Command, args...)
	if b.workDir != "" {
		b.cmd.Dir = b.workDir
	}

	// 设置 stdout 管道
	stdoutPipe, err := b.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	// 设置 stderr 管道（捕获错误信息推送给前端）
	stderrPipe, err := b.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	// 设置 stdin 管道（Claude 需要通过 stdin 写入 prompt）
	stdinPipe, err := b.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}

	// 启动进程
	if err := b.cmd.Start(); err != nil {
		return fmt.Errorf("start process: %w", err)
	}

	log.Printf("[CLIBackend] Started %s (PID: %d)", b.def.Name, b.cmd.Process.Pid)

	// 根据 Agent 类型写入 stdin
	b.writeStdinPrompt(stdinPipe, text)

	// 启动 stdout 读取循环
	go b.readLoop(stdoutPipe)

	// 启动 stderr 读取循环（捕获错误信息推送给前端）
	go b.stderrLoop(stderrPipe)

	// 监控进程退出
	go b.waitProcess()

	return nil
}

// buildArgs 根据 Agent 类型构建命令行参数。
// 参照 Multica 中 buildGeminiArgs / buildClaudeArgs 的实现。
func (b *CLIBackend) buildArgs(prompt string) []string {
	args := make([]string, 0, len(b.def.Args)+4)

	switch b.def.ID {
	case "gemini-cli", "gemini":
		// Gemini CLI: -p "prompt" --yolo -o stream-json
		for _, arg := range b.def.Args {
			args = append(args, arg)
			if arg == "-p" || arg == "--prompt" {
				args = append(args, prompt)
			}
		}
		// 运行时指定的模型覆盖默认模型
		if b.model != "" {
			args = append(args, "--model", b.model)
		}
		// 只有拿到真正的 session ID（从 init 事件获取）后才使用 --resume。
		if b.turnCount > 1 && b.sessionID != "" {
			args = append(args, "--resume", b.sessionID)
		}

	case "claude":
		// Claude Code: -p --output-format stream-json
		// -p 是 pipe 模式，prompt 通过 stdin 以 JSON 格式写入（参照 Multica 的 claude.go）
		args = append(args, b.def.Args...)
		// 第二轮及以后使用 --resume
		if b.turnCount > 1 && b.sessionID != "" {
			args = append(args, "--resume", b.sessionID)
		}

	case "codex":
		// codex exec "prompt" [--model MODEL]
		// Args = ["exec"], prompt 作为位置参数追加
		args = append(args, b.def.Args...)
		args = append(args, prompt)
		if b.model != "" {
			args = append(args, "--model", b.model)
		}

	default:
		// 其他 Agent：直接使用配置的 args
		args = append(args, b.def.Args...)
	}

	return args
}

// writeStdinPrompt 根据 Agent 类型通过 stdin 写入 prompt。
// Claude Code: 通过 stdin 写入 JSON 格式的 user message，然后 Close stdin
// Gemini CLI: prompt 已作为 -p 参数传入，不需要 stdin
// Codex: 通过 stdin 写入纯文本
func (b *CLIBackend) writeStdinPrompt(stdin io.WriteCloser, prompt string) {
	switch b.def.ID {
	case "claude":
		// 参照 Multica claude.go 的 buildClaudeInput + writeClaudeInput：
		// 通过 stdin 写入 JSON 格式的 user message，然后关闭 stdin
		go func() {
			defer stdin.Close()
			input := buildClaudeStdinInput(prompt)
			if _, err := stdin.Write(input); err != nil {
				log.Printf("[CLIBackend] Failed to write stdin for Claude: %v", err)
			}
		}()

	case "gemini-cli", "gemini":
		// Gemini CLI: prompt 已作为 -p 的参数值传入，直接关闭 stdin
		stdin.Close()

	case "codex":
		// codex exec: prompt 已作为命令行参数传入，直接关闭 stdin
		stdin.Close()

	default:
		// 默认：通过 stdin 写入纯文本
		go func() {
			defer stdin.Close()
			if _, err := fmt.Fprintln(stdin, prompt); err != nil {
				log.Printf("[CLIBackend] Failed to write stdin: %v", err)
			}
		}()
	}
}

// buildClaudeStdinInput 构建 Claude Code 的 stdin JSON 输入。
// 参照 Multica claude.go 的 buildClaudeInput 函数。
func buildClaudeStdinInput(prompt string) []byte {
	payload := map[string]any{
		"type": "user",
		"message": map[string]any{
			"role": "user",
			"content": []map[string]string{
				{"type": "text", "text": prompt},
			},
		},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		// fallback: 直接发送纯文本
		log.Printf("[CLIBackend] Failed to marshal Claude input JSON, falling back to plain text: %v", err)
		return []byte(prompt + "\n")
	}
	return append(data, '\n')
}

// readLoop 从子进程的 stdout 读取 NDJSON 事件并分发
func (b *CLIBackend) readLoop(stdout io.ReadCloser) {
	scanner := bufio.NewScanner(stdout)
	// 增大缓冲区以支持大块 JSON 消息（参照 Multica 的 10MB 限制）
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	turnCompleted := false // 标记是否已经由 result/error 事件发送过 turn_complete

	for scanner.Scan() {
		select {
		case <-b.done:
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		// 记录协议日志
		if b.cb != nil && b.cb.OnProtocolLog != nil {
			b.cb.OnProtocolLog("rx", line)
		}

		// 解析 JSON 行
		var raw json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			// 不是 JSON，可能是纯文本输出，作为 message 推送
			log.Printf("[CLIBackend] Non-JSON line: %s", line)
			if b.cb != nil && b.cb.OnMessageChunk != nil {
				b.cb.OnMessageChunk(line + "\n")
			}
			continue
		}

		// 检查是否是 result 或 error 类型（parser 会触发 OnTurnComplete）
		var typeCheck struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &typeCheck); err == nil {
			if typeCheck.Type == "result" || typeCheck.Type == "error" {
				turnCompleted = true
			}
		}

		// 使用 parser 解析并分发事件
		b.parser.Parse(raw, b.cb, &b.toolCallID)
	}

	if err := scanner.Err(); err != nil {
		select {
		case <-b.done:
			// 主动关闭，忽略错误
		default:
			log.Printf("[CLIBackend] Scanner error: %v", err)
		}
	}

	// stdout 关闭表示进程结束。
	// 只有在 parser 没有已经发送过 turn_complete 时（即没收到 result/error 事件），
	// 才由 readLoop 兜底发送 turn_complete，避免重复。
	select {
	case <-b.done:
	default:
		if !turnCompleted && b.cb != nil && b.cb.OnTurnComplete != nil {
			b.cb.OnTurnComplete("end_turn", "", nil)
		}
	}
}

// stderrLoop 从子进程的 stderr 读取错误输出并推送给前端。
// Gemini CLI 的 429 等 API 错误会输出到 stderr，需要捕获并展示。
func (b *CLIBackend) stderrLoop(stderr io.ReadCloser) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	// 累积 stderr 行，用于提取关键错误信息
	var stderrBuf strings.Builder
	for scanner.Scan() {
		select {
		case <-b.done:
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		// 记录到服务器日志
		log.Printf("[CLIBackend:stderr] %s", line)

		// 记录为协议日志（让前端 ACP Log Panel 也能看到）
		if b.cb != nil && b.cb.OnProtocolLog != nil {
			b.cb.OnProtocolLog("stderr", line)
		}

		stderrBuf.WriteString(line)
		stderrBuf.WriteString("\n")

		// 检测关键错误模式并立即推送给前端
		if b.cb != nil && b.cb.OnMessageChunk != nil {
			errMsg := extractStderrError(line)
			if errMsg != "" {
				b.cb.OnMessageChunk("\n> **Error:** " + errMsg + "\n")
			}
		}
	}
}

// extractStderrError 从 stderr 行中提取关键错误信息。
// 返回空字符串表示该行不包含需要展示的错误。
func extractStderrError(line string) string {
	// Gemini CLI 429 rate limit 错误
	if strings.Contains(line, "No capacity available for model") {
		return line
	}
	// 通用的 "Attempt N failed" 摘要行
	if strings.HasPrefix(line, "Attempt ") && strings.Contains(line, "failed with status") {
		return line
	}
	// 认证错误
	if strings.Contains(line, "authentication") || strings.Contains(line, "unauthorized") || strings.Contains(line, "UNAUTHENTICATED") {
		return line
	}
	// 网络错误
	if strings.Contains(line, "ECONNREFUSED") || strings.Contains(line, "ETIMEDOUT") || strings.Contains(line, "network error") {
		return line
	}
	// 模型不存在
	if strings.Contains(line, "model not found") || strings.Contains(line, "MODEL_NOT_FOUND") {
		return line
	}
	return ""
}

// waitProcess 等待当前进程退出并更新 session ID
func (b *CLIBackend) waitProcess() {
	if b.cmd == nil {
		return
	}

	waitErr := b.cmd.Wait()

	b.mu.Lock()
	wasClosed := b.closed
	b.mu.Unlock()

	if waitErr != nil && !wasClosed {
		log.Printf("[CLIBackend] Process %s exited with error: %v", b.def.Name, waitErr)
	} else {
		log.Printf("[CLIBackend] Process %s exited normally", b.def.Name)
	}
}

// stopCurrentProcess 停止当前正在运行的子进程
func (b *CLIBackend) stopCurrentProcess() {
	if b.cmd != nil && b.cmd.Process != nil {
		log.Printf("[CLIBackend] Stopping previous process (PID: %d)", b.cmd.Process.Pid)
		b.cmd.Process.Kill()
		b.cmd = nil
	}
}

// RespondPermission CLI 模式不支持交互式权限请求
func (b *CLIBackend) RespondPermission(_ any, _ string) error {
	return fmt.Errorf("permission response not supported in CLI mode (use --yolo or auto-approve flags)")
}

// Cancel 通过发送信号取消当前执行
func (b *CLIBackend) Cancel() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.cmd != nil && b.cmd.Process != nil {
		// 先尝试发送 SIGINT
		if err := b.cmd.Process.Signal(os.Interrupt); err != nil {
			// 如果 SIGINT 失败，发送 SIGKILL
			return b.cmd.Process.Kill()
		}
	}
	return nil
}

// Stop 停止 CLI 后端
func (b *CLIBackend) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.closed = true

	select {
	case <-b.done:
		return
	default:
		close(b.done)
	}

	// 停止当前进程
	b.stopCurrentProcess()
}
