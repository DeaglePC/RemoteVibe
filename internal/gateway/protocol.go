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
	AgentID string `json:"agentId"`
	WorkDir string `json:"workDir,omitempty"`
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
	MsgTypeToolCall         = "tool_call"
	MsgTypeToolCallUpdate   = "tool_call_update"
	MsgTypePermissionReq    = "permission_request"
	MsgTypeTurnComplete     = "turn_complete"
	MsgTypePlanUpdate       = "plan_update"
	MsgTypeError            = "error"
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
	StopReason string `json:"stopReason"`
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
