import type { TurnStats } from '../../types/protocol';

export type AgentActivityType = 'idle' | 'thinking' | 'streaming' | 'tool_calling';
export type WSStatusType = 'connecting' | 'connected' | 'disconnected';

export interface ChatStatusMetric {
  label: string;
  value: string;
}

export interface ChatStatusAction {
  visible: boolean;
  enabled: boolean;
  label: string;
  title: string;
}

export interface ChatStatusViewModel {
  agent: ChatStatusMetric;
  activity: ChatStatusMetric;
  worktree: ChatStatusMetric;
  model: ChatStatusMetric;
  context: ChatStatusMetric;
  toolCalls: ChatStatusMetric;
  permissions: ChatStatusMetric;
  duration: ChatStatusMetric;
  connection: ChatStatusMetric;
  reconnectAction: ChatStatusAction;
}

export interface BuildChatStatusViewModelInput {
  agentName?: string | null;
  agentMode?: string | null;
  workDir?: string | null;
  activeModel?: string | null;
  agentStatus: string;
  agentActivity: AgentActivityType;
  lastTurnStats: TurnStats | null;
  pendingToolCalls: number;
  pendingPermissionRequests: number;
  hasRestorableSession: boolean;
  wsStatus: WSStatusType;
}

export function buildReconnectActionState(input: {
  agentStatus: string;
  hasRestorableSession: boolean;
  wsStatus: WSStatusType;
}): ChatStatusAction {
  const shouldShow = input.hasRestorableSession
    && input.agentStatus !== 'running'
    && input.agentStatus !== 'starting';

  if (!shouldShow) {
    return {
      visible: false,
      enabled: false,
      label: 'Reconnect',
      title: 'No restorable session available',
    };
  }

  if (input.wsStatus !== 'connected') {
    return {
      visible: true,
      enabled: false,
      label: 'Reconnect',
      title: 'WebSocket is not connected yet',
    };
  }

  return {
    visible: true,
    enabled: true,
    label: 'Reconnect',
    title: 'Reconnect current session',
  };
}

/**
 * buildChatStatusViewModel 将聊天运行态归一化为底部状态条可直接渲染的数据。
 */
export function buildChatStatusViewModel(input: BuildChatStatusViewModelInput): ChatStatusViewModel {
  const runtimeModel = input.lastTurnStats?.model?.trim() || input.activeModel?.trim() || 'Auto';
  const mode = input.agentMode?.trim()?.toUpperCase() || 'AGENT';
  const contextUsed = input.lastTurnStats?.inputTokens;
  const totalToolCalls = input.lastTurnStats?.toolCalls || 0;
  const durationMs = input.lastTurnStats?.durationMs;

  return {
    agent: {
      label: 'Agent',
      value: `${input.agentName || 'Unknown'} · ${mode}`,
    },
    activity: {
      label: 'Activity',
      value: getActivityLabel(input.agentStatus, input.agentActivity),
    },
    worktree: {
      label: 'Worktree',
      value: input.workDir?.trim() || 'No workspace',
    },
    model: {
      label: 'Model',
      value: runtimeModel,
    },
    context: {
      label: 'Context',
      value: contextUsed && contextUsed > 0
        ? `${formatCompactNumber(contextUsed)} used · remaining --`
        : 'unavailable',
    },
    toolCalls: {
      label: 'Tools',
      value: `${totalToolCalls} total · ${input.pendingToolCalls} active`,
    },
    permissions: {
      label: 'Approvals',
      value: input.pendingPermissionRequests > 0
        ? `${input.pendingPermissionRequests} pending`
        : 'None',
    },
    duration: {
      label: 'Last turn',
      value: durationMs && durationMs > 0 ? `${formatDuration(durationMs)}` : '--',
    },
    connection: {
      label: 'Connection',
      value: `WS ${input.wsStatus}`,
    },
    reconnectAction: buildReconnectActionState({
      agentStatus: input.agentStatus,
      hasRestorableSession: input.hasRestorableSession,
      wsStatus: input.wsStatus,
    }),
  };
}

function getActivityLabel(agentStatus: string, agentActivity: AgentActivityType): string {
  if (agentStatus === 'starting') {
    return 'Starting';
  }
  if (agentStatus === 'error') {
    return 'Error';
  }
  if (agentStatus === 'stopped' || agentStatus === 'disconnected') {
    return 'Offline';
  }
  if (agentStatus !== 'running') {
    return 'Idle';
  }

  switch (agentActivity) {
    case 'thinking':
      return 'Thinking';
    case 'streaming':
      return 'Responding';
    case 'tool_calling':
      return 'Using tools';
    default:
      return 'Ready';
  }
}

function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}
