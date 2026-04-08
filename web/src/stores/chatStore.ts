import { create } from 'zustand';
import type {
  AgentInfo,
  ToolCallPayload,
  ToolCallContent,
  PermissionRequestPayload,
  PlanEntry,
  GeminiSessionInfo,
} from '../types/protocol';

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
}

// ==================== Session Types ====================

export interface Session {
  id: string;
  name: string;
  agentId: string;
  workDir: string;
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallState>;
  pendingPermissions: PermissionRequestPayload[];
  planEntries: PlanEntry[];
  isAgentThinking: boolean;
  agentStatus: string;
  createdAt: number;
}

// ==================== Persistence Types ====================

/** 可序列化的会话快照，用于远程持久化 */
interface SerializedSession {
  id: string;
  name: string;
  agentId: string;
  workDir: string;
  messages: ChatMessage[];
  toolCalls: [string, ToolCallState][];
  planEntries: PlanEntry[];
  agentStatus: string;
  createdAt: number;
}

interface PersistedData {
  sessions: SerializedSession[];
  activeSessionId: string | null;
  version: number; // 用于后续数据迁移
}

const STORAGE_VERSION = 1;
const MAX_HISTORY_SESSIONS = 50; // 最多保留的历史会话数量

// ==================== 远程持久化辅助函数 ====================

// API 基础 URL 和认证 headers 统一从 backendStore 获取
import { getApiBaseUrl, getAuthHeaders } from './backendStore';

/** 将 Session 序列化为可存储的 JSON 对象 */
function serializeSession(session: Session): SerializedSession {
  return {
    id: session.id,
    name: session.name,
    agentId: session.agentId,
    workDir: session.workDir,
    messages: session.messages,
    toolCalls: Array.from(session.toolCalls.entries()),
    planEntries: session.planEntries,
    agentStatus: session.agentStatus === 'running' ? 'stopped' : session.agentStatus,
    createdAt: session.createdAt,
  };
}

/** 将序列化数据还原为 Session 对象 */
function deserializeSession(data: SerializedSession): Session {
  return {
    ...data,
    toolCalls: new Map(data.toolCalls || []),
    pendingPermissions: [], // 历史会话不恢复权限请求
    isAgentThinking: false,
    agentStatus: data.agentStatus === 'running' ? 'stopped' : (data.agentStatus || 'stopped'),
  };
}

/** 从远程服务器加载会话数据 */
async function loadPersistedSessions(): Promise<{ sessions: Session[]; activeSessionId: string | null }> {
  try {
    const resp = await fetch(`${getApiBaseUrl()}/api/sessions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!resp.ok) {
      console.warn('Failed to load sessions from server:', resp.statusText);
      return { sessions: [], activeSessionId: null };
    }
    const data: PersistedData = await resp.json();
    if (data.version !== STORAGE_VERSION) {
      // 版本不匹配，清空重来
      return { sessions: [], activeSessionId: null };
    }
    const sessions = (data.sessions || []).map(deserializeSession);
    return {
      sessions,
      activeSessionId: data.activeSessionId,
    };
  } catch (err) {
    console.warn('Failed to load sessions from server:', err);
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
      // 只保留最近 N 个会话，并且只保留有消息的会话
      const toSave = sessions
        .filter((s) => s.messages.length > 0)
        .slice(-MAX_HISTORY_SESSIONS);

      const data: PersistedData = {
        sessions: toSave.map(serializeSession),
        activeSessionId,
        version: STORAGE_VERSION,
      };

      fetch(`${getApiBaseUrl()}/api/sessions`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }).catch((err) => {
        console.warn('Failed to persist sessions to server:', err);
      });
    } catch {
      console.warn('Failed to persist sessions');
    }
  }, 500); // 500ms 防抖
}

// ==================== Store ====================

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
  createSession: (agentId: string, workDir: string) => string;
  switchSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;

  // History sessions (已关闭 / 历史会话)
  loadHistorySessions: () => void;
  restoreSession: (sessionId: string) => void;
  clearHistory: () => void;

  // Active working directory (set when agent starts)
  activeWorkDir: string | null;
  setActiveWorkDir: (dir: string | null) => void;

  // File browser visibility
  showFileBrowser: boolean;
  setShowFileBrowser: (show: boolean) => void;

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

  // Error
  lastError: string | null;
  setLastError: (err: string | null) => void;
}

let messageIdCounter = 0;
export function genMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

let sessionIdCounter = 0;
function genSessionId(): string {
  return `session_${Date.now()}_${++sessionIdCounter}`;
}

/** 保存当前活跃会话的状态到 sessions 数组，然后触发持久化 */
function saveCurrentAndPersist(state: ChatState): void {
  let sessions = [...state.sessions];
  if (state.activeSessionId) {
    const idx = sessions.findIndex((s) => s.id === state.activeSessionId);
    if (idx >= 0) {
      sessions[idx] = {
        ...sessions[idx],
        messages: state.messages,
        toolCalls: state.toolCalls,
        pendingPermissions: state.pendingPermissions,
        planEntries: state.planEntries,
        isAgentThinking: state.isAgentThinking,
        agentStatus: state.agentStatus,
      };
    }
  }
  persistSessions(sessions, state.activeSessionId);
}

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
    // 状态变化时触发持久化
    saveCurrentAndPersist(get());
  },

  // Sessions
  sessions: [],
  activeSessionId: null,
  createSession: (agentId, workDir) => {
    const id = genSessionId();
    const agent = get().agents.find((a) => a.id === agentId);
    const session: Session = {
      id,
      name: `${agent?.name || agentId} - ${workDir.split('/').pop() || workDir}`,
      agentId,
      workDir,
      messages: [],
      toolCalls: new Map(),
      pendingPermissions: [],
      planEntries: [],
      isAgentThinking: false,
      agentStatus: 'starting',
      createdAt: Date.now(),
    };

    // 保存当前活跃会话状态后再切换
    const state = get();
    let updatedSessions = [...state.sessions];
    if (state.activeSessionId) {
      const currentIdx = updatedSessions.findIndex((s) => s.id === state.activeSessionId);
      if (currentIdx >= 0) {
        updatedSessions[currentIdx] = {
          ...updatedSessions[currentIdx],
          messages: state.messages,
          toolCalls: state.toolCalls,
          pendingPermissions: state.pendingPermissions,
          planEntries: state.planEntries,
          isAgentThinking: state.isAgentThinking,
          agentStatus: state.agentStatus,
        };
      }
    }

    set({
      sessions: [...updatedSessions, session],
      activeSessionId: id,
      activeWorkDir: workDir,
      messages: [],
      toolCalls: new Map(),
      pendingPermissions: [],
      planEntries: [],
      isAgentThinking: false,
    });

    persistSessions([...updatedSessions, session], id);
    return id;
  },
  switchSession: (sessionId) => {
    const state = get();
    // Save current session state
    let updatedSessions = [...state.sessions];
    if (state.activeSessionId) {
      const currentIdx = updatedSessions.findIndex((s) => s.id === state.activeSessionId);
      if (currentIdx >= 0) {
        updatedSessions[currentIdx] = {
          ...updatedSessions[currentIdx],
          messages: state.messages,
          toolCalls: state.toolCalls,
          pendingPermissions: state.pendingPermissions,
          planEntries: state.planEntries,
          isAgentThinking: state.isAgentThinking,
          agentStatus: state.agentStatus,
        };
      }
    }
    // Load target session
    const target = updatedSessions.find((s) => s.id === sessionId);
    if (target) {
      set({
        sessions: updatedSessions,
        activeSessionId: sessionId,
        activeAgentId: target.agentId,
        activeWorkDir: target.workDir,
        messages: target.messages,
        toolCalls: target.toolCalls,
        pendingPermissions: target.pendingPermissions,
        planEntries: target.planEntries,
        isAgentThinking: target.isAgentThinking,
        agentStatus: target.agentStatus,
      });
      persistSessions(updatedSessions, sessionId);
    }
  },
  removeSession: (sessionId) => {
    set((s) => {
      const filtered = s.sessions.filter((sess) => sess.id !== sessionId);
      const isActive = s.activeSessionId === sessionId;
      const newActiveId = isActive ? (filtered[0]?.id || null) : s.activeSessionId;
      persistSessions(filtered, newActiveId);
      return {
        sessions: filtered,
        activeSessionId: newActiveId,
      };
    });
  },

  // History sessions
  loadHistorySessions: () => {
    // 异步从远程服务器加载
    loadPersistedSessions().then(({ sessions: historySessions }) => {
      if (historySessions.length > 0) {
        set({ sessions: historySessions });
        // 不自动恢复上次活跃会话的实时状态，保持 idle
      }
    });
  },
  restoreSession: (sessionId) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === sessionId);
    if (!target) return;

    // 保存当前会话
    let updatedSessions = [...state.sessions];
    if (state.activeSessionId) {
      const currentIdx = updatedSessions.findIndex((s) => s.id === state.activeSessionId);
      if (currentIdx >= 0) {
        updatedSessions[currentIdx] = {
          ...updatedSessions[currentIdx],
          messages: state.messages,
          toolCalls: state.toolCalls,
          pendingPermissions: state.pendingPermissions,
          planEntries: state.planEntries,
          isAgentThinking: state.isAgentThinking,
          agentStatus: state.agentStatus,
        };
      }
    }

    // 恢复目标会话（只读模式，agent 状态设为 stopped）
    set({
      sessions: updatedSessions,
      activeSessionId: sessionId,
      activeAgentId: target.agentId,
      activeWorkDir: target.workDir,
      messages: target.messages,
      toolCalls: target.toolCalls,
      pendingPermissions: [],
      planEntries: target.planEntries,
      isAgentThinking: false,
      agentStatus: target.agentStatus === 'running' ? 'stopped' : target.agentStatus,
    });
    persistSessions(updatedSessions, sessionId);
  },
  clearHistory: () => {
    // 只清除已关闭的历史会话，保留当前活跃的
    const state = get();
    const activeSessions = state.sessions.filter(
      (s) => s.id === state.activeSessionId || s.agentStatus === 'running'
    );
    set({ sessions: activeSessions });
    persistSessions(activeSessions, state.activeSessionId);
  },

  // Active working directory
  activeWorkDir: null,
  setActiveWorkDir: (dir) => set({ activeWorkDir: dir }),

  // File browser
  showFileBrowser: false,
  setShowFileBrowser: (show) => set({ showFileBrowser: show }),

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
      .then((resp) => resp.json())
      .then((data) => {
        set({ geminiSessions: data.sessions || [], geminiSessionsLoading: false });
      })
      .catch((err) => {
        console.warn('[ChatStore] Failed to fetch Gemini CLI sessions:', err);
        set({ geminiSessions: [], geminiSessionsLoading: false });
      });
  },

  // Messages
  messages: [],
  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    // 每条消息后触发持久化
    saveCurrentAndPersist(get());
  },
  appendToLastAgentMessage: (text) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'agent') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({
          id: genMessageId(),
          role: 'agent',
          content: text,
          timestamp: Date.now(),
        });
      }
      return { messages: msgs };
    });
    // agent 流式输出时不频繁保存，依赖 turn_complete 和 status 变化保存
  },
  clearMessages: () => set({ messages: [], toolCalls: new Map(), pendingPermissions: [], planEntries: [] }),

  // Tool calls
  toolCalls: new Map(),
  addToolCall: (tc) =>
    set((s) => {
      const m = new Map(s.toolCalls);
      m.set(tc.toolCallId, tc);
      return { toolCalls: m };
    }),
  updateToolCall: (toolCallId, status, content) =>
    set((s) => {
      const m = new Map(s.toolCalls);
      const existing = m.get(toolCallId);
      if (existing) {
        const updated = { ...existing };
        if (status) updated.status = status;
        if (content) updated.content = [...(updated.content || []), ...content];
        m.set(toolCallId, updated);
      }
      return { toolCalls: m };
    }),

  // Permission requests
  pendingPermissions: [],
  addPermissionRequest: (req) =>
    set((s) => ({ pendingPermissions: [...s.pendingPermissions, req] })),
  removePermissionRequest: (requestId) =>
    set((s) => ({
      pendingPermissions: s.pendingPermissions.filter(
        (p) => p.requestId !== requestId
      ),
    })),

  // Plan
  planEntries: [],
  setPlanEntries: (entries) => set({ planEntries: entries }),

  // Turn state
  isAgentThinking: false,
  setIsAgentThinking: (v) => {
    set({ isAgentThinking: v });
    // thinking 结束时触发持久化（agent turn 完成）
    if (!v) {
      saveCurrentAndPersist(get());
    }
  },
  thinkingContent: '',
  appendThinkingContent: (text) => {
    set((s) => ({ thinkingContent: s.thinkingContent + text }));
  },
  clearThinkingContent: () => set({ thinkingContent: '' }),

  // Error
  lastError: null,
  setLastError: (err) => set({ lastError: err }),
}));
