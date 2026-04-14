package agent

// Backend 是 Agent 通信后端的统一接口。
// 无论底层是 ACP (JSON-RPC 2.0) 还是 CLI (pipe/stream-json)，
// 都通过此接口向上层提供一致的事件流和控制方法。
type Backend interface {
	// Start 启动后端连接（ACP 握手或 CLI 子进程启动）
	Start(workDir string, sessionID string) error

	// SendPrompt 向 Agent 发送用户提示。
	// Agent 的响应通过 Callbacks 异步推送。
	SendPrompt(text string) error

	// RespondPermission 回复 Agent 的权限请求（仅 ACP 模式支持）
	RespondPermission(requestID any, optionID string) error

	// Cancel 取消当前正在执行的操作
	Cancel() error

	// Stop 停止后端并释放资源
	Stop()

	// SetCallbacks 设置事件回调
	SetCallbacks(cb *BackendCallbacks)

	// SessionID 返回当前会话 ID
	SessionID() string

	// Mode 返回后端模式标识
	Mode() string
}

// BackendCallbacks 是 Backend 推送事件到上层的回调集合。
// 这些回调会被映射到 WebSocket 消息发送给前端。
type BackendCallbacks struct {
	// OnMessageChunk 流式文本消息块
	OnMessageChunk func(text string)

	// OnThoughtChunk 思考/推理过程文本块
	OnThoughtChunk func(text string)

	// OnToolCall 工具调用开始
	OnToolCall func(tc *ToolCallEvent)

	// OnToolCallUpdate 工具调用状态更新
	OnToolCallUpdate func(tcu *ToolCallUpdateEvent)

	// OnPlanUpdate 计划更新
	OnPlanUpdate func(entries []PlanEntryEvent)

	// OnPermissionReq 权限请求（仅 ACP 模式）
	OnPermissionReq func(id any, toolCallID string, options []PermOptionEvent)

	// OnTurnComplete 一轮对话结束。stats 可为 nil（非 result 事件触发时）。
	OnTurnComplete func(stopReason string, errorMessage string, stats *TurnStats)

	// OnFileChange 文件变更通知
	OnFileChange func(path string, oldContent string, newContent string, isCreate bool)

	// OnProtocolLog 协议日志（ACP 的 TX/RX 或 CLI 的 stdout 行）
	OnProtocolLog func(direction string, message string)

	// OnUnknownEvent 未识别事件
	OnUnknownEvent func(eventType string, rawJSON string)

	// OnDisconnect 后端断开
	OnDisconnect func(err error)
}

// ToolCallEvent 表示一次工具调用事件
type ToolCallEvent struct {
	ToolCallID string
	Title      string
	Kind       string // read, edit, delete, execute, think 等
	Status     string // pending, in_progress, completed, failed
	Content    []ToolCallContentEvent
	Locations  []ToolCallLocationEvent
}

// ToolCallUpdateEvent 表示工具调用的状态更新
type ToolCallUpdateEvent struct {
	ToolCallID string
	Status     string
	Content    []ToolCallContentEvent
}

// ToolCallContentEvent 是工具调用内容的统一表示
type ToolCallContentEvent struct {
	Type    string // "text", "diff", "terminal"
	Text    string
	Path    string
	OldText string
	NewText string
}

// ToolCallLocationEvent 是工具调用位置信息
type ToolCallLocationEvent struct {
	Path string
	Line int
}

// PlanEntryEvent 表示计划中的一个条目
type PlanEntryEvent struct {
	Content  string
	Priority string
	Status   string
}

// PermOptionEvent 表示权限请求的一个选项
type PermOptionEvent struct {
	OptionID string
	Name     string
	Kind     string
}

// TurnStats 表示一轮对话结束时的统计信息（来自 result 事件）
type TurnStats struct {
	TotalTokens  int    `json:"totalTokens,omitempty"`
	InputTokens  int    `json:"inputTokens,omitempty"`
	OutputTokens int    `json:"outputTokens,omitempty"`
	CachedTokens int    `json:"cachedTokens,omitempty"`
	DurationMs   int    `json:"durationMs,omitempty"`
	ToolCalls    int    `json:"toolCalls,omitempty"`
	Model        string `json:"model,omitempty"`
}
