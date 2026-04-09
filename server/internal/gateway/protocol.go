package gateway

import "encoding/json"

// ==================== Frontend → Backend Messages ====================

// ClientMessage is the envelope for all client-to-server messages
type ClientMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// StartAgentPayload requests launching an agent
type StartAgentPayload struct {
	AgentID          string `json:"agentId"`
	WorkDir          string `json:"workDir,omitempty"`
	GeminiSessionID  string `json:"geminiSessionId,omitempty"` // 非空时恢复 Gemini CLI 原生会话
}

// SendPromptPayload sends a user message to the agent
type SendPromptPayload struct {
	Text string `json:"text"`
}

// PermissionResponsePayload responds to a permission request
type PermissionResponsePayload struct {
	RequestID interface{} `json:"requestId"`
	OptionID  string      `json:"optionId"`
}

// ==================== Backend → Frontend Messages ====================

// ServerMessage is the envelope for all server-to-client messages
type ServerMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Message types (server → client)
const (
	MsgTypeAgentStatus      = "agent_status"
	MsgTypeAgentList        = "agent_list"
	MsgTypeMessageChunk     = "message_chunk"
	MsgTypeThoughtChunk     = "thought_chunk"    // Agent 的思考/推理过程
	MsgTypeToolCall         = "tool_call"
	MsgTypeToolCallUpdate   = "tool_call_update"
	MsgTypePermissionReq    = "permission_request"
	MsgTypeTurnComplete     = "turn_complete"
	MsgTypePlanUpdate       = "plan_update"
	MsgTypeError            = "error"
	MsgTypeFileChange       = "file_change"     // Agent 写入文件时通知前端
	MsgTypeACPLog           = "acp_log"          // ACP 协议原始日志（TX/RX）
	MsgTypeGeminiSessions   = "gemini_sessions"  // Gemini CLI 原生会话列表
)

// AgentStatusPayload reports agent connection state
type AgentStatusPayload struct {
	AgentID string `json:"agentId"`
	Status  string `json:"status"` // idle, starting, running, stopped, error
	Error   string `json:"error,omitempty"`
}

// AgentListPayload lists available agents
type AgentListPayload struct {
	Agents []AgentInfo `json:"agents"`
}

type AgentInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Status  string `json:"status"`
}

// MessageChunkPayload streams text from the agent
type MessageChunkPayload struct {
	Text string `json:"text"`
}

// ToolCallPayload notifies about a new tool call
type ToolCallPayload struct {
	ToolCallID string              `json:"toolCallId"`
	Title      string              `json:"title"`
	Kind       string              `json:"kind"`
	Status     string              `json:"status"`
	Content    []ToolCallContentWS `json:"content,omitempty"`
	Locations  []ToolCallLocationWS `json:"locations,omitempty"`
}

// ToolCallUpdatePayload updates status of existing tool call
type ToolCallUpdatePayload struct {
	ToolCallID string              `json:"toolCallId"`
	Status     string              `json:"status,omitempty"`
	Content    []ToolCallContentWS `json:"content,omitempty"`
}

// ToolCallContentWS is the frontend-facing tool call content
type ToolCallContentWS struct {
	Type    string `json:"type"` // "text", "diff", "terminal"
	Text    string `json:"text,omitempty"`
	Path    string `json:"path,omitempty"`
	OldText string `json:"oldText,omitempty"`
	NewText string `json:"newText,omitempty"`
}

// PermissionRequestPayload asks for user approval
type PermissionRequestPayload struct {
	RequestID  interface{}        `json:"requestId"`
	ToolCallID string             `json:"toolCallId"`
	Options    []PermissionOption `json:"options"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
}

// TurnCompletePayload signals end of a prompt turn
type TurnCompletePayload struct {
	StopReason   string `json:"stopReason"`
	ErrorMessage string `json:"errorMessage,omitempty"` // 当 StopReason == "error" 时携带详情
}

// PlanUpdatePayload shows the agent's plan
type PlanUpdatePayload struct {
	Entries []PlanEntryWS `json:"entries"`
}

type PlanEntryWS struct {
	Content  string `json:"content"`
	Priority string `json:"priority"`
	Status   string `json:"status"`
}

// ErrorPayload reports an error to the frontend
type ErrorPayload struct {
	Message string `json:"message"`
}

// ACPLogPayload 推送 ACP 协议原始 JSON-RPC 消息到前端
type ACPLogPayload struct {
	Direction string `json:"direction"` // "tx" 或 "rx"
	Message   string `json:"message"`   // 原始 JSON 字符串
	Timestamp int64  `json:"timestamp"` // Unix 毫秒时间戳
}

// FileChangePayload 通知前端 Agent 写入/创建了文件
type FileChangePayload struct {
	Path    string `json:"path"`              // 文件绝对路径
	Action  string `json:"action"`            // "write", "create"
	Size    int    `json:"size"`              // 写入后的文件大小（字节）
	OldText string `json:"oldText,omitempty"` // 写入前的旧内容（用于 diff）
	NewText string `json:"newText,omitempty"` // 写入后的新内容
}

// ToolCallLocationWS 是前端侧的工具调用位置信息
type ToolCallLocationWS struct {
	Path string `json:"path"`
	Line int    `json:"line,omitempty"`
}

// ==================== Gemini CLI Native Session Types ====================

// GeminiSessionInfo 表示一个 Gemini CLI 原生会话
type GeminiSessionInfo struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	CreatedAt   int64  `json:"createdAt"`   // Unix 毫秒时间戳
	UpdatedAt   int64  `json:"updatedAt"`   // Unix 毫秒时间戳
	MessageCount int   `json:"messageCount"`
}

// GeminiSessionsPayload 是 Gemini CLI 原生会话列表的响应
type GeminiSessionsPayload struct {
	WorkDir  string              `json:"workDir"`
	Sessions []GeminiSessionInfo `json:"sessions"`
}

// ListGeminiSessionsPayload 是前端请求列出 Gemini CLI 原生会话的参数
type ListGeminiSessionsPayload struct {
	WorkDir string `json:"workDir"`
}
