// WebSocket gateway protocol types — mirrors Go backend protocol.go

// ==================== Client → Server ====================

export interface ClientMessage {
  type: string;
  payload: unknown;
}

export interface StartAgentPayload {
  agentId: string;
  workDir?: string;
}

export interface SendPromptPayload {
  text: string;
}

export interface PermissionResponsePayload {
  requestId: unknown;
  optionId: string;
}

// ==================== Server → Client ====================

export interface ServerMessage {
  type: string;
  payload: unknown;
}

// Message types
export const MSG = {
  AGENT_STATUS: 'agent_status',
  AGENT_LIST: 'agent_list',
  MESSAGE_CHUNK: 'message_chunk',
  TOOL_CALL: 'tool_call',
  TOOL_CALL_UPDATE: 'tool_call_update',
  PERMISSION_REQUEST: 'permission_request',
  TURN_COMPLETE: 'turn_complete',
  PLAN_UPDATE: 'plan_update',
  ERROR: 'error',
} as const;

export interface AgentStatusPayload {
  agentId: string;
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error' | 'disconnected';
  error?: string;
}

export interface AgentListPayload {
  agents: AgentInfo[];
}

export interface AgentInfo {
  id: string;
  name: string;
  status: string;
}

export interface MessageChunkPayload {
  text: string;
}

export interface ToolCallPayload {
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
  content?: ToolCallContent[];
}

export interface ToolCallUpdatePayload {
  toolCallId: string;
  status?: string;
  content?: ToolCallContent[];
}

export interface ToolCallContent {
  type: 'text' | 'diff' | 'terminal';
  text?: string;
  path?: string;
  oldText?: string;
  newText?: string;
}

export interface PermissionRequestPayload {
  requestId: unknown;
  toolCallId: string;
  options: PermissionOption[];
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

export interface TurnCompletePayload {
  stopReason: string;
}

export interface PlanUpdatePayload {
  entries: PlanEntry[];
}

export interface PlanEntry {
  content: string;
  priority: string;
  status: string;
}

export interface ErrorPayload {
  message: string;
}
