import { create } from 'zustand';
import type {
  AgentInfo,
  ToolCallPayload,
  ToolCallContent,
  PermissionRequestPayload,
  PlanEntry,
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

  // Error
  lastError: string | null;
  setLastError: (err: string | null) => void;
}

let messageIdCounter = 0;
export function genMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

export const useChatStore = create<ChatState>((set) => ({
  // Connection
  wsStatus: 'disconnected',
  setWsStatus: (wsStatus) => set({ wsStatus }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),
  activeAgentId: null,
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  agentStatus: 'idle',
  setAgentStatus: (status) => set({ agentStatus: status }),

  // Messages
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLastAgentMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'agent') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        // Create a new agent message
        msgs.push({
          id: genMessageId(),
          role: 'agent',
          content: text,
          timestamp: Date.now(),
        });
      }
      return { messages: msgs };
    }),
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
  setIsAgentThinking: (v) => set({ isAgentThinking: v }),

  // Error
  lastError: null,
  setLastError: (err) => set({ lastError: err }),
}));
