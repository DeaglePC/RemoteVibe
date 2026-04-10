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
	server     *Server
	client     *ClientConn
	agent      *agent.Process // currently active agent for this client
	dirWatcher *DirWatcher    // 文件系统监听器（agent 运行时启动）
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
		// 关闭文件监听器
		if h.dirWatcher != nil {
			h.dirWatcher.Close()
			h.dirWatcher = nil
		}
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
	case "list_gemini_sessions":
		h.handleListGeminiSessions(msg.Payload)
	case "watch_dir":
		h.handleWatchDir(msg.Payload)
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

	log.Printf("[Handler] handleStartAgent: agentId=%s, workDir=%s, geminiSessionID=%s",
		p.AgentID, p.WorkDir, p.GeminiSessionID)

	// Notify starting — 这条消息会立即通过 writeLoop 发出
	h.send(&ServerMessage{
		Type: MsgTypeAgentStatus,
		Payload: AgentStatusPayload{
			AgentID: p.AgentID,
			Status:  "starting",
		},
	})

	// 异步执行启动逻辑，避免阻塞 readLoop（防止 startInternal 卡住时无法处理其他消息）
	go func() {
		var proc *agent.Process
		var err error

		if p.GeminiSessionID != "" {
			// 恢复 Gemini CLI 原生会话
			log.Printf("[Handler] Starting agent with resume: sessionID=%s", p.GeminiSessionID)
			proc, err = h.server.mgr.StartAgentWithResume(p.AgentID, p.WorkDir, p.GeminiSessionID)
		} else {
			log.Printf("[Handler] Starting agent (new session)")
			proc, err = h.server.mgr.StartAgent(p.AgentID, p.WorkDir)
		}

		if err != nil {
			log.Printf("[Handler] Agent start failed: %v", err)
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

		log.Printf("[Handler] Agent started successfully, wiring callbacks")
		h.agent = proc

		// Wire up ACP callbacks → WebSocket messages
		h.wireAgentCallbacks(proc)

		// 启动文件系统监听器
		h.startDirWatcher(p.WorkDir)

		h.send(&ServerMessage{
			Type: MsgTypeAgentStatus,
			Payload: AgentStatusPayload{
				AgentID: p.AgentID,
				Status:  "running",
			},
		})
	}()
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

	// 停止文件系统监听
	if h.dirWatcher != nil {
		h.dirWatcher.Close()
		h.dirWatcher = nil
	}

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
		log.Printf("[Handler] handleSendPrompt: h.agent is nil, no agent running")
		h.sendError("No agent running. Start an agent first.")
		return
	}

	log.Printf("[Handler] handleSendPrompt: agent state=%s", h.agent.State())

	client := h.agent.Client()
	if client == nil {
		log.Printf("[Handler] handleSendPrompt: client is nil")
		h.sendError("Agent not ready")
		return
	}

	log.Printf("[Handler] handleSendPrompt: client sessionID=%s, sending text=%q",
		client.SessionID(), p.Text[:min(len(p.Text), 50)])

	if err := client.SendPrompt(p.Text); err != nil {
		log.Printf("[Handler] handleSendPrompt: SendPrompt failed: %v", err)
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

	client.OnThoughtChunk = func(chunk *acp.AgentThoughtChunk) {
		// agent 的思考/推理过程，使用独立的 thought_chunk 类型
		h.send(&ServerMessage{
			Type:    MsgTypeThoughtChunk,
			Payload: MessageChunkPayload{Text: chunk.Content.Text},
		})
	}

	client.OnToolCall = func(tc *acp.ToolCall) {
		content := convertToolCallContent(tc.Content)
		locations := convertToolCallLocations(tc.Locations)
		h.send(&ServerMessage{
			Type: MsgTypeToolCall,
			Payload: ToolCallPayload{
				ToolCallID: tc.ToolCallID,
				Title:      tc.Title,
				Kind:       tc.Kind,
				Status:     tc.Status,
				Content:    content,
				Locations:  locations,
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

	client.OnACPLog = func(direction string, message string) {
		h.send(&ServerMessage{
			Type: MsgTypeACPLog,
			Payload: ACPLogPayload{
				Direction: direction,
				Message:   message,
				Timestamp: time.Now().UnixMilli(),
			},
		})
	}

	client.OnUnknownEvent = func(eventType string, rawJSON string) {
		// 未知事件作为 acp_log 的 rx 日志推送前端，让用户能看到所有协议交互
		h.send(&ServerMessage{
			Type: MsgTypeACPLog,
			Payload: ACPLogPayload{
				Direction: "rx",
				Message:   rawJSON,
				Timestamp: time.Now().UnixMilli(),
			},
		})
	}

	client.OnFileChange = func(path string, oldContent string, newContent string, isCreate bool) {
		action := "write"
		if isCreate {
			action = "create"
		}
		// 对大文件不传完整内容，只发路径和 action
		const maxDiffSize = 512 * 1024 // 512KB
		payload := FileChangePayload{
			Path:   path,
			Action: action,
			Size:   len(newContent),
		}
		if len(oldContent)+len(newContent) <= maxDiffSize {
			payload.OldText = oldContent
			payload.NewText = newContent
		}
		h.send(&ServerMessage{
			Type:    MsgTypeFileChange,
			Payload: payload,
		})
	}

	client.OnTurnComplete = func(result *acp.SessionPromptResult) {
		h.send(&ServerMessage{
			Type: MsgTypeTurnComplete,
			Payload: TurnCompletePayload{
				StopReason:   result.StopReason,
				ErrorMessage: result.ErrorMessage,
			},
		})
	}

	client.OnDisconnect = func(err error) {
		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		// 先发送 turn_complete，确保前端退出 thinking 状态
		h.send(&ServerMessage{
			Type:    MsgTypeTurnComplete,
			Payload: TurnCompletePayload{StopReason: "disconnected"},
		})
		h.send(&ServerMessage{
			Type: MsgTypeAgentStatus,
			Payload: AgentStatusPayload{
				Status: "disconnected",
				Error:  errMsg,
			},
		})
	}
}

// ==================== File System Watching ====================

// startDirWatcher 启动文件系统监听器，监听工作目录的变化
func (h *Handler) startDirWatcher(workDir string) {
	// 先关闭旧的 watcher
	if h.dirWatcher != nil {
		h.dirWatcher.Close()
		h.dirWatcher = nil
	}

	if workDir == "" {
		return
	}

	dw, err := NewDirWatcher(workDir, func(event FSEventPayload) {
		h.send(&ServerMessage{
			Type:    MsgTypeFSEvent,
			Payload: event,
		})
	})
	if err != nil {
		log.Printf("[Handler] Failed to start dir watcher for %s: %v", workDir, err)
		return
	}
	h.dirWatcher = dw
}

// handleWatchDir 处理前端请求监听/取消监听子目录
func (h *Handler) handleWatchDir(payload json.RawMessage) {
	var p WatchDirPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid watch_dir payload")
		return
	}

	if h.dirWatcher == nil {
		return
	}

	switch p.Action {
	case "watch":
		if err := h.dirWatcher.AddDir(p.Path); err != nil {
			log.Printf("[Handler] Failed to watch dir %s: %v", p.Path, err)
		}
	case "unwatch":
		if err := h.dirWatcher.RemoveDir(p.Path); err != nil {
			log.Printf("[Handler] Failed to unwatch dir %s: %v", p.Path, err)
		}
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

// handleListGeminiSessions 扫描 Gemini CLI 原生会话并返回列表
func (h *Handler) handleListGeminiSessions(payload json.RawMessage) {
	var p ListGeminiSessionsPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		h.sendError("Invalid list_gemini_sessions payload")
		return
	}

	sessions := h.server.listGeminiNativeSessions(p.WorkDir)

	h.send(&ServerMessage{
		Type: MsgTypeGeminiSessions,
		Payload: GeminiSessionsPayload{
			WorkDir:  p.WorkDir,
			Sessions: sessions,
		},
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

// convertToolCallLocations 将 ACP ToolCallLocation 转为前端格式
func convertToolCallLocations(items []acp.ToolCallLocation) []ToolCallLocationWS {
	if len(items) == 0 {
		return nil
	}
	result := make([]ToolCallLocationWS, len(items))
	for i, item := range items {
		result[i] = ToolCallLocationWS{
			Path: item.Path,
			Line: item.Line,
		}
	}
	return result
}
