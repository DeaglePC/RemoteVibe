package gateway

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"

	"agentinhand/internal/acp"
	"agentinhand/internal/agent"
)

// Handler manages the WebSocket message flow for a single client connection
type Handler struct {
	server *Server
	client *ClientConn
	agent  *agent.Process // currently active agent for this client
}

// NewHandler creates a handler for a WebSocket client
func NewHandler(s *Server, c *ClientConn) *Handler {
	return &Handler{
		server: s,
		client: c,
	}
}

// readLoop reads messages from the WebSocket client
func (h *Handler) readLoop() {
	defer func() {
		h.server.removeClient(h.client.conn)
		h.client.conn.Close()
		log.Printf("[Handler] Client disconnected: %s", h.client.conn.RemoteAddr())
	}()

	h.client.conn.SetReadLimit(1024 * 1024) // 1MB
	h.client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	h.client.conn.SetPongHandler(func(string) error {
		h.client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := h.client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[Handler] Read error: %v", err)
			}
			return
		}

		h.handleMessage(message)
	}
}

// writeLoop writes messages to the WebSocket client and sends pings
func (h *Handler) writeLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-h.client.send:
			if !ok {
				h.client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			h.client.writeMu.Lock()
			h.client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := h.client.conn.WriteMessage(websocket.TextMessage, msg)
			h.client.writeMu.Unlock()
			if err != nil {
				log.Printf("[Handler] Write error: %v", err)
				return
			}

		case <-ticker.C:
			h.client.writeMu.Lock()
			h.client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := h.client.conn.WriteMessage(websocket.PingMessage, nil)
			h.client.writeMu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

// handleMessage processes an incoming client message
func (h *Handler) handleMessage(raw []byte) {
	var msg ClientMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		h.sendError("Invalid message format")
		return
	}

	switch msg.Type {
	case "start_agent":
		h.handleStartAgent(msg.Payload)
	case "stop_agent":
		h.handleStopAgent(msg.Payload)
	case "send_prompt":
		h.handleSendPrompt(msg.Payload)
	case "permission_response":
		h.handlePermissionResponse(msg.Payload)
	case "cancel":
		h.handleCancel()
	case "list_agents":
		h.sendAgentList()
	default:
		h.sendError("Unknown message type: " + msg.Type)
	}
}

// ==================== Message Handlers ====================

func (h *Handler) handleStartAgent(payload json.RawMessage) {
	var p StartAgentPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid start_agent payload")
		return
	}

	// Notify starting
	h.send(&ServerMessage{
		Type: MsgTypeAgentStatus,
		Payload: AgentStatusPayload{
			AgentID: p.AgentID,
			Status:  "starting",
		},
	})

	proc, err := h.server.mgr.StartAgent(p.AgentID, p.WorkDir)
	if err != nil {
		h.send(&ServerMessage{
			Type: MsgTypeAgentStatus,
			Payload: AgentStatusPayload{
				AgentID: p.AgentID,
				Status:  "error",
				Error:   err.Error(),
			},
		})
		return
	}

	h.agent = proc

	// Wire up ACP callbacks → WebSocket messages
	h.wireAgentCallbacks(proc)

	h.send(&ServerMessage{
		Type: MsgTypeAgentStatus,
		Payload: AgentStatusPayload{
			AgentID: p.AgentID,
			Status:  "running",
		},
	})
}

func (h *Handler) handleStopAgent(payload json.RawMessage) {
	var p struct {
		AgentID string `json:"agentId"`
	}
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid stop_agent payload")
		return
	}

	h.server.mgr.StopAgent(p.AgentID)
	h.agent = nil

	h.send(&ServerMessage{
		Type: MsgTypeAgentStatus,
		Payload: AgentStatusPayload{
			AgentID: p.AgentID,
			Status:  "stopped",
		},
	})
}

func (h *Handler) handleSendPrompt(payload json.RawMessage) {
	var p SendPromptPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid send_prompt payload")
		return
	}

	if h.agent == nil {
		h.sendError("No agent running. Start an agent first.")
		return
	}

	client := h.agent.Client()
	if client == nil {
		h.sendError("Agent not ready")
		return
	}

	if err := client.SendPrompt(p.Text); err != nil {
		h.sendError("Failed to send prompt: " + err.Error())
	}
}

func (h *Handler) handlePermissionResponse(payload json.RawMessage) {
	var p PermissionResponsePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid permission_response payload")
		return
	}

	if h.agent == nil {
		h.sendError("No agent running")
		return
	}

	client := h.agent.Client()
	if client == nil {
		h.sendError("Agent not ready")
		return
	}

	if err := client.RespondPermission(p.RequestID, p.OptionID); err != nil {
		h.sendError("Failed to send permission response: " + err.Error())
	}
}

func (h *Handler) handleCancel() {
	if h.agent == nil {
		return
	}

	client := h.agent.Client()
	if client != nil {
		client.Cancel()
	}
}

// ==================== ACP → WebSocket Bridging ====================

func (h *Handler) wireAgentCallbacks(proc *agent.Process) {
	client := proc.Client()
	if client == nil {
		return
	}

	client.OnMessageChunk = func(chunk *acp.AgentMessageChunk) {
		h.send(&ServerMessage{
			Type:    MsgTypeMessageChunk,
			Payload: MessageChunkPayload{Text: chunk.Content.Text},
		})
	}

	client.OnToolCall = func(tc *acp.ToolCall) {
		content := convertToolCallContent(tc.Content)
		h.send(&ServerMessage{
			Type: MsgTypeToolCall,
			Payload: ToolCallPayload{
				ToolCallID: tc.ToolCallID,
				Title:      tc.Title,
				Kind:       tc.Kind,
				Status:     tc.Status,
				Content:    content,
			},
		})
	}

	client.OnToolCallUpdate = func(tcu *acp.ToolCallStatusUpdate) {
		content := convertToolCallContent(tcu.Content)
		h.send(&ServerMessage{
			Type: MsgTypeToolCallUpdate,
			Payload: ToolCallUpdatePayload{
				ToolCallID: tcu.ToolCallID,
				Status:     tcu.Status,
				Content:    content,
			},
		})
	}

	client.OnPlanUpdate = func(plan *acp.PlanUpdate) {
		entries := make([]PlanEntryWS, len(plan.Entries))
		for i, e := range plan.Entries {
			entries[i] = PlanEntryWS{
				Content:  e.Content,
				Priority: e.Priority,
				Status:   e.Status,
			}
		}
		h.send(&ServerMessage{
			Type:    MsgTypePlanUpdate,
			Payload: PlanUpdatePayload{Entries: entries},
		})
	}

	client.OnPermissionReq = func(id interface{}, params *acp.PermissionRequestParams) {
		options := make([]PermissionOption, len(params.Options))
		for i, o := range params.Options {
			options[i] = PermissionOption{
				OptionID: o.OptionID,
				Name:     o.Name,
				Kind:     o.Kind,
			}
		}
		h.send(&ServerMessage{
			Type: MsgTypePermissionReq,
			Payload: PermissionRequestPayload{
				RequestID:  id,
				ToolCallID: params.ToolCall.ToolCallID,
				Options:    options,
			},
		})
	}

	client.OnTurnComplete = func(result *acp.SessionPromptResult) {
		h.send(&ServerMessage{
			Type:    MsgTypeTurnComplete,
			Payload: TurnCompletePayload{StopReason: result.StopReason},
		})
	}

	client.OnDisconnect = func(err error) {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		h.send(&ServerMessage{
			Type: MsgTypeAgentStatus,
			Payload: AgentStatusPayload{
				Status: "disconnected",
				Error:  errMsg,
			},
		})
	}
}

// ==================== Helpers ====================

func (h *Handler) sendAgentList() {
	agents := h.server.mgr.ListAgents()
	list := make([]AgentInfo, len(agents))
	for i, a := range agents {
		status := "idle"
		if proc := h.server.mgr.GetAgent(a.ID); proc != nil {
			status = string(proc.State())
		}
		list[i] = AgentInfo{
			ID:     a.ID,
			Name:   a.Name,
			Status: status,
		}
	}

	h.send(&ServerMessage{
		Type:    MsgTypeAgentList,
		Payload: AgentListPayload{Agents: list},
	})
}

func (h *Handler) send(msg *ServerMessage) {
	sendToClient(h.client, msg)
}

func (h *Handler) sendError(message string) {
	h.send(&ServerMessage{
		Type:    MsgTypeError,
		Payload: ErrorPayload{Message: message},
	})
}

func sendToClient(c *ClientConn, msg *ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[Handler] Marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("[Handler] Client send channel full, dropping message")
	}
}

func convertToolCallContent(items []acp.ToolCallContent) []ToolCallContentWS {
	if len(items) == 0 {
		return nil
	}
	result := make([]ToolCallContentWS, len(items))
	for i, item := range items {
		ws := ToolCallContentWS{Type: item.Type}
		switch item.Type {
		case "content":
			if item.Content != nil {
				ws.Type = "text"
				ws.Text = item.Content.Text
			}
		case "diff":
			ws.Path = item.Path
			ws.OldText = item.OldText
			ws.NewText = item.NewText
		case "terminal":
			ws.Type = "terminal"
			ws.Text = item.TerminalID
		}
		result[i] = ws
	}
	return result
}
