import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./backendStore', () => ({
  getApiBaseUrl: () => 'http://test.local',
  getAuthHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

import { useChatStore } from './chatStore';

function resetChatStore(): void {
  useChatStore.setState({
    activeAgentId: null,
    activeModel: null,
    activeSessionId: null,
    activeWorkDir: null,
    agentStatus: 'idle',
    isAgentThinking: false,
    lastTurnStats: null,
    messages: [],
    pendingPermissions: [],
    planEntries: [],
    sessions: [],
    toolCalls: new Map(),
  });
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('useChatStore.loadHistorySessions', () => {
  beforeEach(() => {
    resetChatStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetChatStore();
  });

  it('restores the last active session returned by persistence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        activeSessionId: 'session-b',
        sessions: [
          {
            id: 'session-a',
            name: 'Session A',
            agentId: 'agent-a',
            workDir: '/workspace/a',
            activeModel: 'gemini-2.5-flash',
            messages: [{ id: 'msg-a', role: 'user', content: 'hello a', timestamp: 1 }],
            toolCalls: [],
            planEntries: [],
            agentStatus: 'stopped',
            lastTurnStats: null,
            createdAt: 1,
          },
          {
            id: 'session-b',
            name: 'Session B',
            agentId: 'agent-b',
            workDir: '/workspace/b',
            activeModel: 'gemini-2.5-pro',
            messages: [{ id: 'msg-b', role: 'assistant', content: 'hello b', timestamp: 2 }],
            toolCalls: [],
            planEntries: [],
            agentStatus: 'stopped',
            lastTurnStats: null,
            createdAt: 2,
          },
        ],
      }),
    }));

    useChatStore.getState().loadHistorySessions();
    await flushAsyncWork();

    const state = useChatStore.getState();

    expect(state.sessions).toHaveLength(2);
    expect(state.activeSessionId).toBe('session-b');
    expect(state.activeAgentId).toBe('agent-b');
    expect(state.activeWorkDir).toBe('/workspace/b');
    expect(state.activeModel).toBe('gemini-2.5-pro');
    expect(state.messages).toEqual([
      { id: 'msg-b', role: 'assistant', content: 'hello b', timestamp: 2 },
    ]);
  });

  it('normalizes persisted starting sessions back to stopped when hydrating history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        activeSessionId: 'session-starting',
        sessions: [
          {
            id: 'session-starting',
            name: 'Session Starting',
            agentId: 'agent-a',
            workDir: '/workspace/a',
            activeModel: null,
            messages: [{ id: 'msg-a', role: 'system', content: '🔄 Reconnecting...', timestamp: 1 }],
            toolCalls: [],
            planEntries: [],
            agentStatus: 'starting',
            lastTurnStats: null,
            createdAt: 1,
          },
        ],
      }),
    }));

    useChatStore.getState().loadHistorySessions();
    await flushAsyncWork();

    const state = useChatStore.getState();

    expect(state.activeSessionId).toBe('session-starting');
    expect(state.agentStatus).toBe('stopped');
    expect(state.sessions[0]?.agentStatus).toBe('stopped');
  });
});
