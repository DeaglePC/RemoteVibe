package acp

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

// Client implements the ACP Client side of the protocol.
// It sends requests to the agent and handles responses, notifications, and agent-initiated requests.
type Client struct {
	transport *Transport
	nextID    atomic.Int64

	// pending responses: map[id]chan<-*Message
	pending   map[int64]chan *Message
	pendingMu sync.Mutex

	// Event callbacks (set by the caller)
	OnMessageChunk    func(chunk *AgentMessageChunk)
	OnThoughtChunk    func(chunk *AgentThoughtChunk)
	OnToolCall        func(tc *ToolCall)
	OnToolCallUpdate  func(tcu *ToolCallStatusUpdate)
	OnPlanUpdate      func(plan *PlanUpdate)
	OnPermissionReq   func(id interface{}, params *PermissionRequestParams)
	OnTurnComplete    func(result *SessionPromptResult)
	OnDisconnect      func(err error)

	sessionID          string
	supportsLoadSession bool // Agent 是否支持 session/load（从 initialize 响应中获取）
	done               chan struct{}
}

// NewClient creates a new ACP client over the given reader/writer
func NewClient(r io.Reader, w io.Writer) *Client {
	c := &Client{
		transport: NewTransport(r, w),
		pending:   make(map[int64]chan *Message),
		done:      make(chan struct{}),
	}
	return c
}

// Start begins listening for messages from the agent.
// Call this after creating the client, in a goroutine or before sending requests.
func (c *Client) Start() {
	go c.transport.ReadLoop()
	go c.dispatchLoop()
}

// Stop signals the client to stop processing
func (c *Client) Stop() {
	select {
	case <-c.done:
	default:
		close(c.done)
	}
}

// SessionID returns the current session ID
func (c *Client) SessionID() string {
	return c.sessionID
}

// ==================== Protocol Methods ====================

// Initialize sends the initialize request and returns the agent's capabilities
func (c *Client) Initialize() (*InitializeResult, error) {
	params := InitializeParams{
		ProtocolVersion: 1,
		ClientCapabilities: ClientCapabilities{
			FS: &FSCapabilities{
				ReadTextFile:  true,
				WriteTextFile: true,
			},
			Terminal: true,
		},
		ClientInfo: ClientInfo{
			Name:    "baomihua-gateway",
			Title:   "BaoMiHua Agent Gateway",
			Version: "0.1.0",
		},
	}

	result, err := c.sendRequest("initialize", params)
	if err != nil {
		return nil, fmt.Errorf("initialize: %w", err)
	}

	var initResult InitializeResult
	if err := json.Unmarshal(result, &initResult); err != nil {
		return nil, fmt.Errorf("parse initialize result: %w", err)
	}

	c.supportsLoadSession = initResult.AgentCapabilities.LoadSession

	log.Printf("[ACP] Connected to agent: %s v%s (protocol v%d, loadSession=%v)",
		initResult.AgentInfo.Name, initResult.AgentInfo.Version, initResult.ProtocolVersion,
		c.supportsLoadSession)

	return &initResult, nil
}

// SupportsLoadSession 返回 Agent 是否支持 session/load 恢复会话
func (c *Client) SupportsLoadSession() bool {
	return c.supportsLoadSession
}

// SessionNew creates a new conversation session
func (c *Client) SessionNew(cwd string) (string, error) {
	params := SessionNewParams{
		Cwd:        cwd,
		McpServers: []interface{}{},
	}
	result, err := c.sendRequest("session/new", params)
	if err != nil {
		return "", fmt.Errorf("session/new: %w", err)
	}

	var sessionResult SessionNewResult
	if err := json.Unmarshal(result, &sessionResult); err != nil {
		return "", fmt.Errorf("parse session/new result: %w", err)
	}

	c.sessionID = sessionResult.SessionID
	log.Printf("[ACP] Session created: %s", c.sessionID)
	return c.sessionID, nil
}

// SessionLoad 恢复一个已有的 Gemini CLI 会话
func (c *Client) SessionLoad(sessionID string, cwd string) (string, error) {
	if !c.supportsLoadSession {
		return "", fmt.Errorf("agent does not support session/load")
	}

	params := SessionLoadParams{
		SessionID:  sessionID,
		Cwd:        cwd,
		McpServers: []interface{}{},
	}
	result, err := c.sendRequest("session/load", params)
	if err != nil {
		return "", fmt.Errorf("session/load: %w", err)
	}

	log.Printf("[ACP] session/load raw result: %s", string(result))

	var loadResult SessionLoadResult
	if err := json.Unmarshal(result, &loadResult); err != nil {
		return "", fmt.Errorf("parse session/load result: %w", err)
	}

	// 如果响应中 sessionId 为空，使用请求中的 sessionID 作为 fallback
	if loadResult.SessionID == "" {
		log.Printf("[ACP] session/load returned empty sessionId, using request sessionID: %s", sessionID)
		loadResult.SessionID = sessionID
	}

	c.sessionID = loadResult.SessionID
	log.Printf("[ACP] Session loaded, active sessionID: %s", c.sessionID)
	return c.sessionID, nil
}

// SendPrompt sends a user prompt. The response is delivered via OnTurnComplete callback
// because there may be many session/update notifications before the prompt response.
func (c *Client) SendPrompt(text string) error {
	if c.sessionID == "" {
		return fmt.Errorf("no active session")
	}

	params := SessionPromptParams{
		SessionID: c.sessionID,
		Prompt: []ContentBlock{
			{Type: "text", Text: text},
		},
	}

	// Send as async request - response comes via dispatchLoop
	go func() {
		result, err := c.sendRequest("session/prompt", params)
		if err != nil {
			log.Printf("[ACP] Prompt error: %v", err)
			if c.OnTurnComplete != nil {
				c.OnTurnComplete(&SessionPromptResult{StopReason: "error"})
			}
			return
		}

		var promptResult SessionPromptResult
		if err := json.Unmarshal(result, &promptResult); err != nil {
			log.Printf("[ACP] Parse prompt result error: %v", err)
			// 解析失败也要触发 turn_complete，否则前端会一直卡在 thinking 状态
			if c.OnTurnComplete != nil {
				c.OnTurnComplete(&SessionPromptResult{StopReason: "error"})
			}
			return
		}

		if c.OnTurnComplete != nil {
			c.OnTurnComplete(&promptResult)
		}
	}()

	return nil
}

// RespondPermission sends a permission response back to the agent
func (c *Client) RespondPermission(requestID interface{}, optionID string) error {
	resp := Response{
		JSONRPC: "2.0",
		ID:      requestID,
	}

	outcome := PermissionResponse{
		Outcome: PermissionOutcome{
			Outcome:  "selected",
			OptionID: optionID,
		},
	}

	resultData, _ := json.Marshal(outcome)
	resp.Result = resultData

	return c.transport.WriteMessage(resp)
}

// Cancel sends a cancel notification for the current session
func (c *Client) Cancel() error {
	if c.sessionID == "" {
		return fmt.Errorf("no active session")
	}

	notification := Request{
		JSONRPC: "2.0",
		Method:  "session/cancel",
	}

	params := SessionCancelParams{SessionID: c.sessionID}
	data, _ := json.Marshal(params)
	notification.Params = data

	return c.transport.WriteMessage(notification)
}

// ==================== Internal ====================

// sendRequestTimeout 是 session/prompt 等请求的默认超时时间
const sendRequestTimeout = 5 * time.Minute

func (c *Client) sendRequest(method string, params interface{}) (json.RawMessage, error) {
	id := c.nextID.Add(1)

	req := Request{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
	}

	if params != nil {
		data, err := json.Marshal(params)
		if err != nil {
			return nil, err
		}
		req.Params = data
	}

	// 注册响应等待通道
	ch := make(chan *Message, 1)
	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()

	defer func() {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
	}()

	if err := c.transport.WriteMessage(req); err != nil {
		return nil, err
	}

	// 等待响应，带超时保护
	timer := time.NewTimer(sendRequestTimeout)
	defer timer.Stop()

	select {
	case msg := <-ch:
		if msg.Error != nil {
			return nil, fmt.Errorf("RPC error %d: %s", msg.Error.Code, msg.Error.Message)
		}
		return msg.Result, nil
	case <-timer.C:
		return nil, fmt.Errorf("request timeout after %v for method %s", sendRequestTimeout, method)
	case <-c.done:
		return nil, fmt.Errorf("client stopped")
	}
}

func (c *Client) dispatchLoop() {
	for {
		select {
		case <-c.done:
			return

		case msg := <-c.transport.Responses():
			c.handleResponse(msg)

		case msg := <-c.transport.Notifications():
			c.handleNotification(msg)

		case msg := <-c.transport.Requests():
			c.handleAgentRequest(msg)

		case err := <-c.transport.Errors():
			log.Printf("[ACP] Transport error: %v", err)
			if c.OnDisconnect != nil {
				c.OnDisconnect(err)
			}
			return
		}
	}
}

func (c *Client) handleResponse(msg *Message) {
	// Convert ID to int64 for lookup
	var id int64
	switch v := msg.ID.(type) {
	case float64:
		id = int64(v)
	case int64:
		id = v
	default:
		log.Printf("[ACP] Unknown response ID type: %T", msg.ID)
		return
	}

	c.pendingMu.Lock()
	ch, ok := c.pending[id]
	c.pendingMu.Unlock()

	if ok {
		select {
		case ch <- msg:
		default:
			log.Printf("[ACP] Warning: response channel full for id=%d", id)
		}
	} else {
		log.Printf("[ACP] Warning: no pending request for response id=%d", id)
	}
}

func (c *Client) handleNotification(msg *Message) {
	switch msg.Method {
	case "session/update":
		c.handleSessionUpdate(msg.Params)
	default:
		log.Printf("[ACP] Unknown notification: %s", msg.Method)
	}
}

func (c *Client) handleSessionUpdate(params json.RawMessage) {
	// First, extract the update envelope
	var updateEnvelope SessionUpdateParams
	if err := json.Unmarshal(params, &updateEnvelope); err != nil {
		log.Printf("[ACP] Failed to parse session/update: %v", err)
		return
	}

	// Determine the update type
	var updateType SessionUpdateType
	if err := json.Unmarshal(updateEnvelope.Update, &updateType); err != nil {
		log.Printf("[ACP] Failed to parse update type: %v", err)
		return
	}

	switch updateType.SessionUpdate {
	case "agent_message_chunk":
		var chunk AgentMessageChunk
		if err := json.Unmarshal(updateEnvelope.Update, &chunk); err != nil {
			log.Printf("[ACP] Failed to parse message chunk: %v", err)
			return
		}
		if c.OnMessageChunk != nil {
			c.OnMessageChunk(&chunk)
		}

	case "agent_thought_chunk":
		var chunk AgentThoughtChunk
		if err := json.Unmarshal(updateEnvelope.Update, &chunk); err != nil {
			log.Printf("[ACP] Failed to parse thought chunk: %v", err)
			return
		}
		if c.OnThoughtChunk != nil {
			c.OnThoughtChunk(&chunk)
		}

	case "tool_call":
		var tc ToolCall
		if err := json.Unmarshal(updateEnvelope.Update, &tc); err != nil {
			log.Printf("[ACP] Failed to parse tool call: %v", err)
			return
		}
		if c.OnToolCall != nil {
			c.OnToolCall(&tc)
		}

	case "tool_call_update":
		var tcu ToolCallStatusUpdate
		if err := json.Unmarshal(updateEnvelope.Update, &tcu); err != nil {
			log.Printf("[ACP] Failed to parse tool call update: %v", err)
			return
		}
		if c.OnToolCallUpdate != nil {
			c.OnToolCallUpdate(&tcu)
		}

	case "plan":
		var plan PlanUpdate
		if err := json.Unmarshal(updateEnvelope.Update, &plan); err != nil {
			log.Printf("[ACP] Failed to parse plan: %v", err)
			return
		}
		if c.OnPlanUpdate != nil {
			c.OnPlanUpdate(&plan)
		}

	default:
		log.Printf("[ACP] Unknown session update type: %s", updateType.SessionUpdate)
	}
}

func (c *Client) handleAgentRequest(msg *Message) {
	switch msg.Method {
	case "session/request_permission":
		var params PermissionRequestParams
		if err := json.Unmarshal(msg.Params, &params); err != nil {
			log.Printf("[ACP] Failed to parse permission request: %v", err)
			return
		}
		if c.OnPermissionReq != nil {
			c.OnPermissionReq(msg.ID, &params)
		}

	case "fs/read_text_file":
		c.handleFSReadTextFile(msg)

	case "fs/write_text_file":
		c.handleFSWriteTextFile(msg)

	default:
		log.Printf("[ACP] Unhandled agent request: %s", msg.Method)
		// 对未知方法返回错误响应
		resp := Response{
			JSONRPC: "2.0",
			ID:      msg.ID,
			Error: &RPCError{
				Code:    -32601,
				Message: "Method not found",
			},
		}
		c.transport.WriteMessage(resp)
	}
}

// handleFSReadTextFile 处理 Agent 发起的文件读取请求
func (c *Client) handleFSReadTextFile(msg *Message) {
	var params struct {
		Path      string `json:"path"`
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		log.Printf("[ACP] Failed to parse fs/read_text_file params: %v", err)
		c.sendRPCError(msg.ID, -32602, "Invalid params")
		return
	}

	// 安全校验：解析路径，防止路径遍历
	absPath, err := filepath.Abs(params.Path)
	if err != nil {
		c.sendRPCError(msg.ID, -32602, fmt.Sprintf("Invalid path: %v", err))
		return
	}

	log.Printf("[ACP] fs/read_text_file: %s", absPath)

	content, err := os.ReadFile(absPath)
	if err != nil {
		log.Printf("[ACP] fs/read_text_file error: %v", err)
		c.sendRPCError(msg.ID, -32000, fmt.Sprintf("Failed to read file: %v", err))
		return
	}

	result := map[string]interface{}{
		"content": string(content),
	}
	resultData, _ := json.Marshal(result)

	resp := Response{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  resultData,
	}
	c.transport.WriteMessage(resp)
}

// handleFSWriteTextFile 处理 Agent 发起的文件写入请求
func (c *Client) handleFSWriteTextFile(msg *Message) {
	var params struct {
		Path      string `json:"path"`
		Content   string `json:"content"`
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(msg.Params, &params); err != nil {
		log.Printf("[ACP] Failed to parse fs/write_text_file params: %v", err)
		c.sendRPCError(msg.ID, -32602, "Invalid params")
		return
	}

	// 安全校验：解析路径
	absPath, err := filepath.Abs(params.Path)
	if err != nil {
		c.sendRPCError(msg.ID, -32602, fmt.Sprintf("Invalid path: %v", err))
		return
	}

	log.Printf("[ACP] fs/write_text_file: %s (%d bytes)", absPath, len(params.Content))

	// 确保目录存在
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.sendRPCError(msg.ID, -32000, fmt.Sprintf("Failed to create directory: %v", err))
		return
	}

	// 写入文件
	if err := os.WriteFile(absPath, []byte(params.Content), 0644); err != nil {
		log.Printf("[ACP] fs/write_text_file error: %v", err)
		c.sendRPCError(msg.ID, -32000, fmt.Sprintf("Failed to write file: %v", err))
		return
	}

	result := map[string]interface{}{
		"success": true,
	}
	resultData, _ := json.Marshal(result)

	resp := Response{
		JSONRPC: "2.0",
		ID:      msg.ID,
		Result:  resultData,
	}
	c.transport.WriteMessage(resp)
}

// sendRPCError 发送 JSON-RPC 错误响应
func (c *Client) sendRPCError(id interface{}, code int, message string) {
	resp := Response{
		JSONRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
	}
	c.transport.WriteMessage(resp)
}
