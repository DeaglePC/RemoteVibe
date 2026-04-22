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
  model?: string;           // 指定模型（如 gemini-2.5-pro），空字符串使用默认
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
  FILE_CHANGE: 'file_change',
  GEMINI_SESSIONS: 'gemini_sessions',
  ACP_LOG: 'acp_log',
  FS_EVENT: 'fs_event',
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
  mode?: 'acp' | 'cli'; // Agent 通信模式
  available?: boolean;   // 命令是否在远程服务器上可用
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
  locations?: ToolCallLocation[];
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

export interface ToolCallLocation {
  path: string;
  line?: number;
}

export interface FileChangePayload {
  path: string;
  action: 'write' | 'create';
  size: number;
  oldText?: string;
  newText?: string;
}

export interface FSEventPayload {
  path: string;   // 变化的文件/目录完整路径
  dir: string;    // 变化所在的父目录路径
  name: string;   // 文件/目录名
  action: 'create' | 'remove' | 'modify';
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
  errorMessage?: string;
  stats?: TurnStats;
}

export interface TurnStats {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  durationMs?: number;
  toolCalls?: number;
  model?: string;
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

export interface ACPLogPayload {
  direction: 'tx' | 'rx';
  message: string;
  timestamp: number;
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

/**
 * Agent 种类标识。用于按 agent 切分可用的 slash 命令表。
 * - gemini: Google Gemini CLI
 * - claude: Anthropic Claude Code
 * - codex:  OpenAI Codex CLI
 * - opencode: OpenCode（开源项目，早期沿用 codex 集合）
 */
export type AgentKind = 'gemini' | 'claude' | 'codex' | 'opencode';

/**
 * 根据后端 agentId 推断 AgentKind。
 * 后端 agentId 约定参见 server/internal/agent/cli_parsers.go 的分发 switch。
 */
export function inferAgentKind(agentId: string | null | undefined): AgentKind | null {
  if (!agentId) {
    return null;
  }
  const id = agentId.toLowerCase();
  if (id.startsWith('gemini')) {
    return 'gemini';
  }
  if (id.startsWith('claude')) {
    return 'claude';
  }
  if (id.startsWith('codex')) {
    return 'codex';
  }
  if (id.startsWith('opencode')) {
    return 'opencode';
  }
  return null;
}

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** 命令分类：local = 前端本地处理；agent = 透传给当前 agent 的命令 */
  scope: 'local' | 'agent';
  /** 命令分组标题（用于下拉列表分组展示） */
  group: string;
  /**
   * Agent 命令在 Web 模式下的处理方式：
   * - 'prompt': 通过自然语言 prompt 发送给 agent，让 LLM 给出近似结果
   * 当前只保留 'prompt' 型；info 型（仅显示"去终端用"提示）已在瘦身时全部移除
   * 仅在 scope='agent' 时有效
   */
  webAction?: 'prompt';
  /** webAction='prompt' 时发送的自然语言 prompt */
  webPrompt?: string;
}

/**
 * 前端本地处理的命令（不依赖具体 agent）
 */
const LOCAL_COMMANDS: SlashCommand[] = [
  { id: 'help', name: '/help', description: 'Show all available commands', icon: '❓', scope: 'local', group: 'App' },
  { id: 'clear', name: '/clear', description: 'Clear chat history (local only)', icon: '🧹', scope: 'local', group: 'App' },
  { id: 'files', name: '/files', description: 'Toggle file browser sidebar', icon: '📂', scope: 'local', group: 'App' },
  { id: 'history', name: '/history', description: 'Show and restore past sessions', icon: '🕐', scope: 'local', group: 'App' },
  { id: 'status', name: '/status', description: 'Show agent connection status', icon: '📊', scope: 'local', group: 'App' },
  { id: 'stop', name: '/stop', description: 'Stop current agent process', icon: '⏹️', scope: 'local', group: 'App' },
  { id: 'restart', name: '/restart', description: 'Restart current agent process', icon: '🔄', scope: 'local', group: 'App' },
  { id: 'log', name: '/log', description: 'Toggle ACP protocol log panel', icon: '📡', scope: 'local', group: 'App' },
];

/**
 * Gemini CLI agent 命令（Web 模式下以 prompt 形式透传，让模型给出近似效果）。
 *
 * ⚠️ 说明：Gemini CLI 的斜杠命令原本只在其交互终端 UI 层处理，ACP / stream-json
 * 协议层并不能真正执行；这里保留的几条是"让 LLM 按提示回答"的近似实现，
 * 对用户仍有帮助的项目（总结、列工具、读取/生成 GEMINI.md、统计、自我介绍）。
 * 已删除的伪实现命令：/model（并不真的切模型）、/plan（并不真的切 Plan Mode）。
 */
const GEMINI_AGENT_COMMANDS: SlashCommand[] = [
  {
    id: 'gemini:compress', name: '/compress', description: 'Summarize the conversation so far',
    icon: '📦', scope: 'agent', group: 'Conversation',
    webAction: 'prompt',
    webPrompt: 'Please summarize our conversation so far into a concise summary, highlighting the key decisions, code changes, and remaining tasks.',
  },
  {
    id: 'gemini:tools', name: '/tools', description: 'List available Gemini CLI tools',
    icon: '🔧', scope: 'agent', group: 'Tools & MCP',
    webAction: 'prompt',
    webPrompt: 'List all the tools you currently have available, grouped by category. For each tool, show its name and a brief description.',
  },
  {
    id: 'gemini:memory', name: '/memory', description: 'Show GEMINI.md instructional memory',
    icon: '🧠', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Show me the current contents of the GEMINI.md memory file if it exists, or explain what GEMINI.md is and how to create one.',
  },
  {
    id: 'gemini:init', name: '/init', description: 'Analyze project and create a tailored GEMINI.md',
    icon: '📝', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Analyze this project structure, tech stack, and codebase, then create or update a GEMINI.md file with tailored instructions for working with this project.',
  },
  {
    id: 'gemini:stats', name: '/stats', description: 'Show session / model / tool usage stats',
    icon: '📈', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'Show me the current session statistics: how many messages we have exchanged, what tools you have used, and any other relevant usage stats.',
  },
  {
    id: 'gemini:about', name: '/about', description: 'Show Gemini CLI version info',
    icon: 'ℹ️', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'What version of Gemini CLI are you? Please show your version, model info, and any other relevant details about your setup.',
  },
];

/**
 * Claude Code agent 命令（Web 模式下以 prompt 形式透传）。
 *
 * 命名对齐 Claude Code CLI 的真实 slash 命令语义：
 * /compact、/cost、CLAUDE.md 作为项目指令记忆文件。
 */
const CLAUDE_AGENT_COMMANDS: SlashCommand[] = [
  {
    id: 'claude:compact', name: '/compact', description: 'Summarize and compact conversation history',
    icon: '📦', scope: 'agent', group: 'Conversation',
    webAction: 'prompt',
    webPrompt: 'Please summarize our conversation so far into a concise summary, highlighting the key decisions, code changes, and remaining tasks.',
  },
  {
    id: 'claude:tools', name: '/tools', description: 'List available tools',
    icon: '🔧', scope: 'agent', group: 'Tools & MCP',
    webAction: 'prompt',
    webPrompt: 'List all the tools you currently have available, grouped by category. For each tool, show its name and a brief description.',
  },
  {
    id: 'claude:memory', name: '/memory', description: 'Show CLAUDE.md instructional memory',
    icon: '🧠', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Show me the current contents of the CLAUDE.md memory file if it exists, or explain what CLAUDE.md is and how to create one.',
  },
  {
    id: 'claude:init', name: '/init', description: 'Analyze project and create a tailored CLAUDE.md',
    icon: '📝', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Analyze this project structure, tech stack, and codebase, then create or update a CLAUDE.md file with tailored instructions for working with this project.',
  },
  {
    id: 'claude:cost', name: '/cost', description: 'Show session cost and token usage',
    icon: '💰', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'Show me the current session cost and token usage breakdown (input/output/cached tokens, estimated cost).',
  },
  {
    id: 'claude:about', name: '/about', description: 'Show Claude Code version info',
    icon: 'ℹ️', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'What version of Claude Code are you? Please show your version, model info, and any other relevant details about your setup.',
  },
];

/**
 * OpenAI Codex CLI agent 命令（Web 模式下以 prompt 形式透传）。
 *
 * Codex / OpenCode 生态使用 AGENTS.md 作为项目指令记忆文件。
 */
const CODEX_AGENT_COMMANDS: SlashCommand[] = [
  {
    id: 'codex:compact', name: '/compact', description: 'Compact conversation history',
    icon: '📦', scope: 'agent', group: 'Conversation',
    webAction: 'prompt',
    webPrompt: 'Please summarize our conversation so far into a concise summary, highlighting the key decisions, code changes, and remaining tasks.',
  },
  {
    id: 'codex:tools', name: '/tools', description: 'List available tools',
    icon: '🔧', scope: 'agent', group: 'Tools & MCP',
    webAction: 'prompt',
    webPrompt: 'List all the tools you currently have available, grouped by category. For each tool, show its name and a brief description.',
  },
  {
    id: 'codex:memory', name: '/memory', description: 'Show AGENTS.md instructional memory',
    icon: '🧠', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Show me the current contents of the AGENTS.md memory file if it exists, or explain what AGENTS.md is and how to create one.',
  },
  {
    id: 'codex:init', name: '/init', description: 'Analyze project and create a tailored AGENTS.md',
    icon: '📝', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Analyze this project structure, tech stack, and codebase, then create or update an AGENTS.md file with tailored instructions for working with this project.',
  },
  {
    id: 'codex:stats', name: '/stats', description: 'Show session / model / tool usage stats',
    icon: '📈', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'Show me the current session statistics: how many messages we have exchanged, what tools you have used, and any other relevant usage stats.',
  },
  {
    id: 'codex:about', name: '/about', description: 'Show Codex CLI version info',
    icon: 'ℹ️', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'What version of Codex CLI are you? Please show your version, model info, and any other relevant details about your setup.',
  },
];

/**
 * OpenCode agent 命令（Web 模式下以 prompt 形式透传）。
 * 早期阶段沿用 Codex 集合（AGENTS.md 记忆文件、同一组命令），待正式接入后再细化。
 */
const OPENCODE_AGENT_COMMANDS: SlashCommand[] = CODEX_AGENT_COMMANDS.map((cmd) => ({
  ...cmd,
  id: cmd.id.replace(/^codex:/, 'opencode:'),
}));

/** 按 agent kind 索引的命令表 */
const AGENT_COMMANDS_BY_KIND: Record<AgentKind, SlashCommand[]> = {
  gemini: GEMINI_AGENT_COMMANDS,
  claude: CLAUDE_AGENT_COMMANDS,
  codex: CODEX_AGENT_COMMANDS,
  opencode: OPENCODE_AGENT_COMMANDS,
};

/**
 * 根据当前 agent kind 获取可用的 slash 命令列表：本地命令 + 对应 agent 的命令。
 * 当 kind 为 null / undefined 时仅返回本地命令（未启动 agent 时不显示 agent 命令）。
 */
export function getSlashCommands(kind?: AgentKind | null): SlashCommand[] {
  if (!kind) {
    return [...LOCAL_COMMANDS];
  }
  return [...LOCAL_COMMANDS, ...AGENT_COMMANDS_BY_KIND[kind]];
}

/**
 * 兼容保留：默认返回 local + gemini 集合，用于尚未迁移到 getSlashCommands(kind) 的调用方。
 * 新代码请使用 getSlashCommands(kind)。
 */
export const SLASH_COMMANDS: SlashCommand[] = [...LOCAL_COMMANDS, ...GEMINI_AGENT_COMMANDS];
