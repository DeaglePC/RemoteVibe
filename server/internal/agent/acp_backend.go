package agent

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"

	"agentinhand/internal/acp"
	"agentinhand/internal/config"
)

// ACPBackend 通过 ACP (Agent Communication Protocol, JSON-RPC 2.0 over stdio) 与 Agent 通信。
// 目前仅 Gemini CLI 支持此协议。
type ACPBackend struct {
	def    config.AgentDef
	cmd    *exec.Cmd
	client *acp.Client
	cb     *BackendCallbacks
	mu     sync.Mutex
	done   chan struct{}
}

// NewACPBackend 创建一个 ACP 模式的后端
func NewACPBackend(def config.AgentDef) *ACPBackend {
	return &ACPBackend{
		def:  def,
		done: make(chan struct{}),
	}
}

// Mode 返回后端模式标识
func (b *ACPBackend) Mode() string {
	return "acp"
}

// SetCallbacks 设置事件回调
func (b *ACPBackend) SetCallbacks(cb *BackendCallbacks) {
	b.cb = cb
}

// SessionID 返回当前会话 ID
func (b *ACPBackend) SessionID() string {
	if b.client != nil {
		return b.client.SessionID()
	}
	return ""
}

// Start 启动 ACP 后端：启动子进程 → ACP 握手 → 创建或恢复会话。
// model 参数在 ACP 模式下暂不使用（通过 ~/.gemini/settings.json 配置）。
func (b *ACPBackend) Start(workDir string, sessionID string, model string) error {
	b.mu.Lock()

	log.Printf("[ACPBackend] Building command: %s %v (workDir=%s, resumeSession=%s)",
		b.def.Command, b.def.Args, workDir, sessionID)

	// 构建命令
	b.cmd = exec.Command(b.def.Command, b.def.Args...)
	if workDir != "" {
		b.cmd.Dir = workDir
	}
	b.cmd.Stderr = os.Stderr

	// 设置管道
	stdin, err := b.cmd.StdinPipe()
	if err != nil {
		b.mu.Unlock()
		return fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := b.cmd.StdoutPipe()
	if err != nil {
		b.mu.Unlock()
		return fmt.Errorf("stdout pipe: %w", err)
	}

	// 启动进程
	log.Printf("[ACPBackend] Starting process...")
	if err := b.cmd.Start(); err != nil {
		b.mu.Unlock()
		return fmt.Errorf("start process: %w", err)
	}

	log.Printf("[ACPBackend] Started %s (PID: %d)", b.def.Name, b.cmd.Process.Pid)

	// 创建 ACP client
	b.client = acp.NewClient(stdout, stdin)
	b.wireACPCallbacks()
	b.client.Start()

	b.mu.Unlock()

	// 监控进程退出
	go func() {
		waitErr := b.cmd.Wait()
		b.mu.Lock()
		if b.client != nil {
			b.client.Stop()
		}
		b.mu.Unlock()

		if waitErr != nil {
			log.Printf("[ACPBackend] Process %s exited with error: %v", b.def.Name, waitErr)
		} else {
			log.Printf("[ACPBackend] Process %s exited normally", b.def.Name)
		}

		if b.cb != nil && b.cb.OnDisconnect != nil {
			b.cb.OnDisconnect(waitErr)
		}
	}()

	// ACP 握手
	log.Printf("[ACPBackend] Sending ACP initialize handshake...")
	initResult, err := b.client.Initialize()
	if err != nil {
		log.Printf("[ACPBackend] ACP initialize failed: %v", err)
		b.Stop()
		return fmt.Errorf("ACP initialize: %w", err)
	}

	log.Printf("[ACPBackend] ACP initialized: %s v%s (loadSession=%v)",
		initResult.AgentInfo.Name, initResult.AgentInfo.Version,
		initResult.AgentCapabilities.LoadSession)

	// 确定工作目录
	sessionCwd := workDir
	if sessionCwd == "" {
		sessionCwd, _ = os.Getwd()
	}

	// 恢复或创建会话
	if sessionID != "" && b.client.SupportsLoadSession() {
		log.Printf("[ACPBackend] Loading session %s (cwd=%s)...", sessionID, sessionCwd)
		sid, err := b.client.SessionLoad(sessionID, sessionCwd)
		if err != nil {
			log.Printf("[ACPBackend] Failed to load session %s, falling back to new: %v", sessionID, err)
			sid, err = b.client.SessionNew(sessionCwd)
			if err != nil {
				b.Stop()
				return fmt.Errorf("ACP session/new fallback: %w", err)
			}
			log.Printf("[ACPBackend] Fallback session created: %s", sid)
		} else {
			log.Printf("[ACPBackend] Session loaded: %s", sid)
		}
	} else {
		log.Printf("[ACPBackend] Creating new session (cwd=%s)...", sessionCwd)
		sid, err := b.client.SessionNew(sessionCwd)
		if err != nil {
			b.Stop()
			return fmt.Errorf("ACP session/new: %w", err)
		}
		log.Printf("[ACPBackend] Session created: %s", sid)
	}

	log.Printf("[ACPBackend] Agent is now running, sessionID=%s", b.client.SessionID())
	return nil
}

// SendPrompt 通过 ACP 协议发送用户提示
func (b *ACPBackend) SendPrompt(text string) error {
	if b.client == nil {
		return fmt.Errorf("ACP client not ready")
	}
	return b.client.SendPrompt(text)
}

// RespondPermission 回复 ACP 权限请求
func (b *ACPBackend) RespondPermission(requestID any, optionID string) error {
	if b.client == nil {
		return fmt.Errorf("ACP client not ready")
	}
	return b.client.RespondPermission(requestID, optionID)
}

// Cancel 取消当前 ACP 会话操作
func (b *ACPBackend) Cancel() error {
	if b.client == nil {
		return fmt.Errorf("ACP client not ready")
	}
	return b.client.Cancel()
}

// Stop 停止 ACP 后端
func (b *ACPBackend) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	select {
	case <-b.done:
		return
	default:
		close(b.done)
	}

	if b.client != nil {
		b.client.Cancel()
		b.client.Stop()
	}

	if b.cmd != nil && b.cmd.Process != nil {
		b.cmd.Process.Kill()
	}
}

// wireACPCallbacks 将 ACP client 的回调桥接到 BackendCallbacks
func (b *ACPBackend) wireACPCallbacks() {
	if b.client == nil {
		return
	}

	b.client.OnMessageChunk = func(chunk *acp.AgentMessageChunk) {
		if b.cb != nil && b.cb.OnMessageChunk != nil {
			b.cb.OnMessageChunk(chunk.Content.Text)
		}
	}

	b.client.OnThoughtChunk = func(chunk *acp.AgentThoughtChunk) {
		if b.cb != nil && b.cb.OnThoughtChunk != nil {
			b.cb.OnThoughtChunk(chunk.Content.Text)
		}
	}

	b.client.OnToolCall = func(tc *acp.ToolCall) {
		if b.cb != nil && b.cb.OnToolCall != nil {
			b.cb.OnToolCall(&ToolCallEvent{
				ToolCallID: tc.ToolCallID,
				Title:      tc.Title,
				Kind:       tc.Kind,
				Status:     tc.Status,
				Content:    convertACPToolCallContent(tc.Content),
				Locations:  convertACPToolCallLocations(tc.Locations),
			})
		}
	}

	b.client.OnToolCallUpdate = func(tcu *acp.ToolCallStatusUpdate) {
		if b.cb != nil && b.cb.OnToolCallUpdate != nil {
			b.cb.OnToolCallUpdate(&ToolCallUpdateEvent{
				ToolCallID: tcu.ToolCallID,
				Status:     tcu.Status,
				Content:    convertACPToolCallContent(tcu.Content),
			})
		}
	}

	b.client.OnPlanUpdate = func(plan *acp.PlanUpdate) {
		if b.cb != nil && b.cb.OnPlanUpdate != nil {
			entries := make([]PlanEntryEvent, len(plan.Entries))
			for i, e := range plan.Entries {
				entries[i] = PlanEntryEvent{
					Content:  e.Content,
					Priority: e.Priority,
					Status:   e.Status,
				}
			}
			b.cb.OnPlanUpdate(entries)
		}
	}

	b.client.OnPermissionReq = func(id any, params *acp.PermissionRequestParams) {
		if b.cb != nil && b.cb.OnPermissionReq != nil {
			options := make([]PermOptionEvent, len(params.Options))
			for i, o := range params.Options {
				options[i] = PermOptionEvent{
					OptionID: o.OptionID,
					Name:     o.Name,
					Kind:     o.Kind,
				}
			}
			b.cb.OnPermissionReq(id, params.ToolCall.ToolCallID, options)
		}
	}

	b.client.OnTurnComplete = func(result *acp.SessionPromptResult) {
		if b.cb != nil && b.cb.OnTurnComplete != nil {
			b.cb.OnTurnComplete(result.StopReason, result.ErrorMessage, nil)
		}
	}

	b.client.OnFileChange = func(path string, oldContent string, newContent string, isCreate bool) {
		if b.cb != nil && b.cb.OnFileChange != nil {
			b.cb.OnFileChange(path, oldContent, newContent, isCreate)
		}
	}

	b.client.OnACPLog = func(direction string, message string) {
		if b.cb != nil && b.cb.OnProtocolLog != nil {
			b.cb.OnProtocolLog(direction, message)
		}
	}

	b.client.OnUnknownEvent = func(eventType string, rawJSON string) {
		if b.cb != nil && b.cb.OnUnknownEvent != nil {
			b.cb.OnUnknownEvent(eventType, rawJSON)
		}
	}

	b.client.OnDisconnect = func(err error) {
		if b.cb != nil && b.cb.OnDisconnect != nil {
			b.cb.OnDisconnect(err)
		}
	}
}

// convertACPToolCallContent 将 ACP ToolCallContent 转换为统一格式
func convertACPToolCallContent(items []acp.ToolCallContent) []ToolCallContentEvent {
	if len(items) == 0 {
		return nil
	}
	result := make([]ToolCallContentEvent, len(items))
	for i, item := range items {
		evt := ToolCallContentEvent{Type: item.Type}
		switch item.Type {
		case "content":
			if item.Content != nil {
				evt.Type = "text"
				evt.Text = item.Content.Text
			}
		case "diff":
			evt.Path = item.Path
			evt.OldText = item.OldText
			evt.NewText = item.NewText
		case "terminal":
			evt.Type = "terminal"
			evt.Text = item.TerminalID
		}
		result[i] = evt
	}
	return result
}

// convertACPToolCallLocations 将 ACP ToolCallLocation 转换为统一格式
func convertACPToolCallLocations(items []acp.ToolCallLocation) []ToolCallLocationEvent {
	if len(items) == 0 {
		return nil
	}
	result := make([]ToolCallLocationEvent, len(items))
	for i, item := range items {
		result[i] = ToolCallLocationEvent{
			Path: item.Path,
			Line: item.Line,
		}
	}
	return result
}
