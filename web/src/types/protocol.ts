// WebSocket gateway protocol types — mirrors Go backend protocol.go

// ==================== Client → Server ====================

export interface ClientMessage {
  type: string;
  payload: unknown;
}

export interface StartAgentPayload {
  agentId: string;
  workDir?: string;
  geminiSessionId?: string; // 非空时恢复 Gemini CLI 原生会话
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
  THOUGHT_CHUNK: 'thought_chunk',
  TOOL_CALL: 'tool_call',
  TOOL_CALL_UPDATE: 'tool_call_update',
  PERMISSION_REQUEST: 'permission_request',
  TURN_COMPLETE: 'turn_complete',
  PLAN_UPDATE: 'plan_update',
  ERROR: 'error',
  GEMINI_SESSIONS: 'gemini_sessions',
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

// ==================== Gemini CLI Native Session Types ====================

export interface GeminiSessionInfo {
  id: string;
  title: string;
  createdAt: number;   // Unix ms timestamp
  updatedAt: number;   // Unix ms timestamp
  messageCount: number;
}

export interface GeminiSessionsPayload {
  workDir: string;
  sessions: GeminiSessionInfo[];
}

// ==================== Browse/Files API Types ====================

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modTime: number; // Unix ms timestamp
}

export interface BrowseResult {
  path: string;
  entries: FileEntry[];
  error?: string;
}

export interface FilesResult {
  path: string;
  isDir: boolean;
  entries?: FileEntry[];
  file?: FileEntry;
  error?: string;
}

// ==================== Slash Commands ====================

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** 命令分类：local = 前端本地处理，agent = 透传给 Gemini CLI agent */
  scope: 'local' | 'agent';
  /** 命令分组标题（用于下拉列表分组展示） */
  group: string;
}

/**
 * 前端本地处理的命令（不需要 agent 运行就能执行）
 */
const LOCAL_COMMANDS: SlashCommand[] = [
  { id: 'help', name: '/help', description: 'Show all available commands', icon: '❓', scope: 'local', group: 'App' },
  { id: 'clear', name: '/clear', description: 'Clear chat history (local only)', icon: '🧹', scope: 'local', group: 'App' },
  { id: 'files', name: '/files', description: 'Toggle file browser sidebar', icon: '📂', scope: 'local', group: 'App' },
  { id: 'history', name: '/history', description: 'Show and restore past sessions', icon: '🕐', scope: 'local', group: 'App' },
  { id: 'status', name: '/status', description: 'Show agent connection status', icon: '📊', scope: 'local', group: 'App' },
  { id: 'stop', name: '/stop', description: 'Stop current agent process', icon: '⏹️', scope: 'local', group: 'App' },
  { id: 'restart', name: '/restart', description: 'Restart current agent process', icon: '🔄', scope: 'local', group: 'App' },
];

/**
 * Gemini CLI 内置命令（透传给 agent 的 ACP session/prompt）
 * 参考 Gemini CLI BuiltinCommandLoader 定义
 */
const AGENT_COMMANDS: SlashCommand[] = [
  // Session & Conversation
  { id: 'agent:compress', name: '/compress', description: 'Compress context by replacing it with a summary', icon: '📦', scope: 'agent', group: 'Conversation' },
  { id: 'agent:rewind', name: '/rewind', description: 'Jump back to a specific message and restart', icon: '⏪', scope: 'agent', group: 'Conversation' },
  { id: 'agent:chat', name: '/chat', description: 'Browse auto-saved conversations and checkpoints', icon: '💬', scope: 'agent', group: 'Conversation' },
  { id: 'agent:resume', name: '/resume', description: 'Resume a previous conversation session', icon: '▶️', scope: 'agent', group: 'Conversation' },
  { id: 'agent:copy', name: '/copy', description: 'Copy the last result or code snippet to clipboard', icon: '📋', scope: 'agent', group: 'Conversation' },

  // Tools & MCP
  { id: 'agent:tools', name: '/tools', description: 'List available Gemini CLI tools', icon: '🔧', scope: 'agent', group: 'Tools & MCP' },
  { id: 'agent:mcp', name: '/mcp', description: 'Manage Model Context Protocol (MCP) servers', icon: '🔌', scope: 'agent', group: 'Tools & MCP' },

  // Memory & Context
  { id: 'agent:memory', name: '/memory', description: 'Interact with GEMINI.md instructional memory', icon: '🧠', scope: 'agent', group: 'Memory & Context' },
  { id: 'agent:init', name: '/init', description: 'Analyze project and create a tailored GEMINI.md', icon: '📝', scope: 'agent', group: 'Memory & Context' },

  // Configuration
  { id: 'agent:model', name: '/model', description: 'View or change the current model', icon: '🤖', scope: 'agent', group: 'Configuration' },
  { id: 'agent:theme', name: '/theme', description: 'Change the color theme', icon: '🎨', scope: 'agent', group: 'Configuration' },
  { id: 'agent:settings', name: '/settings', description: 'View and edit Gemini CLI settings', icon: '⚙️', scope: 'agent', group: 'Configuration' },
  { id: 'agent:editor', name: '/editor', description: 'Set external editor preference', icon: '✏️', scope: 'agent', group: 'Configuration' },
  { id: 'agent:permissions', name: '/permissions', description: 'Manage folder trust and permissions', icon: '🔐', scope: 'agent', group: 'Configuration' },
  { id: 'agent:plan', name: '/plan', description: 'Switch to Plan Mode and view current plan', icon: '📋', scope: 'agent', group: 'Configuration' },

  // Info & Stats
  { id: 'agent:stats', name: '/stats', description: 'Check session/model/tool usage stats', icon: '📈', scope: 'agent', group: 'Info' },
  { id: 'agent:about', name: '/about', description: 'Show Gemini CLI version info', icon: 'ℹ️', scope: 'agent', group: 'Info' },
  { id: 'agent:docs', name: '/docs', description: 'Open Gemini CLI documentation in browser', icon: '📖', scope: 'agent', group: 'Info' },
  { id: 'agent:bug', name: '/bug', description: 'Submit a bug report', icon: '🐛', scope: 'agent', group: 'Info' },

  // Auth & Account
  { id: 'agent:auth', name: '/auth', description: 'Manage authentication method', icon: '🔑', scope: 'agent', group: 'Auth' },

  // Extensions & Skills
  { id: 'agent:extensions', name: '/extensions', description: 'Manage Gemini CLI extensions', icon: '🧩', scope: 'agent', group: 'Extensions' },
  { id: 'agent:skills', name: '/skills', description: 'List, enable, or disable agent skills', icon: '🎯', scope: 'agent', group: 'Extensions' },
  { id: 'agent:hooks', name: '/hooks', description: 'Manage lifecycle hooks', icon: '🪝', scope: 'agent', group: 'Extensions' },
  { id: 'agent:commands', name: '/commands', description: 'Manage custom slash commands', icon: '⌨️', scope: 'agent', group: 'Extensions' },

  // Workspace
  { id: 'agent:directory', name: '/directory', description: 'Manage workspace directories', icon: '📁', scope: 'agent', group: 'Workspace' },
  { id: 'agent:policies', name: '/policies', description: 'Manage policies', icon: '📜', scope: 'agent', group: 'Workspace' },
  { id: 'agent:restore', name: '/restore', description: 'Restore a tool call checkpoint', icon: '♻️', scope: 'agent', group: 'Workspace' },
];

/** 所有可用的 slash 命令（前端本地 + agent 透传） */
export const SLASH_COMMANDS: SlashCommand[] = [...LOCAL_COMMANDS, ...AGENT_COMMANDS];
