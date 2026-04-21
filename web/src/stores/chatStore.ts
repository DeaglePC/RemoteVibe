import { create } from 'zustand';
import type {
  ACPLogPayload,
  AgentInfo,
  FileChangePayload,
  FSEventPayload,
  GeminiSessionInfo,
  PermissionRequestPayload,
  PlanEntry,
  ToolCallContent,
  ToolCallPayload,
  TurnStats,
} from '../types/protocol';
import { getApiBaseUrl, getAuthHeaders } from './backendStore';

// ==================== Message Types ====================

export type MessageRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface ToolCallState extends ToolCallPayload {
  // inherited: toolCallId, title, kind, status, content
  createdAt: number; // 创建时间戳，用于时间线排序
}

// ==================== Session Types ====================

export interface Session {
  id: string;
  name: string;
  agentId: string;
  workDir: string;
  activeModel: string | null;
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallState>;
  pendingPermissions: PermissionRequestPayload[];
  planEntries: PlanEntry[];
  isAgentThinking: boolean;
  agentStatus: string;
  lastTurnStats: TurnStats | null;
  createdAt: number;
}

// ==================== Persistence Types ====================

/** 可序列化的会话快照，用于远程持久化 */
interface SerializedSession {
  id: string;
  name: string;
  agentId: string;
  workDir: string;
  activeModel: string | null;
  messages: ChatMessage[];
  toolCalls: [string, ToolCallState][];
  planEntries: PlanEntry[];
  agentStatus: string;
  lastTurnStats: TurnStats | null;
  createdAt: number;
}

interface PersistedData {
  sessions: SerializedSession[];
  activeSessionId: string | null;
  version: number; // 用于后续数据迁移
}

const STORAGE_VERSION = 1;
const MAX_HISTORY_SESSIONS = 50; // 最多保留的历史会话数量

// ==================== Store Types ====================

interface ChatState {
  // Connection
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  setWsStatus: (status: ChatState['wsStatus']) => void;

  // Agents
  agents: AgentInfo[];
  setAgents: (agents: AgentInfo[]) => void;
  activeAgentId: string | null;
  setActiveAgentId: (id: string | null) => void;
  agentStatus: string;
  setAgentStatus: (status: string) => void;

  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  createSession: (agentId: string, workDir: string, model?: string | null) => string;
  switchSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;

  // History sessions (已关闭 / 历史会话)
  loadHistorySessions: () => void;
  restoreSession: (sessionId: string) => void;
  clearHistory: () => void;

  // Active working directory (set when agent starts)
  activeWorkDir: string | null;
  setActiveWorkDir: (dir: string | null) => void;

  // Active model / latest runtime stats
  activeModel: string | null;
  setActiveModel: (model: string | null) => void;

  // File browser visibility
  showFileBrowser: boolean;
  setShowFileBrowser: (show: boolean) => void;

  // File viewer state
  viewingFile: { path: string; name: string } | null;
  setViewingFile: (file: { path: string; name: string } | null) => void;

  // Gemini CLI native sessions
  geminiSessions: GeminiSessionInfo[];
  geminiSessionsLoading: boolean;
  setGeminiSessions: (sessions: GeminiSessionInfo[]) => void;
  setGeminiSessionsLoading: (loading: boolean) => void;
  fetchGeminiSessions: (workDir: string) => void;

  // Messages
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  appendToLastAgentMessage: (text: string) => void;
  clearMessages: () => void;

  // Tool calls
  toolCalls: Map<string, ToolCallState>;
  addToolCall: (tc: ToolCallPayload) => void;
  updateToolCall: (toolCallId: string, status?: string, content?: ToolCallContent[]) => void;
  /** Turn 结束时将所有 pending/in_progress 的工具调用标记为 completed */
  completeAllToolCalls: () => void;

  // Permission requests
  pendingPermissions: PermissionRequestPayload[];
  addPermissionRequest: (req: PermissionRequestPayload) => void;
  removePermissionRequest: (requestId: unknown) => void;

  // Plan
  planEntries: PlanEntry[];
  setPlanEntries: (entries: PlanEntry[]) => void;

  // Turn state
  isAgentThinking: boolean;
  setIsAgentThinking: (v: boolean) => void;
  thinkingContent: string;
  appendThinkingContent: (text: string) => void;
  clearThinkingContent: () => void;
  /** Agent 当前活动类型，用于 UI 显示更细粒度的状态 */
  agentActivity: 'idle' | 'thinking' | 'streaming' | 'tool_calling';
  setAgentActivity: (activity: ChatState['agentActivity']) => void;

  // Error
  lastError: string | null;
  setLastError: (err: string | null) => void;

  // File changes — 追踪 Agent 修改过的文件
  changedFiles: Map<string, FileChangePayload>;
  addFileChange: (change: FileChangePayload) => void;
  clearChangedFiles: () => void;

  // ACP 协议日志 — 用于显示 Gemini CLI 的所有 ACP 通信
  acpLogs: ACPLogPayload[];
  addACPLog: (log: ACPLogPayload) => void;
  clearACPLogs: () => void;
  showACPLogs: boolean;
  setShowACPLogs: (show: boolean) => void;

  // 文件系统事件 — 由 fsnotify 推送的目录变化
  // 存储最近一次变化事件（每次有新事件时递增版本号，让订阅者能检测变化）
  lastFSEvent: FSEventPayload | null;
  fsEventVersion: number;
  emitFSEvent: (event: FSEventPayload) => void;

  // Turn 统计信息 — 来自 Gemini CLI result 事件
  lastTurnStats: TurnStats | null;
  setLastTurnStats: (stats: TurnStats | null) => void;
}

// ==================== Persistence Helpers ====================

/** 规范化可恢复会话的状态，避免把瞬时连接态持久化后错误恢复。 */
function normalizeRestorableAgentStatus(status: string | null | undefined): string {
  if (status === 'running' || status === 'starting') {
    return 'stopped';
  }

  return status || 'stopped';
}

/** 将 Session 序列化为可存储的 JSON 对象 */
function serializeSession(session: Session): SerializedSession {
  return {
    id: session.id,
    name: session.name,
    agentId: session.agentId,
    workDir: session.workDir,
    activeModel: session.activeModel,
    messages: session.messages,
    toolCalls: Array.from(session.toolCalls.entries()),
    planEntries: session.planEntries,
    agentStatus: normalizeRestorableAgentStatus(session.agentStatus),
    lastTurnStats: session.lastTurnStats,
    createdAt: session.createdAt,
  };
}

/** 将序列化数据还原为 Session 对象 */
function deserializeSession(data: SerializedSession): Session {
  const rawToolCalls = data.toolCalls || [];
  const toolCalls = new Map(
    rawToolCalls.map(([key, toolCall]) => [
      key,
      { ...toolCall, createdAt: toolCall.createdAt || data.createdAt || 0 },
    ]),
  );

  return {
    id: data.id,
    name: data.name,
    agentId: data.agentId,
    workDir: data.workDir,
    activeModel: data.activeModel || null,
    messages: data.messages || [],
    toolCalls,
    pendingPermissions: [], // 历史会话不恢复权限请求
    planEntries: data.planEntries || [],
    isAgentThinking: false,
    agentStatus: normalizeRestorableAgentStatus(data.agentStatus),
    lastTurnStats: data.lastTurnStats || null,
    createdAt: data.createdAt,
  };
}

/** 从远程服务器加载会话数据 */
async function loadPersistedSessions(): Promise<{ sessions: Session[]; activeSessionId: string | null }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/sessions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      console.warn('Failed to load sessions from server:', response.statusText);
      return { sessions: [], activeSessionId: null };
    }

    const data: PersistedData = await response.json();
    if (data.version !== STORAGE_VERSION) {
      return { sessions: [], activeSessionId: null };
    }

    return {
      sessions: (data.sessions || []).map(deserializeSession),
      activeSessionId: data.activeSessionId,
    };
  } catch (error) {
    console.warn('Failed to load sessions from server:', error);
    return { sessions: [], activeSessionId: null };
  }
}

/** 保存会话数据到远程服务器（防抖） */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persistSessions(sessions: Session[], activeSessionId: string | null): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    try {
      const sessionsToSave = sessions
        .filter((session) => session.messages.length > 0)
        .slice(-MAX_HISTORY_SESSIONS);

      const data: PersistedData = {
        sessions: sessionsToSave.map(serializeSession),
        activeSessionId,
        version: STORAGE_VERSION,
      };

      fetch(`${getApiBaseUrl()}/api/sessions`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }).catch((error) => {
        console.warn('Failed to persist sessions to server:', error);
      });
    } catch (error) {
      console.warn('Failed to persist sessions:', error);
    }
  }, 500);
}

// ==================== Store Helpers ====================

let messageIdCounter = 0;
export function genMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

let sessionIdCounter = 0;
function genSessionId(): string {
  return `session_${Date.now()}_${++sessionIdCounter}`;
}

function buildSessionName(agentName: string | undefined, workDir: string): string {
  const worktreeName = workDir.split('/').filter(Boolean).pop() || workDir;
  return `${agentName || 'Agent'} - ${worktreeName}`;
}

function createSessionSnapshot(
  session: Session,
  state: Pick<
    ChatState,
    | 'messages'
    | 'toolCalls'
    | 'pendingPermissions'
    | 'planEntries'
    | 'isAgentThinking'
    | 'agentStatus'
    | 'activeModel'
    | 'lastTurnStats'
  >,
): Session {
  return {
    ...session,
    messages: state.messages,
    toolCalls: state.toolCalls,
    pendingPermissions: state.pendingPermissions,
    planEntries: state.planEntries,
    isAgentThinking: state.isAgentThinking,
    agentStatus: state.agentStatus,
    activeModel: state.activeModel,
    lastTurnStats: state.lastTurnStats,
  };
}

function syncSessionsWithCurrentState(state: ChatState): Session[] {
  if (!state.activeSessionId) {
    return state.sessions;
  }

  return state.sessions.map((session) => {
    if (session.id !== state.activeSessionId) {
      return session;
    }
    return createSessionSnapshot(session, state);
  });
}

function getSessionStatePatch(session: Session): Pick<
  ChatState,
  | 'activeAgentId'
  | 'activeWorkDir'
  | 'activeModel'
  | 'messages'
  | 'toolCalls'
  | 'pendingPermissions'
  | 'planEntries'
  | 'isAgentThinking'
  | 'agentStatus'
  | 'lastTurnStats'
> {
  return {
    activeAgentId: session.agentId,
    activeWorkDir: session.workDir,
    activeModel: session.activeModel,
    messages: session.messages,
    toolCalls: session.toolCalls,
    pendingPermissions: session.pendingPermissions,
    planEntries: session.planEntries,
    isAgentThinking: session.isAgentThinking,
    agentStatus: session.agentStatus,
    lastTurnStats: session.lastTurnStats,
  };
}

function getEmptySessionStatePatch(): Pick<
  ChatState,
  | 'activeAgentId'
  | 'activeWorkDir'
  | 'activeModel'
  | 'messages'
  | 'toolCalls'
  | 'pendingPermissions'
  | 'planEntries'
  | 'isAgentThinking'
  | 'agentStatus'
  | 'lastTurnStats'
> {
  return {
    activeAgentId: null,
    activeWorkDir: null,
    activeModel: null,
    messages: [],
    toolCalls: new Map(),
    pendingPermissions: [],
    planEntries: [],
    isAgentThinking: false,
    agentStatus: 'idle',
    lastTurnStats: null,
  };
}

/** 保存当前活跃会话的状态到 sessions 数组，然后触发持久化 */
function saveCurrentAndPersist(state: ChatState): void {
  const sessions = syncSessionsWithCurrentState(state);
  persistSessions(sessions, state.activeSessionId);
}

// ==================== Store ====================

export const useChatStore = create<ChatState>((set, get) => ({
  // Connection
  wsStatus: 'disconnected',
  setWsStatus: (wsStatus) => set({ wsStatus }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  activeAgentId: null,
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  agentStatus: 'idle',
  setAgentStatus: (status) => {
    set({ agentStatus: status });
    saveCurrentAndPersist(get());
  },

  // Sessions
  sessions: [],
  activeSessionId: null,
  createSession: (agentId, workDir, model = null) => {
    const state = get();
    const sessions = syncSessionsWithCurrentState(state);
    const agent = state.agents.find((item) => item.id === agentId);
    const id = genSessionId();
    const createdAt = Date.now();
    const session: Session = {
      id,
      name: buildSessionName(agent?.name, workDir),
      agentId,
      workDir,
      activeModel: model,
      messages: [],
      toolCalls: new Map(),
      pendingPermissions: [],
      planEntries: [],
      isAgentThinking: false,
      agentStatus: 'starting',
      lastTurnStats: null,
      createdAt,
    };
    const nextSessions = [...sessions, session];

    set({
      sessions: nextSessions,
      activeSessionId: id,
      activeAgentId: agentId,
      activeWorkDir: workDir,
      activeModel: model,
      messages: [],
      toolCalls: new Map(),
      pendingPermissions: [],
      planEntries: [],
      isAgentThinking: false,
      agentStatus: 'starting',
      lastTurnStats: null,
    });

    persistSessions(nextSessions, id);
    return id;
  },
  switchSession: (sessionId) => {
    const state = get();
    const sessions = syncSessionsWithCurrentState(state);
    const targetSession = sessions.find((session) => session.id === sessionId);

    if (!targetSession) {
      return;
    }

    set({
      sessions,
      activeSessionId: sessionId,
      ...getSessionStatePatch(targetSession),
    });
    persistSessions(sessions, sessionId);
  },
  removeSession: (sessionId) => {
    const state = get();
    const syncedSessions = syncSessionsWithCurrentState(state);
    const nextSessions = syncedSessions.filter((session) => session.id !== sessionId);
    const removedActiveSession = state.activeSessionId === sessionId;
    const nextActiveSession = removedActiveSession
      ? nextSessions[0] || null
      : nextSessions.find((session) => session.id === state.activeSessionId) || null;
    const nextActiveSessionId = nextActiveSession?.id || null;

    set({
      sessions: nextSessions,
      activeSessionId: nextActiveSessionId,
      ...(nextActiveSession ? getSessionStatePatch(nextActiveSession) : getEmptySessionStatePatch()),
    });

    persistSessions(nextSessions, nextActiveSessionId);
  },

  // History sessions
  loadHistorySessions: () => {
    loadPersistedSessions().then(({ sessions, activeSessionId }) => {
      if (sessions.length === 0) {
        return;
      }

      const targetSession = activeSessionId
        ? sessions.find((session) => session.id === activeSessionId) || null
        : null;

      set({
        sessions,
        activeSessionId: targetSession?.id || null,
        ...(targetSession ? getSessionStatePatch(targetSession) : getEmptySessionStatePatch()),
      });
    });
  },
  restoreSession: (sessionId) => {
    const state = get();
    const sessions = syncSessionsWithCurrentState(state);
    const targetSession = sessions.find((session) => session.id === sessionId);

    if (!targetSession) {
      return;
    }

    const restoredSession: Session = {
      ...targetSession,
      pendingPermissions: [],
      isAgentThinking: false,
      agentStatus: normalizeRestorableAgentStatus(targetSession.agentStatus),
    };

    const nextSessions = sessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }
      return restoredSession;
    });

    set({
      sessions: nextSessions,
      activeSessionId: sessionId,
      ...getSessionStatePatch(restoredSession),
    });
    persistSessions(nextSessions, sessionId);
  },
  clearHistory: () => {
    const state = get();
    const sessions = syncSessionsWithCurrentState(state).filter((session) => {
      return session.id === state.activeSessionId
        || session.agentStatus === 'running'
        || session.agentStatus === 'starting';
    });

    set({ sessions });
    persistSessions(sessions, state.activeSessionId);
  },

  // Active working directory
  activeWorkDir: null,
  setActiveWorkDir: (dir) => set({ activeWorkDir: dir }),

  // Active model / latest runtime stats
  activeModel: null,
  setActiveModel: (model) => {
    set({ activeModel: model });
    saveCurrentAndPersist(get());
  },

  // File browser
  showFileBrowser: false,
  setShowFileBrowser: (show) => set({ showFileBrowser: show }),

  // File viewer
  viewingFile: null,
  setViewingFile: (file) => set({ viewingFile: file }),

  // Gemini CLI native sessions
  geminiSessions: [],
  geminiSessionsLoading: false,
  setGeminiSessions: (sessions) => set({ geminiSessions: sessions, geminiSessionsLoading: false }),
  setGeminiSessionsLoading: (loading) => set({ geminiSessionsLoading: loading }),
  fetchGeminiSessions: (workDir) => {
    set({ geminiSessionsLoading: true, geminiSessions: [] });
    fetch(`${getApiBaseUrl()}/api/gemini-sessions?workDir=${encodeURIComponent(workDir)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then((response) => response.json())
      .then((data) => {
        set({ geminiSessions: data.sessions || [], geminiSessionsLoading: false });
      })
      .catch((error) => {
        console.warn('[ChatStore] Failed to fetch Gemini CLI sessions:', error);
        set({ geminiSessions: [], geminiSessionsLoading: false });
      });
  },

  // Messages
  messages: [],
  addMessage: (msg) => {
    set((state) => ({ messages: [...state.messages, msg] }));
    saveCurrentAndPersist(get());
  },
  appendToLastAgentMessage: (text) => {
    set((state) => {
      const messages = [...state.messages];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'agent') {
        messages[messages.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + text,
        };
      } else {
        messages.push({
          id: genMessageId(),
          role: 'agent',
          content: text,
          timestamp: Date.now(),
        });
      }
      return { messages };
    });
    // agent 流式输出时不频繁保存，依赖 turn_complete 和 status 变化保存
  },
  clearMessages: () => {
    set({
      messages: [],
      toolCalls: new Map(),
      pendingPermissions: [],
      planEntries: [],
      lastTurnStats: null,
    });
    saveCurrentAndPersist(get());
  },

  // Tool calls
  toolCalls: new Map(),
  addToolCall: (toolCall) => {
    set((state) => {
      const nextToolCalls = new Map(state.toolCalls);
      nextToolCalls.set(toolCall.toolCallId, {
        ...toolCall,
        createdAt: Date.now(),
      });
      return { toolCalls: nextToolCalls };
    });
  },
  updateToolCall: (toolCallId, status, content) => {
    set((state) => {
      const nextToolCalls = new Map(state.toolCalls);
      const existingToolCall = nextToolCalls.get(toolCallId);

      if (!existingToolCall) {
        return { toolCalls: nextToolCalls };
      }

      nextToolCalls.set(toolCallId, {
        ...existingToolCall,
        status: status || existingToolCall.status,
        content: content
          ? [...(existingToolCall.content || []), ...content]
          : existingToolCall.content,
      });
      return { toolCalls: nextToolCalls };
    });
  },
  completeAllToolCalls: () => {
    set((state) => {
      let hasChanges = false;
      const nextToolCalls = new Map(state.toolCalls);

      for (const [toolCallId, toolCall] of nextToolCalls.entries()) {
        if (toolCall.status === 'pending' || toolCall.status === 'in_progress') {
          nextToolCalls.set(toolCallId, {
            ...toolCall,
            status: 'completed',
          });
          hasChanges = true;
        }
      }

      return hasChanges ? { toolCalls: nextToolCalls } : {};
    });
  },

  // Permission requests
  pendingPermissions: [],
  addPermissionRequest: (req) => set((state) => ({
    pendingPermissions: [...state.pendingPermissions, req],
  })),
  removePermissionRequest: (requestId) => set((state) => ({
    pendingPermissions: state.pendingPermissions.filter((request) => request.requestId !== requestId),
  })),

  // Plan
  planEntries: [],
  setPlanEntries: (entries) => set({ planEntries: entries }),

  // Turn state
  isAgentThinking: false,
  setIsAgentThinking: (value) => {
    set({
      isAgentThinking: value,
      agentActivity: value ? 'thinking' : 'idle',
    });
    if (!value) {
      saveCurrentAndPersist(get());
    }
  },
  thinkingContent: '',
  appendThinkingContent: (text) => {
    set((state) => ({ thinkingContent: state.thinkingContent + text }));
  },
  clearThinkingContent: () => set({ thinkingContent: '' }),
  agentActivity: 'idle',
  setAgentActivity: (activity) => set({ agentActivity: activity }),

  // Error
  lastError: null,
  setLastError: (err) => set({ lastError: err }),

  // File changes
  changedFiles: new Map(),
  addFileChange: (change) => {
    set((state) => {
      const nextChangedFiles = new Map(state.changedFiles);
      nextChangedFiles.set(change.path, change);
      return { changedFiles: nextChangedFiles };
    });
  },
  clearChangedFiles: () => set({ changedFiles: new Map() }),

  // ACP 协议日志
  acpLogs: [],
  addACPLog: (log) => {
    set((state) => {
      const logs = [...state.acpLogs, log];
      return {
        acpLogs: logs.length > 500 ? logs.slice(-500) : logs,
      };
    });
  },
  clearACPLogs: () => set({ acpLogs: [] }),
  showACPLogs: false,
  setShowACPLogs: (show) => set({ showACPLogs: show }),

  // 文件系统事件
  lastFSEvent: null,
  fsEventVersion: 0,
  emitFSEvent: (event) => set((state) => ({
    lastFSEvent: event,
    fsEventVersion: state.fsEventVersion + 1,
  })),

  // Turn 统计信息
  lastTurnStats: null,
  setLastTurnStats: (stats) => {
    const nextModel = stats?.model?.trim() || get().activeModel;
    set({
      lastTurnStats: stats,
      activeModel: nextModel || null,
    });
    saveCurrentAndPersist(get());
  },
}));
