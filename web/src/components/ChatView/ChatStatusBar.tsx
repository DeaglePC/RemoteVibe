import { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import {
  buildChatStatusViewModel,
  type ChatStatusMetric,
  type ChatStatusViewModel,
} from './chatStatusBarModel';

interface ChatStatusBarContentProps {
  viewModel: ChatStatusViewModel;
  onReconnectSession?: () => void;
}

const MONO_LABELS = new Set(['Worktree', 'Model', 'Connection']);

// 仅以下活动标签代表 Agent 正在工作中，手机状态栏会显示 Activity 脉冲徽标
const BUSY_ACTIVITY_LABELS = new Set(['Thinking', 'Responding', 'Using tools', 'Starting']);

/**
 * ChatStatusBar 在聊天窗口下方展示统一的运行态信息。
 */
export default function ChatStatusBar({ onReconnectSession }: { onReconnectSession?: () => void }) {
  const agents = useChatStore((state) => state.agents);
  const activeAgentId = useChatStore((state) => state.activeAgentId);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const activeWorkDir = useChatStore((state) => state.activeWorkDir);
  const activeModel = useChatStore((state) => state.activeModel);
  const agentStatus = useChatStore((state) => state.agentStatus);
  const agentActivity = useChatStore((state) => state.agentActivity);
  const lastTurnStats = useChatStore((state) => state.lastTurnStats);
  const wsStatus = useChatStore((state) => state.wsStatus);
  const toolCalls = useChatStore((state) => state.toolCalls);
  const pendingPermissionRequests = useChatStore((state) => state.pendingPermissions.length);

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) || null;
  const pendingToolCalls = Array.from(toolCalls.values()).filter((toolCall) => {
    return toolCall.status === 'pending' || toolCall.status === 'in_progress';
  }).length;
  const hasRestorableSession = !!(activeSessionId && activeAgentId && activeWorkDir);

  const viewModel = useMemo(() => {
    return buildChatStatusViewModel({
      agentName: activeAgent?.name || null,
      agentMode: activeAgent?.mode || null,
      workDir: activeWorkDir,
      activeModel,
      agentStatus,
      agentActivity,
      lastTurnStats,
      pendingToolCalls,
      pendingPermissionRequests,
      hasRestorableSession,
      wsStatus,
    });
  }, [
    activeAgent?.mode,
    activeAgent?.name,
    activeModel,
    activeWorkDir,
    agentActivity,
    agentStatus,
    hasRestorableSession,
    lastTurnStats,
    pendingPermissionRequests,
    pendingToolCalls,
    wsStatus,
  ]);

  return <ChatStatusBarContent viewModel={viewModel} onReconnectSession={onReconnectSession} />;
}

export function ChatStatusBarContent({ viewModel, onReconnectSession }: ChatStatusBarContentProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const connectionTone = getConnectionTone(viewModel.connection.value);

  // 桌面端：保持原有横向滚动布局
  if (!isMobile) {
    return <DesktopStatusBar viewModel={viewModel} onReconnectSession={onReconnectSession} />;
  }

    // 移动端：精简状态栏 —— 参考截图中的 "在线" + "Remote" 样式
    const isOnline = viewModel.connection.value.includes('connected');
    const backendName = viewModel.connection.value.includes('local') ? 'Local' : 'Remote';

    // Activity 仅在 Agent 活跃（非 Idle）时展示，用于手机端明确 typing / thinking / tool 状态
    const activityLabel = viewModel.activity.value;
    const isBusy = BUSY_ACTIVITY_LABELS.has(activityLabel);
    const activityTone = getActivityTone(activityLabel);

    return (
    <section
      aria-label="Chat runtime status"
      className="animate-fade-in-up px-4 py-2 flex items-center justify-between gap-3"
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface-0)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-flex w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: connectionTone,
            boxShadow: isOnline ? `0 0 6px ${connectionTone}` : 'none',
          }}
        />
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
          {isOnline ? '在线' : viewModel.connection.value}
        </span>
        {isBusy && (
          <>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>·</span>
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span
                className="inline-flex w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ background: activityTone }}
              />
              <span
                className="text-xs truncate"
                style={{ color: activityTone, fontWeight: 500 }}
              >
                {activityLabel}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {viewModel.reconnectAction.visible && (
          <button
            type="button"
            onClick={viewModel.reconnectAction.enabled ? onReconnectSession : undefined}
            disabled={!viewModel.reconnectAction.enabled}
            className="text-xs transition-colors cursor-pointer"
            style={{
              color: viewModel.reconnectAction.enabled
                ? 'var(--color-accent-400)'
                : 'var(--color-text-muted)',
              background: 'transparent',
              border: 'none',
              opacity: viewModel.reconnectAction.enabled ? 1 : 0.72,
            }}
            title={viewModel.reconnectAction.title}
          >
            {viewModel.reconnectAction.label}
          </button>
        )}
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {backendName}
        </span>
      </div>
    </section>
  );
}

function DesktopStatusBar({ viewModel, onReconnectSession }: ChatStatusBarContentProps) {
  const metrics: ChatStatusMetric[] = [
    viewModel.agent,
    viewModel.activity,
    viewModel.worktree,
    viewModel.model,
    viewModel.context,
    viewModel.toolCalls,
    viewModel.permissions,
    viewModel.duration,
    viewModel.connection,
  ];
  const connectionTone = getConnectionTone(viewModel.connection.value);

  return (
    <section
      aria-label="Chat runtime status"
      className="animate-fade-in-up px-3 py-1"
      style={{
        borderTop: '1px solid color-mix(in srgb, var(--color-border) 65%, transparent)',
        background: 'color-mix(in srgb, var(--color-surface-0) 94%, var(--color-surface-1))',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto px-1">
          <div className="flex items-center gap-2 min-w-max whitespace-nowrap">
            <span
              className="inline-flex w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: connectionTone,
                boxShadow: `0 0 8px ${connectionTone}`,
              }}
            />
            <span
              className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Runtime
            </span>

            {metrics.map((metric, index) => {
              const useMonoFont = MONO_LABELS.has(metric.label);
              return (
                <div
                  key={metric.label}
                  className="flex items-center gap-1.5 min-w-0 shrink-0 pl-2"
                  style={{
                    borderLeft: index === 0
                      ? 'none'
                      : '1px solid color-mix(in srgb, var(--color-border) 50%, transparent)',
                  }}
                  title={`${metric.label}: ${metric.value}`}
                >
                  <span
                    className="text-[0.56rem] font-semibold uppercase tracking-[0.1em] shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {metric.label}
                  </span>
                  <span
                    className="text-[0.72rem] leading-4 truncate"
                    style={{
                      color: 'var(--color-text-primary)',
                      fontFamily: useMonoFont ? 'var(--font-mono)' : 'var(--font-sans)',
                      maxWidth: metric.label === 'Worktree' ? 'min(34vw, 260px)' : '160px',
                    }}
                  >
                    {metric.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {viewModel.reconnectAction.visible && (
          <button
            type="button"
            onClick={viewModel.reconnectAction.enabled ? onReconnectSession : undefined}
            disabled={!viewModel.reconnectAction.enabled}
            className="shrink-0 rounded-md px-2 py-1 text-[0.65rem] font-semibold transition-colors"
            style={{
              color: viewModel.reconnectAction.enabled
                ? 'var(--color-accent-400)'
                : 'var(--color-text-muted)',
              background: 'color-mix(in srgb, var(--color-surface-1) 88%, transparent)',
              border: `1px solid ${viewModel.reconnectAction.enabled
                ? 'color-mix(in srgb, var(--color-accent-500) 55%, transparent)'
                : 'color-mix(in srgb, var(--color-border) 70%, transparent)'}`,
              cursor: viewModel.reconnectAction.enabled ? 'pointer' : 'not-allowed',
              opacity: viewModel.reconnectAction.enabled ? 1 : 0.72,
            }}
            title={viewModel.reconnectAction.title}
          >
            {viewModel.reconnectAction.label}
          </button>
        )}
      </div>
    </section>
  );
}

function getConnectionTone(connectionLabel: string): string {
  if (connectionLabel.includes('connected')) {
    return 'var(--color-success)';
  }
  if (connectionLabel.includes('connecting')) {
    return 'var(--color-warning)';
  }
  return 'var(--color-text-muted)';
}

/**
 * getActivityTone 根据 Agent 当前活动的标签返回对应的视觉主色。
 * Thinking / Responding / Tool-calling 等状态分别使用不同颜色，
 * 便于移动端用户一眼判断当前 Agent 的工作阶段。
 */
function getActivityTone(activityLabel: string): string {
  const label = activityLabel.toLowerCase();
  if (label.includes('think')) {
    return 'var(--color-brand-400)';
  }
  if (label.includes('tool')) {
    return 'var(--color-warning)';
  }
  if (label.includes('respond') || label.includes('stream') || label.includes('typing')) {
    return 'var(--color-accent-400)';
  }
  return 'var(--color-text-secondary)';
}
