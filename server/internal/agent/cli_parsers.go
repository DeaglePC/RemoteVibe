package agent

import (
	"encoding/json"
	"fmt"
	"log"
)

// StreamParser 定义各 Agent CLI 的 stream-json 解析器接口。
// 不同的 Agent 输出的 NDJSON 格式略有差异，需要适配。
// prompt 的格式化和写入逻辑在 CLIBackend.writeStdinPrompt 中处理，
// 因为不同 Agent 的 prompt 传递方式差异很大（stdin JSON / 命令行参数 / stdin 纯文本）。
type StreamParser interface {
	// Parse 解析一行 JSON 并通过回调分发事件
	Parse(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int)
}

// NewStreamParser 根据 Agent ID 创建对应的解析器。
// onSessionID 回调用于 Gemini CLI 从 init 事件中提取 session_id。
func NewStreamParser(agentID string, onSessionID func(string)) StreamParser {
	switch agentID {
	case "claude":
		return &ClaudeStreamParser{}
	case "gemini", "gemini-cli":
		return &GeminiStreamParser{onSessionID: onSessionID}
	case "codex":
		return &CodexStreamParser{}
	default:
		// 默认使用通用解析器
		return &GenericStreamParser{}
	}
}

// ==================== Claude Code Stream Parser ====================

// ClaudeStreamParser 解析 Claude Code 的 stream-json 输出。
// Claude Code 使用 `claude -p --output-format stream-json` 模式输出。
//
// 事件类型参考 Multica：
//
//	{"type":"assistant","message":{"type":"text","text":"..."}}
//	{"type":"assistant","message":{"type":"tool_use","name":"...","input":{...}}}
//	{"type":"assistant","message":{"type":"tool_result","content":"..."}}
//	{"type":"result","result":"...","session_id":"...","cost_usd":0.01}
type ClaudeStreamParser struct{}

// claudeEvent 是 Claude Code stream-json 的顶层结构
type claudeEvent struct {
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message,omitempty"`

	// type == "result" 时的字段
	Result    string  `json:"result,omitempty"`
	SessionID string  `json:"session_id,omitempty"`
	CostUSD   float64 `json:"cost_usd,omitempty"`

	// type == "error" 时的字段
	Error string `json:"error,omitempty"`

	// 更精细的 content_block 事件
	Subtype string `json:"subtype,omitempty"`
	Index   int    `json:"index,omitempty"`
}

// claudeContentBlock 是 Claude 消息中的内容块
type claudeContentBlock struct {
	Type  string          `json:"type"`
	Text  string          `json:"text,omitempty"`
	Name  string          `json:"name,omitempty"`
	ID    string          `json:"id,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result 的内容
	Content     string `json:"content,omitempty"`
	IsError     bool   `json:"is_error,omitempty"`
	ToolUseID   string `json:"tool_use_id,omitempty"`
}

// Parse 解析 Claude Code 的 stream-json 事件
func (p *ClaudeStreamParser) Parse(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int) {
	if cb == nil {
		return
	}

	var evt claudeEvent
	if err := json.Unmarshal(raw, &evt); err != nil {
		log.Printf("[ClaudeParser] Failed to parse event: %v", err)
		return
	}

	switch evt.Type {
	case "assistant":
		p.parseAssistantMessage(evt.Message, cb, toolCallCounter)

	case "content_block_start":
		p.parseContentBlockStart(evt, cb, toolCallCounter)

	case "content_block_delta":
		p.parseContentBlockDelta(evt, cb)

	case "content_block_stop":
		// 内容块结束，通常不需要特殊处理

	case "result":
		// 最终结果
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("end_turn", "", nil)
		}

	case "error":
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("error", evt.Error, nil)
		}

	case "system":
		// 系统消息，记录为思考
		if cb.OnThoughtChunk != nil {
			var sysMsg struct {
				Message string `json:"message"`
			}
			if err := json.Unmarshal(raw, &sysMsg); err == nil && sysMsg.Message != "" {
				cb.OnThoughtChunk(sysMsg.Message)
			}
		}

	default:
		log.Printf("[ClaudeParser] Unknown event type: %s", evt.Type)
		if cb.OnUnknownEvent != nil {
			cb.OnUnknownEvent(evt.Type, string(raw))
		}
	}
}

// parseAssistantMessage 解析 Claude 的 assistant 消息
func (p *ClaudeStreamParser) parseAssistantMessage(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int) {
	if raw == nil {
		return
	}

	var block claudeContentBlock
	if err := json.Unmarshal(raw, &block); err != nil {
		log.Printf("[ClaudeParser] Failed to parse assistant message: %v", err)
		return
	}

	switch block.Type {
	case "text":
		if cb.OnMessageChunk != nil && block.Text != "" {
			cb.OnMessageChunk(block.Text)
		}

	case "thinking":
		if cb.OnThoughtChunk != nil && block.Text != "" {
			cb.OnThoughtChunk(block.Text)
		}

	case "tool_use":
		if cb.OnToolCall != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			inputStr := string(block.Input)

			cb.OnToolCall(&ToolCallEvent{
				ToolCallID: toolCallID,
				Title:      block.Name,
				Kind:       classifyToolKind(block.Name),
				Status:     "in_progress",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: inputStr},
				},
			})
		}

	case "tool_result":
		if cb.OnToolCallUpdate != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			status := "completed"
			if block.IsError {
				status = "failed"
			}
			cb.OnToolCallUpdate(&ToolCallUpdateEvent{
				ToolCallID: toolCallID,
				Status:     status,
				Content: []ToolCallContentEvent{
					{Type: "text", Text: block.Content},
				},
			})
		}
	}
}

// parseContentBlockStart 处理 content_block_start 事件
func (p *ClaudeStreamParser) parseContentBlockStart(evt claudeEvent, cb *BackendCallbacks, toolCallCounter *int) {
	if evt.Message == nil {
		return
	}

	var block claudeContentBlock
	if err := json.Unmarshal(evt.Message, &block); err != nil {
		return
	}

	if block.Type == "tool_use" && cb.OnToolCall != nil {
		*toolCallCounter++
		toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
		cb.OnToolCall(&ToolCallEvent{
			ToolCallID: toolCallID,
			Title:      block.Name,
			Kind:       classifyToolKind(block.Name),
			Status:     "in_progress",
		})
	}
}

// parseContentBlockDelta 处理 content_block_delta 事件
func (p *ClaudeStreamParser) parseContentBlockDelta(evt claudeEvent, cb *BackendCallbacks) {
	if evt.Message == nil {
		return
	}

	var delta struct {
		Type string `json:"type"`
		Text string `json:"text,omitempty"`
	}
	if err := json.Unmarshal(evt.Message, &delta); err != nil {
		return
	}

	switch delta.Type {
	case "text_delta":
		if cb.OnMessageChunk != nil && delta.Text != "" {
			cb.OnMessageChunk(delta.Text)
		}
	case "thinking_delta":
		if cb.OnThoughtChunk != nil && delta.Text != "" {
			cb.OnThoughtChunk(delta.Text)
		}
	}
}

// ==================== Gemini CLI Stream Parser ====================

// GeminiStreamParser 解析 Gemini CLI 的 stream-json 输出。
// Gemini CLI 使用 `gemini -p "prompt" -o stream-json` 模式输出。
//
// 官方文档定义的事件类型（https://geminicli.org.cn/docs/cli/headless/）：
//
//	{"type":"init","session_id":"...","model":"...","timestamp":"..."}
//	{"type":"message","role":"user","content":"...","timestamp":"..."}
//	{"type":"message","role":"assistant","content":"...","delta":true,"timestamp":"..."}
//	{"type":"tool_use","name":"...","input":{...}}
//	{"type":"tool_result","content":"..."}
//	{"type":"error","message":"..."}
//	{"type":"result",...}
type GeminiStreamParser struct {
	// onSessionID 回调，当从 init 事件中提取到 session_id 时调用。
	// 由 CLIBackend 设置，用于更新 CLIBackend.sessionID 以支持 --resume。
	onSessionID func(sessionID string)
}

// geminiEvent 是 Gemini CLI stream-json 的通用结构
type geminiEvent struct {
	Type    string          `json:"type"`
	Text    string          `json:"text,omitempty"`
	Name    string          `json:"name,omitempty"`
	Input   json.RawMessage `json:"input,omitempty"`
	Content string          `json:"content,omitempty"`
	Message string          `json:"message,omitempty"`
	Error   string          `json:"error,omitempty"`
	Status  string          `json:"status,omitempty"`

	// init 事件
	SessionID string `json:"session_id,omitempty"`
	Model     string `json:"model,omitempty"`

	// message 事件
	Role  string `json:"role,omitempty"`
	Delta bool   `json:"delta,omitempty"`

	// tool-use 相关
	ToolCallID string `json:"toolCallId,omitempty"`
	Title      string `json:"title,omitempty"`
	Kind       string `json:"kind,omitempty"`

	// 部分事件包含 partial
	Partial bool `json:"partial,omitempty"`

	// result 事件的统计信息（status 已由 Status 字段处理，此处无需重复）
	Stats *geminiResultStats `json:"stats,omitempty"`
}

// geminiResultStats 是 Gemini CLI result 事件的 stats 字段
type geminiResultStats struct {
	TotalTokens  int `json:"total_tokens,omitempty"`
	InputTokens  int `json:"input_tokens,omitempty"`
	OutputTokens int `json:"output_tokens,omitempty"`
	Cached       int `json:"cached,omitempty"`
	DurationMs   int `json:"duration_ms,omitempty"`
	ToolCalls    int `json:"tool_calls,omitempty"`
	// models 字段包含按模型分组的 token 信息
	Models map[string]json.RawMessage `json:"models,omitempty"`
}

// Parse 解析 Gemini CLI 的 stream-json 事件
func (p *GeminiStreamParser) Parse(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int) {
	if cb == nil {
		return
	}

	var evt geminiEvent
	if err := json.Unmarshal(raw, &evt); err != nil {
		log.Printf("[GeminiParser] Failed to parse event: %v", err)
		return
	}

	switch evt.Type {
	case "init":
		// 从 init 事件中提取 session_id，用于后续 --resume 恢复会话
		if evt.SessionID != "" && p.onSessionID != nil {
			p.onSessionID(evt.SessionID)
		}
		log.Printf("[GeminiParser] Session initialized: session_id=%s, model=%s", evt.SessionID, evt.Model)

	case "message":
		// message 事件包含 role 和 content 字段
		// role="user" 是用户消息回显（忽略）
		// role="assistant" + delta=true 是助手的流式回复片段
		if evt.Role == "assistant" && evt.Content != "" {
			if cb.OnMessageChunk != nil {
				cb.OnMessageChunk(evt.Content)
			}
		}
		// 忽略 role="user" 的回显消息

	case "text":
		// 兼容可能的旧版格式
		if cb.OnMessageChunk != nil && evt.Text != "" {
			cb.OnMessageChunk(evt.Text)
		}

	case "thinking":
		if cb.OnThoughtChunk != nil && evt.Text != "" {
			cb.OnThoughtChunk(evt.Text)
		}

	case "tool-use", "tool_use":
		if cb.OnToolCall != nil {
			*toolCallCounter++
			toolCallID := evt.ToolCallID
			if toolCallID == "" {
				toolCallID = fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			}
			title := evt.Title
			if title == "" {
				title = evt.Name
			}
			kind := evt.Kind
			if kind == "" {
				kind = classifyToolKind(evt.Name)
			}
			inputStr := string(evt.Input)
			cb.OnToolCall(&ToolCallEvent{
				ToolCallID: toolCallID,
				Title:      title,
				Kind:       kind,
				Status:     "in_progress",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: inputStr},
				},
			})
		}

	case "tool-result", "tool_result":
		if cb.OnToolCallUpdate != nil {
			*toolCallCounter++
			toolCallID := evt.ToolCallID
			if toolCallID == "" {
				toolCallID = fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			}
			cb.OnToolCallUpdate(&ToolCallUpdateEvent{
				ToolCallID: toolCallID,
				Status:     "completed",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: evt.Content},
				},
			})
		}

	case "status":
		// 状态更新作为思考输出
		if cb.OnThoughtChunk != nil && evt.Message != "" {
			cb.OnThoughtChunk("[Status] " + evt.Message + "\n")
		}

	case "result":
		if cb.OnTurnComplete != nil {
			var stats *TurnStats
			if evt.Stats != nil {
				stats = &TurnStats{
					TotalTokens:  evt.Stats.TotalTokens,
					InputTokens:  evt.Stats.InputTokens,
					OutputTokens: evt.Stats.OutputTokens,
					CachedTokens: evt.Stats.Cached,
					DurationMs:   evt.Stats.DurationMs,
					ToolCalls:    evt.Stats.ToolCalls,
				}
				// 提取第一个 model 名作为标识
				for modelName := range evt.Stats.Models {
					stats.Model = modelName
					break
				}
			}
			cb.OnTurnComplete("end_turn", "", stats)
		}

	case "error":
		errMsg := evt.Error
		if errMsg == "" {
			errMsg = evt.Message
		}
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("error", errMsg, nil)
		}

	case "log":
		if cb.OnThoughtChunk != nil && evt.Message != "" {
			cb.OnThoughtChunk("[Log] " + evt.Message + "\n")
		}

	default:
		log.Printf("[GeminiParser] Unknown event type: %s", evt.Type)
		if cb.OnUnknownEvent != nil {
			cb.OnUnknownEvent(evt.Type, string(raw))
		}
	}
}

// ==================== Codex CLI Stream Parser ====================

// CodexStreamParser 解析 OpenAI Codex CLI 的输出。
// Codex CLI 使用 `codex --quiet` 模式。
type CodexStreamParser struct{}

// codexEvent 是 Codex CLI 的事件结构
type codexEvent struct {
	Type    string          `json:"type"`
	Text    string          `json:"text,omitempty"`
	Content string          `json:"content,omitempty"`
	Name    string          `json:"name,omitempty"`
	Input   json.RawMessage `json:"input,omitempty"`
	Message string          `json:"message,omitempty"`
	Error   string          `json:"error,omitempty"`
}

// Parse 解析 Codex CLI 事件
func (p *CodexStreamParser) Parse(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int) {
	if cb == nil {
		return
	}

	var evt codexEvent
	if err := json.Unmarshal(raw, &evt); err != nil {
		log.Printf("[CodexParser] Failed to parse event: %v", err)
		return
	}

	switch evt.Type {
	case "text", "message":
		text := evt.Text
		if text == "" {
			text = evt.Content
		}
		if cb.OnMessageChunk != nil && text != "" {
			cb.OnMessageChunk(text)
		}

	case "thinking":
		if cb.OnThoughtChunk != nil && evt.Text != "" {
			cb.OnThoughtChunk(evt.Text)
		}

	case "tool-use", "function_call":
		if cb.OnToolCall != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			inputStr := string(evt.Input)
			cb.OnToolCall(&ToolCallEvent{
				ToolCallID: toolCallID,
				Title:      evt.Name,
				Kind:       classifyToolKind(evt.Name),
				Status:     "in_progress",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: inputStr},
				},
			})
		}

	case "tool-result", "function_result":
		if cb.OnToolCallUpdate != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			cb.OnToolCallUpdate(&ToolCallUpdateEvent{
				ToolCallID: toolCallID,
				Status:     "completed",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: evt.Content},
				},
			})
		}

	case "result", "done":
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("end_turn", "", nil)
		}

	case "error":
		errMsg := evt.Error
		if errMsg == "" {
			errMsg = evt.Message
		}
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("error", errMsg, nil)
		}

	default:
		log.Printf("[CodexParser] Unknown event type: %s", evt.Type)
		if cb.OnUnknownEvent != nil {
			cb.OnUnknownEvent(evt.Type, string(raw))
		}
	}
}

// ==================== Generic Stream Parser ====================

// GenericStreamParser 是通用的 stream-json 解析器，
// 尝试兼容各种 Agent 的输出格式。
type GenericStreamParser struct{}

// Parse 解析通用 NDJSON 事件
func (p *GenericStreamParser) Parse(raw json.RawMessage, cb *BackendCallbacks, toolCallCounter *int) {
	if cb == nil {
		return
	}

	// 尝试提取 type 字段
	var evt struct {
		Type    string `json:"type"`
		Text    string `json:"text,omitempty"`
		Content string `json:"content,omitempty"`
		Message string `json:"message,omitempty"`
		Error   string `json:"error,omitempty"`
	}
	if err := json.Unmarshal(raw, &evt); err != nil {
		log.Printf("[GenericParser] Failed to parse event: %v", err)
		return
	}

	text := evt.Text
	if text == "" {
		text = evt.Content
	}
	if text == "" {
		text = evt.Message
	}

	switch evt.Type {
	case "text", "message", "assistant", "content":
		if cb.OnMessageChunk != nil && text != "" {
			cb.OnMessageChunk(text)
		}

	case "thinking", "thought":
		if cb.OnThoughtChunk != nil && text != "" {
			cb.OnThoughtChunk(text)
		}

	case "tool-use", "tool_use", "function_call":
		if cb.OnToolCall != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			cb.OnToolCall(&ToolCallEvent{
				ToolCallID: toolCallID,
				Title:      text,
				Kind:       "execute",
				Status:     "in_progress",
			})
		}

	case "tool-result", "tool_result", "function_result":
		if cb.OnToolCallUpdate != nil {
			*toolCallCounter++
			toolCallID := fmt.Sprintf("cli-tc-%d", *toolCallCounter)
			cb.OnToolCallUpdate(&ToolCallUpdateEvent{
				ToolCallID: toolCallID,
				Status:     "completed",
				Content: []ToolCallContentEvent{
					{Type: "text", Text: text},
				},
			})
		}

	case "status", "log", "info":
		if cb.OnThoughtChunk != nil && text != "" {
			cb.OnThoughtChunk(fmt.Sprintf("[%s] %s\n", evt.Type, text))
		}

	case "result", "done", "end":
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("end_turn", "", nil)
		}

	case "error":
		errMsg := evt.Error
		if errMsg == "" {
			errMsg = text
		}
		if cb.OnTurnComplete != nil {
			cb.OnTurnComplete("error", errMsg, nil)
		}

	default:
		// 未知类型：如果有文本内容，作为消息推送
		if text != "" && cb.OnMessageChunk != nil {
			cb.OnMessageChunk(text)
		} else {
			log.Printf("[GenericParser] Unknown event type: %s", evt.Type)
			if cb.OnUnknownEvent != nil {
				cb.OnUnknownEvent(evt.Type, string(raw))
			}
		}
	}
}

// ==================== 工具分类辅助函数 ====================

// classifyToolKind 根据工具名推断工具类型
func classifyToolKind(toolName string) string {
	switch toolName {
	case "Read", "ReadFile", "read_file", "cat", "View":
		return "read"
	case "Write", "WriteFile", "write_file", "Edit", "edit_file",
		"Replace", "replace_in_file", "Insert", "insert_code":
		return "edit"
	case "Delete", "delete_file", "Remove", "remove_file":
		return "delete"
	case "Bash", "bash", "Execute", "execute_command", "Shell", "shell",
		"RunCommand", "Terminal", "terminal":
		return "execute"
	case "Think", "think", "TodoWrite", "Summarize":
		return "think"
	case "Search", "search", "Grep", "grep", "Find", "find",
		"search_files", "list_files", "ListFiles":
		return "read"
	default:
		return "execute"
	}
}
