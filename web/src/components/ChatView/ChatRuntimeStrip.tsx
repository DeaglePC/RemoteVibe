import { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import {
  buildChatStatusViewModel,
  buildConnectivityState,
  type ChatStatusViewModel,
  type ConnectivityState,
} from './chatStatusBarModel';

// 仅以下活动标签代表 Agent 正在工作中；显示脉冲徽标以增强可感知
const BUSY_ACTIVITY_LABELS = new Set(['Thinking', 'Responding', 'Using tools', 'Starting']);

/**
 * ConnectivityBadge 独立渲染 "● 就绪 / 点击恢复 / 启动中… / 离线" 综合可用状态按钮。
 *
 * 抽离自 ChatRuntimeStrip 以便在手机端 Header 副标题等位置独立使用。
 */
export function ConnectivityBadge({ onReconnectSession }: { onReconnectSession?: () => void }) {
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const wsStatus = useChatStore((s) => s.wsStatus);

  const hasRestorableSession = !!(activeSessionId && activeAgentId && activeWorkDir);

  const connectivity: ConnectivityState = useMemo(
    () => buildConnectivityState({ wsStatus, agentStatus, hasRestorableSession }),
    [wsStatus, agentStatus, hasRestorableSession],
  );

  const handleStatusClick = () => {
    if (connectivity.clickable && onReconnectSession) {
      onReconnectSession();
    }
  };

  return (
    <button
      type="button"
      onClick={handleStatusClick}
      disabled={!connectivity.clickable}
      title={connectivity.title}
      aria-label={connectivity.title}
      style={{
        appearance: 'none',
        border: 0,
        background: 'transparent',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        cursor: connectivity.clickable ? 'pointer' : 'default',
      }}
    >
      <span
        aria-hidden
        className={connectivity.pulsing ? 'animate-pulse' : undefined}
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: connectivity.tone,
          boxShadow: connectivity.kind === 'ready' ? `0 0 6px ${connectivity.tone}` : 'none',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: connectivity.tone,
          fontWeight: 500,
          textDecoration: connectivity.clickable ? 'underline dotted' : 'none',
          textUnderlineOffset: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {connectivity.text}
      </span>
    </button>
  );
}

/**
 * ActivityBadge 独立渲染 Agent 当前活动（Thinking / Responding / Using tools…）的脉冲徽标。
 *
 * 抽离自 ChatRuntimeStrip 以便在输入框左上方等位置独立使用。
 * 当 Agent 处于空闲/非忙碌状态时返回 null，不占位。
 */
export function ActivityBadge() {
  const agents = useChatStore((s) => s.agents);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const activeModel = useChatStore((s) => s.activeModel);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentActivity = useChatStore((s) => s.agentActivity);
  const lastTurnStats = useChatStore((s) => s.lastTurnStats);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const pendingPermissionRequests = useChatStore((s) => s.pendingPermissions.length);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || null;
  const pendingToolCalls = Array.from(toolCalls.values()).filter((tc) => {
    return tc.status === 'pending' || tc.status === 'in_progress';
  }).length;

  const viewModel: ChatStatusViewModel = useMemo(() => {
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
      hasRestorableSession: false,
      wsStatus,
    });
  }, [
    activeAgent?.mode,
    activeAgent?.name,
    activeModel,
    activeWorkDir,
    agentActivity,
    agentStatus,
    lastTurnStats,
    pendingPermissionRequests,
    pendingToolCalls,
    wsStatus,
  ]);

  const activityLabel = viewModel.activity.value;
  const isBusy = BUSY_ACTIVITY_LABELS.has(activityLabel);
  if (!isBusy) {
    return null;
  }
  const activityTone = getActivityTone(activityLabel);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden
        className="animate-pulse"
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: activityTone,
        }}
      />
      <span style={{ fontSize: 11, color: activityTone, fontWeight: 500, whiteSpace: 'nowrap' }}>
        {activityLabel}
      </span>
    </span>
  );
}

interface Props {
  onReconnectSession?: () => void;
}

/**
 * ChatRuntimeStrip 是聊天窗口顶部的运行态指示条。
 *
 * 布局：
 *   ● 就绪 / 点击恢复 / 启动中… / 离线          Activity
 *
 * 左侧：综合可用状态按钮（合并了 WS 连接 + Agent 状态 + Reconnect 入口）
 *   - "就绪" → 不可点击（正常工作）
 *   - "点击恢复" → 可点击，触发 Reconnect（替代原右侧按钮）
 *   - "启动中…""连接中…" → 动画提示，不可点击
 *   - "离线" → 灰色静止
 *
 * 右侧：Activity（Thinking/Using tools ...）脉冲徽标
 *
 * 设计原则：
 *  - 高 28px，贴 ChatView 顶部，不抢占注意力
 *  - 单入口：用户只需认一个"状态点"即可操作，不必在"在线"和"Reconnect 按钮"之间困惑
 */
export default function ChatRuntimeStrip({ onReconnectSession }: Props) {
  const agents = useChatStore((s) => s.agents);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const activeModel = useChatStore((s) => s.activeModel);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const agentActivity = useChatStore((s) => s.agentActivity);
  const lastTurnStats = useChatStore((s) => s.lastTurnStats);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const pendingPermissionRequests = useChatStore((s) => s.pendingPermissions.length);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || null;
  const pendingToolCalls = Array.from(toolCalls.values()).filter((tc) => {
    return tc.status === 'pending' || tc.status === 'in_progress';
  }).length;
  const hasRestorableSession = !!(activeSessionId && activeAgentId && activeWorkDir);

  const viewModel: ChatStatusViewModel = useMemo(() => {
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

  const connectivity: ConnectivityState = useMemo(
    () => buildConnectivityState({ wsStatus, agentStatus, hasRestorableSession }),
    [wsStatus, agentStatus, hasRestorableSession],
  );

  const activityLabel = viewModel.activity.value;
  const isBusy = BUSY_ACTIVITY_LABELS.has(activityLabel);
  const activityTone = getActivityTone(activityLabel);

  const handleStatusClick = () => {
    if (connectivity.clickable && onReconnectSession) {
      onReconnectSession();
    }
  };

  return (
    <section
      aria-label="Chat runtime status"
      style={{
        flexShrink: 0,
        height: 28,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'var(--color-surface-0)',
        borderBottom: '1px solid color-mix(in srgb, var(--color-border) 55%, transparent)',
      }}
    >
      {/* 左：综合可用状态（合并了连接点 + Reconnect 入口） */}
      <button
        type="button"
        onClick={handleStatusClick}
        disabled={!connectivity.clickable}
        title={connectivity.title}
        aria-label={connectivity.title}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          padding: '0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          cursor: connectivity.clickable ? 'pointer' : 'default',
          borderRadius: 4,
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (connectivity.clickable) {
            e.currentTarget.style.background = 'color-mix(in srgb, var(--color-surface-1) 60%, transparent)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <span
          aria-hidden
          className={connectivity.pulsing ? 'animate-pulse' : undefined}
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connectivity.tone,
            boxShadow: connectivity.kind === 'ready' ? `0 0 6px ${connectivity.tone}` : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: connectivity.tone,
            fontWeight: 500,
            textDecoration: connectivity.clickable ? 'underline dotted' : 'none',
            textUnderlineOffset: 2,
          }}
        >
          {connectivity.text}
        </span>
      </button>

      {/* 右：Activity（busy 时显示） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {isBusy && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              aria-hidden
              className="animate-pulse"
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: activityTone,
              }}
            />
            <span style={{ fontSize: 12, color: activityTone, fontWeight: 500 }}>{activityLabel}</span>
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * getActivityTone 根据 Agent 当前活动返回视觉主色。
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
