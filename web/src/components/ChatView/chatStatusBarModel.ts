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

// ==================== 综合可用状态（P6） ====================

export type ConnectivityKind =
  | 'ready'         // WS 在线 + Agent running
  | 'restorable'    // WS 在线 + 有可恢复会话但 Agent 未跑（可点击恢复）
  | 'starting'      // Agent 启动中
  | 'connecting'    // WS 还在连
  | 'error'         // Agent 出错（可点击重试）
  | 'offline';      // 其它（WS 断 / 无会话）

export interface ConnectivityState {
  kind: ConnectivityKind;
  /** 用户可见文案（中文） */
  text: string;
  /** CSS 颜色变量（用于点和文字） */
  tone: string;
  /** 是否可点击触发 Reconnect */
  clickable: boolean;
  /** 是否展示呼吸动画（如"连接中…""启动中…"） */
  pulsing: boolean;
  /** tooltip */
  title: string;
}

export interface BuildConnectivityStateInput {
  wsStatus: WSStatusType;
  agentStatus: string;
  hasRestorableSession: boolean;
}

/**
 * buildConnectivityState 把 "WS 层 + Agent 层" 两个独立状态折算成
 * 用户真正关心的一个综合状态。规则：
 *
 *   Agent=running → ready
 *   Agent=starting → starting
 *   Agent=error → error
 *   WS=connected + 有可恢复会话 + Agent 不跑 → restorable（可点击）
 *   WS=connecting → connecting
 *   其它 → offline
 *
 * 设计上刻意让 "左上角一个点" 即可表达完整可用性，并把 Reconnect 入口
 * 合并到该点上，避免用户同时看到"在线"又看到需要点"Reconnect"的分裂体验。
 */
export function buildConnectivityState(input: BuildConnectivityStateInput): ConnectivityState {
  const { wsStatus, agentStatus, hasRestorableSession } = input;

  if (agentStatus === 'running') {
    return {
      kind: 'ready',
      text: '就绪',
      tone: 'var(--color-success)',
      clickable: false,
      pulsing: false,
      title: 'Agent 正在运行，可直接发送消息',
    };
  }

  if (agentStatus === 'starting') {
    return {
      kind: 'starting',
      text: '启动中…',
      tone: 'var(--color-warning)',
      clickable: false,
      pulsing: true,
      title: 'Agent 正在启动，请稍候',
    };
  }

  if (agentStatus === 'error') {
    return {
      kind: 'error',
      text: '出错了 · 点击重试',
      tone: 'var(--color-danger, #ef4444)',
      clickable: wsStatus === 'connected' && hasRestorableSession,
      pulsing: false,
      title: 'Agent 异常，点击重新连接',
    };
  }

  if (wsStatus === 'connected' && hasRestorableSession) {
    return {
      kind: 'restorable',
      text: '点击恢复',
      tone: 'var(--color-warning)',
      clickable: true,
      pulsing: true,
      title: '点击恢复上次会话的 Agent 进程',
    };
  }

  if (wsStatus === 'connecting') {
    return {
      kind: 'connecting',
      text: '连接中…',
      tone: 'var(--color-warning)',
      clickable: false,
      pulsing: true,
      title: '正在与服务端建立连接',
    };
  }

  return {
    kind: 'offline',
    text: '离线',
    tone: 'var(--color-text-muted)',
    clickable: false,
    pulsing: false,
    title: wsStatus === 'connected' ? '暂无可恢复的会话' : '未连接到服务端',
  };
}
