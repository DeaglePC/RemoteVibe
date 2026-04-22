import { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { buildChatStatusViewModel } from '../ChatView/chatStatusBarModel';

/**
 * HeaderMetrics 在页面 Header 右侧显示 Model + Context 两项指标。
 *
 * 设计：
 *  - 仅在有 agent 的会话中才显示（避免空会话里出现 "Auto · unavailable"）
 *  - 每项都是 "LABEL value" 的超紧凑排版，使用等宽字体凸显技术信息
 *  - 点击可复制到剪贴板（方便调试，titles 给出详情）
 *
 * 移动端 / 桌面端共用：自适应 gap，父容器控制换行。
 */
interface Props {
  /** 紧凑模式（移动端可用）：隐藏 Context */
  compact?: boolean;
}

export default function HeaderMetrics({ compact = false }: Props) {
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

  // 没有 agent 时直接不渲染
  if (!activeAgent) {
    return null;
  }

  const modelValue = viewModel.model.value;
  const contextValue = viewModel.context.value;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <Metric label="Model" value={modelValue} mono />
      {!compact && contextValue !== 'unavailable' && (
        <Metric label="Ctx" value={contextValue} />
      )}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Metric({ label, value, mono = false }: MetricProps) {
  return (
    <div
      title={`${label}: ${value}`}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        maxWidth: 200,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
    </div>
  );
}
