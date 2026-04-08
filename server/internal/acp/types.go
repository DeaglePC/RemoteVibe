package acp

import "encoding/json"

// ==================== JSON-RPC 2.0 Base Types ====================

// Request represents a JSON-RPC 2.0 request
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"` // int64 or string; nil for notifications
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response represents a JSON-RPC 2.0 response
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError represents a JSON-RPC 2.0 error
type RPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// Message is a union type that can represent either a Request, Response, or Notification
type Message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// IsRequest returns true if this message is a request (has method and id)
func (m *Message) IsRequest() bool {
	return m.Method != "" && m.ID != nil
}

// IsNotification returns true if this message is a notification (has method but no id)
func (m *Message) IsNotification() bool {
	return m.Method != "" && m.ID == nil
}

// IsResponse returns true if this message is a response (has id but no method)
func (m *Message) IsResponse() bool {
	return m.Method == "" && m.ID != nil
}

// ==================== ACP Initialize ====================

type ClientInfo struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Version string `json:"version"`
}

type FSCapabilities struct {
	ReadTextFile  bool `json:"readTextFile,omitempty"`
	WriteTextFile bool `json:"writeTextFile,omitempty"`
}

type ClientCapabilities struct {
	FS       *FSCapabilities `json:"fs,omitempty"`
	Terminal bool            `json:"terminal,omitempty"`
}

type InitializeParams struct {
	ProtocolVersion    int                `json:"protocolVersion"`
	ClientCapabilities ClientCapabilities `json:"clientCapabilities"`
	ClientInfo         ClientInfo         `json:"clientInfo"`
}

type AgentInfo struct {
	Name    string `json:"name"`
	Title   string `json:"title"`
	Version string `json:"version"`
}

type PromptCapabilities struct {
	Image           bool `json:"image,omitempty"`
	Audio           bool `json:"audio,omitempty"`
	EmbeddedContext bool `json:"embeddedContext,omitempty"`
}

type AgentCapabilities struct {
	LoadSession        bool                `json:"loadSession,omitempty"`
	PromptCapabilities *PromptCapabilities `json:"promptCapabilities,omitempty"`
}

type InitializeResult struct {
	ProtocolVersion   int               `json:"protocolVersion"`
	AgentCapabilities AgentCapabilities `json:"agentCapabilities"`
	AgentInfo         AgentInfo         `json:"agentInfo"`
	AuthMethods       []interface{}     `json:"authMethods"`
}

// ==================== ACP Session ====================

// SessionNewParams 是 session/new 请求的参数
type SessionNewParams struct {
	Cwd        string        `json:"cwd"`
	McpServers []interface{} `json:"mcpServers"`
}

type SessionNewResult struct {
	SessionID string `json:"sessionId"`
}

// SessionLoadParams 是 session/load 请求的参数，用于恢复 Gemini CLI 原生会话
type SessionLoadParams struct {
	SessionID  string        `json:"sessionId"`
	Cwd        string        `json:"cwd"`
	McpServers []interface{} `json:"mcpServers"`
}

// SessionLoadResult 是 session/load 请求的响应
type SessionLoadResult struct {
	SessionID string `json:"sessionId"`
}

// ==================== ACP Prompt ====================

type ContentBlock struct {
	Type string `json:"type"` // "text", "image", "resource", "resource_link"
	Text string `json:"text,omitempty"`
}

type SessionPromptParams struct {
	SessionID string         `json:"sessionId"`
	Prompt    []ContentBlock `json:"prompt"`
}

type SessionPromptResult struct {
	StopReason string `json:"stopReason"` // "end_turn", "max_tokens", "cancelled", etc.
}

// ==================== ACP Session Updates (Notifications) ====================

type SessionUpdateParams struct {
	SessionID string          `json:"sessionId"`
	Update    json.RawMessage `json:"update"` // polymorphic, decoded based on sessionUpdate field
}

// SessionUpdateType extracts the "sessionUpdate" field from an update
type SessionUpdateType struct {
	SessionUpdate string `json:"sessionUpdate"`
}

// AgentMessageChunk is a streaming text chunk from the agent
type AgentMessageChunk struct {
	SessionUpdate string       `json:"sessionUpdate"` // "agent_message_chunk"
	Content       ContentBlock `json:"content"`
}

// AgentThoughtChunk is a streaming thought/reasoning chunk from the agent
type AgentThoughtChunk struct {
	SessionUpdate string       `json:"sessionUpdate"` // "agent_thought_chunk"
	Content       ContentBlock `json:"content"`
}

// ToolCallUpdate represents a tool call notification
type ToolCall struct {
	SessionUpdate string             `json:"sessionUpdate"` // "tool_call"
	ToolCallID    string             `json:"toolCallId"`
	Title         string             `json:"title"`
	Kind          string             `json:"kind"` // read, edit, delete, execute, think, etc.
	Status        string             `json:"status"` // pending, in_progress, completed, failed
	Content       []ToolCallContent  `json:"content,omitempty"`
	Locations     []ToolCallLocation `json:"locations,omitempty"`
	RawInput      json.RawMessage    `json:"rawInput,omitempty"`
	RawOutput     json.RawMessage    `json:"rawOutput,omitempty"`
}

// ToolCallStatusUpdate updates the status/content of an existing tool call
type ToolCallStatusUpdate struct {
	SessionUpdate string            `json:"sessionUpdate"` // "tool_call_update"
	ToolCallID    string            `json:"toolCallId"`
	Status        string            `json:"status,omitempty"`
	Content       []ToolCallContent `json:"content,omitempty"`
}

// ToolCallContent is a union type for tool call content items
type ToolCallContent struct {
	Type       string       `json:"type"`                 // "content", "diff", "terminal"
	Content    *ContentBlock `json:"content,omitempty"`    // when type == "content"
	Path       string       `json:"path,omitempty"`       // when type == "diff"
	OldText    string       `json:"oldText,omitempty"`    // when type == "diff"
	NewText    string       `json:"newText,omitempty"`    // when type == "diff"
	TerminalID string       `json:"terminalId,omitempty"` // when type == "terminal"
}

// ToolCallLocation tracks which files/lines the agent is working on
type ToolCallLocation struct {
	Path string `json:"path"`
	Line int    `json:"line,omitempty"`
}

// PlanUpdate represents an agent plan
type PlanUpdate struct {
	SessionUpdate string      `json:"sessionUpdate"` // "plan"
	Entries       []PlanEntry `json:"entries"`
}

type PlanEntry struct {
	Content  string `json:"content"`
	Priority string `json:"priority"` // high, medium, low
	Status   string `json:"status"`   // pending, in_progress, completed
}

// ==================== ACP Permission Request ====================

type PermissionRequestParams struct {
	SessionID string             `json:"sessionId"`
	ToolCall  PermissionToolCall `json:"toolCall"`
	Options   []PermissionOption `json:"options"`
}

type PermissionToolCall struct {
	ToolCallID string `json:"toolCallId"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"` // allow_once, allow_always, reject_once, reject_always
}

type PermissionResponse struct {
	Outcome PermissionOutcome `json:"outcome"`
}

type PermissionOutcome struct {
	Outcome  string `json:"outcome"`  // "selected" or "cancelled"
	OptionID string `json:"optionId,omitempty"`
}

// ==================== ACP Cancel ====================

type SessionCancelParams struct {
	SessionID string `json:"sessionId"`
}
