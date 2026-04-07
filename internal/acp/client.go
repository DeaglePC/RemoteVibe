package acp

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"
	"sync/atomic"
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
	OnToolCall        func(tc *ToolCall)
	OnToolCallUpdate  func(tcu *ToolCallStatusUpdate)
	OnPlanUpdate      func(plan *PlanUpdate)
	OnPermissionReq   func(id interface{}, params *PermissionRequestParams)
	OnTurnComplete    func(result *SessionPromptResult)
	OnDisconnect      func(err error)

	sessionID string
	done      chan struct{}
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

	log.Printf("[ACP] Connected to agent: %s v%s (protocol v%d)",
		initResult.AgentInfo.Name, initResult.AgentInfo.Version, initResult.ProtocolVersion)

	return &initResult, nil
}

// SessionNew creates a new conversation session
func (c *Client) SessionNew() (string, error) {
	result, err := c.sendRequest("session/new", struct{}{})
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

	// Register pending response channel
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

	// Wait for response
	select {
	case msg := <-ch:
		if msg.Error != nil {
			return nil, fmt.Errorf("RPC error %d: %s", msg.Error.Code, msg.Error.Message)
		}
		return msg.Result, nil
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

	default:
		log.Printf("[ACP] Unhandled agent request: %s", msg.Method)
		// Send error response for unknown methods
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
