import { describe, expect, it } from 'vitest';
import { buildChatStatusViewModel, buildReconnectActionState } from './chatStatusBarModel';

describe('buildChatStatusViewModel', () => {
  it('prefers runtime model and renders context usage from input tokens', () => {
    const viewModel = buildChatStatusViewModel({
      agentName: 'Gemini CLI',
      agentMode: 'cli',
      workDir: '/Users/patrickdu/github/RemoteVibe',
      activeModel: 'gemini-2.5-pro',
      agentStatus: 'running',
      agentActivity: 'streaming',
      lastTurnStats: {
        inputTokens: 128400,
        outputTokens: 3600,
        cachedTokens: 42000,
        durationMs: 18250,
        toolCalls: 3,
        model: 'gemini-2.5-pro',
      },
      pendingToolCalls: 1,
      pendingPermissionRequests: 0,
      hasRestorableSession: false,
      wsStatus: 'connected',
    });

    expect(viewModel.model.value).toBe('gemini-2.5-pro');
    expect(viewModel.context.value).toContain('128.4k used');
    expect(viewModel.context.value).toContain('remaining --');
    expect(viewModel.activity.value).toBe('Responding');
    expect(viewModel.toolCalls.value).toBe('3 total · 1 active');
  });

  it('falls back gracefully when stats are unavailable', () => {
    const viewModel = buildChatStatusViewModel({
      agentName: 'Claude Code',
      agentMode: 'cli',
      workDir: '/tmp/demo',
      activeModel: '',
      agentStatus: 'starting',
      agentActivity: 'idle',
      lastTurnStats: null,
      pendingToolCalls: 0,
      pendingPermissionRequests: 2,
      hasRestorableSession: false,
      wsStatus: 'connecting',
    });

    expect(viewModel.model.value).toBe('Auto');
    expect(viewModel.context.value).toBe('unavailable');
    expect(viewModel.activity.value).toBe('Starting');
    expect(viewModel.permissions.value).toBe('2 pending');
    expect(viewModel.connection.value).toBe('WS connecting');
  });

  it('offers reconnect when a restorable session is offline and websocket is ready', () => {
    const action = buildReconnectActionState({
      agentStatus: 'stopped',
      hasRestorableSession: true,
      wsStatus: 'connected',
    });

    expect(action.visible).toBe(true);
    expect(action.enabled).toBe(true);
    expect(action.label).toBe('Reconnect');
  });
});
