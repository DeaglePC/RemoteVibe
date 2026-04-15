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

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** 命令分类：local = 前端本地处理，agent = Gemini CLI 终端命令（Web 模式下不可用） */
  scope: 'local' | 'agent';
  /** 命令分组标题（用于下拉列表分组展示） */
  group: string;
  /**
   * Agent 命令在 Web 模式下的处理方式：
   * - 'prompt': 通过自然语言 prompt 发送给 Gemini CLI 实现近似效果
   * - 'info': 仅在前端显示提示信息（命令仅限 CLI 终端使用）
   * 仅在 scope='agent' 时有效
   */
  webAction?: 'prompt' | 'info';
  /** webAction='prompt' 时发送的自然语言 prompt */
  webPrompt?: string;
  /** webAction='info' 时显示的提示信息 */
  webInfo?: string;
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
  { id: 'log', name: '/log', description: 'Toggle ACP protocol log panel', icon: '📡', scope: 'local', group: 'App' },
];

/**
 * Gemini CLI 内置斜杠命令
 *
 * ⚠️ 重要说明：Gemini CLI 的斜杠命令只在交互式终端 UI 层处理，
 * ACP 协议的 session/prompt 无法执行这些命令（会被当作普通文本发给 LLM）。
 *
 * 因此每个命令通过 webAction 指定在 Web 模式下的替代行为：
 * - webAction='prompt': 用自然语言 prompt 让 LLM 提供近似结果
 * - webAction='info': 仅在前端显示提示信息，告知用户在终端中使用
 *
 * 参考 Gemini CLI BuiltinCommandLoader 定义
 */
const AGENT_COMMANDS: SlashCommand[] = [
  // Session & Conversation
  {
    id: 'agent:compress', name: '/compress', description: 'Compress context by replacing it with a summary',
    icon: '📦', scope: 'agent', group: 'Conversation',
    webAction: 'prompt',
    webPrompt: 'Please summarize our conversation so far into a concise summary, highlighting the key decisions, code changes, and remaining tasks.',
  },
  {
    id: 'agent:rewind', name: '/rewind', description: 'Jump back to a specific message and restart',
    icon: '⏪', scope: 'agent', group: 'Conversation',
    webAction: 'info',
    webInfo: '`/rewind` is a Gemini CLI terminal command that interactively lets you jump back to a previous message. This feature is not available in Web mode.\n\n💡 Tip: You can describe what you want to undo, and the agent will help you revert changes.',
  },
  {
    id: 'agent:chat', name: '/chat', description: 'Browse auto-saved conversations and checkpoints',
    icon: '💬', scope: 'agent', group: 'Conversation',
    webAction: 'info',
    webInfo: '`/chat` is a Gemini CLI terminal command for browsing saved conversations. In Web mode, use the **Session History** feature in the top bar, or type `/history` to view past sessions.',
  },
  {
    id: 'agent:resume', name: '/resume', description: 'Resume a previous conversation session',
    icon: '▶️', scope: 'agent', group: 'Conversation',
    webAction: 'info',
    webInfo: '`/resume` is a Gemini CLI terminal command. In Web mode, use the **Session Switcher** in the top bar to restore a previous session.',
  },
  {
    id: 'agent:copy', name: '/copy', description: 'Copy the last result or code snippet to clipboard',
    icon: '📋', scope: 'agent', group: 'Conversation',
    webAction: 'info',
    webInfo: '`/copy` is a Gemini CLI terminal command. In Web mode, you can select and copy text directly from the chat messages, or use the copy button on code blocks.',
  },

  // Tools & MCP
  {
    id: 'agent:tools', name: '/tools', description: 'List available Gemini CLI tools',
    icon: '🔧', scope: 'agent', group: 'Tools & MCP',
    webAction: 'prompt',
    webPrompt: 'List all the tools you currently have available, grouped by category. For each tool, show its name and a brief description.',
  },
  {
    id: 'agent:mcp', name: '/mcp', description: 'Manage Model Context Protocol (MCP) servers',
    icon: '🔌', scope: 'agent', group: 'Tools & MCP',
    webAction: 'info',
    webInfo: '`/mcp` is a Gemini CLI terminal command for managing MCP servers interactively. This feature is not available in Web mode.\n\n💡 Tip: To configure MCP servers, edit your `settings.json` file directly.',
  },

  // Memory & Context
  {
    id: 'agent:memory', name: '/memory', description: 'Interact with GEMINI.md instructional memory',
    icon: '🧠', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Show me the current contents of the GEMINI.md memory file if it exists, or explain what GEMINI.md is and how to create one.',
  },
  {
    id: 'agent:init', name: '/init', description: 'Analyze project and create a tailored GEMINI.md',
    icon: '📝', scope: 'agent', group: 'Memory & Context',
    webAction: 'prompt',
    webPrompt: 'Analyze this project structure, tech stack, and codebase, then create or update a GEMINI.md file with tailored instructions for working with this project.',
  },

  // Configuration
  {
    id: 'agent:model', name: '/model', description: 'View or change the current model',
    icon: '🤖', scope: 'agent', group: 'Configuration',
    webAction: 'prompt',
    webPrompt: 'What model are you currently using? Please show your model name and version info.',
  },
  {
    id: 'agent:theme', name: '/theme', description: 'Change the color theme',
    icon: '🎨', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/theme` is a Gemini CLI terminal command for changing the CLI color theme. In Web mode, the theme is controlled by the RemoteVibe app settings.',
  },
  {
    id: 'agent:settings', name: '/settings', description: 'View and edit Gemini CLI settings',
    icon: '⚙️', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/settings` is a Gemini CLI terminal command for editing settings interactively. This feature is not available in Web mode.\n\n💡 Tip: To view or edit settings, modify `~/.gemini/settings.json` directly.',
  },
  {
    id: 'agent:editor', name: '/editor', description: 'Set external editor preference',
    icon: '✏️', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/editor` is a Gemini CLI terminal command for setting the external editor. This feature is not available in Web mode.',
  },
  {
    id: 'agent:permissions', name: '/permissions', description: 'Manage folder trust and permissions',
    icon: '🔐', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/permissions` is a Gemini CLI terminal command for managing folder trust. In Web mode, permissions are handled through the permission request dialog when the agent needs access.',
  },
  {
    id: 'agent:plan', name: '/plan', description: 'Switch to Plan Mode and view current plan',
    icon: '📋', scope: 'agent', group: 'Configuration',
    webAction: 'prompt',
    webPrompt: 'Please switch to plan mode. Before making any changes, first create a detailed plan and present it for my review.',
  },
  {
    id: 'agent:terminal-setup', name: '/terminal-setup', description: 'Configure terminal keybindings for multiline input',
    icon: '⌨️', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/terminal-setup` is a Gemini CLI terminal command for configuring keybindings. This feature is not applicable in Web mode — use Shift+Enter for multiline input.',
  },
  {
    id: 'agent:vim', name: '/vim', description: 'Toggle vim mode on or off',
    icon: '🖊️', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/vim` is a Gemini CLI terminal command for toggling vim keybindings. This feature is not available in Web mode.',
  },
  {
    id: 'agent:privacy', name: '/privacy', description: 'Show privacy notice and data collection preferences',
    icon: '🔒', scope: 'agent', group: 'Configuration',
    webAction: 'info',
    webInfo: '`/privacy` is a Gemini CLI terminal command. For privacy information, visit the [Gemini CLI documentation](https://github.com/google-gemini/gemini-cli#privacy).',
  },

  // Info & Stats
  {
    id: 'agent:stats', name: '/stats', description: 'Check session/model/tool usage stats',
    icon: '📈', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'Show me the current session statistics: how many messages we have exchanged, what tools you have used, and any other relevant usage stats.',
  },
  {
    id: 'agent:about', name: '/about', description: 'Show Gemini CLI version info',
    icon: 'ℹ️', scope: 'agent', group: 'Info',
    webAction: 'prompt',
    webPrompt: 'What version of Gemini CLI are you? Please show your version, model info, and any other relevant details about your setup.',
  },
  {
    id: 'agent:docs', name: '/docs', description: 'Open Gemini CLI documentation in browser',
    icon: '📖', scope: 'agent', group: 'Info',
    webAction: 'info',
    webInfo: '📖 Gemini CLI Documentation: [https://github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)',
  },
  {
    id: 'agent:bug', name: '/bug', description: 'Submit a bug report',
    icon: '🐛', scope: 'agent', group: 'Info',
    webAction: 'info',
    webInfo: '🐛 To report a Gemini CLI bug, visit: [https://github.com/google-gemini/gemini-cli/issues](https://github.com/google-gemini/gemini-cli/issues)',
  },
  {
    id: 'agent:upgrade', name: '/upgrade', description: 'Open upgrade page in browser',
    icon: '⬆️', scope: 'agent', group: 'Info',
    webAction: 'info',
    webInfo: '⬆️ To upgrade Gemini CLI, run in your terminal:\n```\nnpm update -g @anthropic-ai/gemini-cli\n```\nOr visit: [https://github.com/google-gemini/gemini-cli/releases](https://github.com/google-gemini/gemini-cli/releases)',
  },

  // Auth & Account
  {
    id: 'agent:auth', name: '/auth', description: 'Manage authentication method',
    icon: '🔑', scope: 'agent', group: 'Auth',
    webAction: 'info',
    webInfo: '`/auth` is a Gemini CLI terminal command for managing authentication. This feature requires the interactive terminal.\n\n💡 Tip: To change auth method, run `gemini /auth` in your terminal.',
  },

  // Agents
  {
    id: 'agent:agents', name: '/agents', description: 'Manage local and remote sub-agents',
    icon: '🤝', scope: 'agent', group: 'Agents',
    webAction: 'info',
    webInfo: '`/agents` is a Gemini CLI terminal command for managing sub-agents interactively. This feature is not available in Web mode.',
  },

  // Extensions & Skills
  {
    id: 'agent:extensions', name: '/extensions', description: 'Manage Gemini CLI extensions',
    icon: '🧩', scope: 'agent', group: 'Extensions',
    webAction: 'info',
    webInfo: '`/extensions` is a Gemini CLI terminal command for managing extensions interactively. This feature is not available in Web mode.',
  },
  {
    id: 'agent:skills', name: '/skills', description: 'List, enable, or disable agent skills',
    icon: '🎯', scope: 'agent', group: 'Extensions',
    webAction: 'info',
    webInfo: '`/skills` is a Gemini CLI terminal command for managing agent skills. This feature is not available in Web mode.',
  },
  {
    id: 'agent:hooks', name: '/hooks', description: 'Manage lifecycle hooks',
    icon: '🪝', scope: 'agent', group: 'Extensions',
    webAction: 'info',
    webInfo: '`/hooks` is a Gemini CLI terminal command for managing lifecycle hooks. This feature is not available in Web mode.',
  },
  {
    id: 'agent:commands', name: '/commands', description: 'Manage custom slash commands',
    icon: '⌨️', scope: 'agent', group: 'Extensions',
    webAction: 'info',
    webInfo: '`/commands` is a Gemini CLI terminal command for managing custom commands. This feature is not available in Web mode.',
  },

  // Workspace
  {
    id: 'agent:directory', name: '/directory', description: 'Manage workspace directories',
    icon: '📁', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/directory` is a Gemini CLI terminal command. In Web mode, use the **File Browser** sidebar (or `/files`) to browse workspace directories.',
  },
  {
    id: 'agent:policies', name: '/policies', description: 'Manage policies',
    icon: '📜', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/policies` is a Gemini CLI terminal command for managing policies interactively. This feature is not available in Web mode.',
  },
  {
    id: 'agent:restore', name: '/restore', description: 'Restore a tool call checkpoint',
    icon: '♻️', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/restore` is a Gemini CLI terminal command for restoring tool call checkpoints. This feature is not available in Web mode.\n\n💡 Tip: You can ask the agent to undo specific changes by describing what you want to revert.',
  },
  {
    id: 'agent:ide', name: '/ide', description: 'Manage IDE integrations',
    icon: '💻', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/ide` is a Gemini CLI terminal command for managing IDE integrations. This feature is not available in Web mode.',
  },
  {
    id: 'agent:setup-github', name: '/setup-github', description: 'Setup GitHub Actions for issue triage and PR review',
    icon: '🐙', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/setup-github` is a Gemini CLI terminal command for setting up GitHub Actions. This feature requires the interactive terminal.\n\n💡 Tip: Run `gemini /setup-github` in your terminal to set it up.',
  },
  {
    id: 'agent:shells', name: '/shells', description: 'Toggle background shell view and manage running processes',
    icon: '🐚', scope: 'agent', group: 'Workspace',
    webAction: 'info',
    webInfo: '`/shells` is a Gemini CLI terminal command for managing background shell processes. This feature is not available in Web mode.',
  },
];

/** 所有可用的 slash 命令（前端本地 + agent 透传） */
export const SLASH_COMMANDS: SlashCommand[] = [...LOCAL_COMMANDS, ...AGENT_COMMANDS];
