import { useChatStore } from '../../stores/chatStore';
import {
  MessageSquare, FolderTree, Settings, Play, Square, Loader, Terminal,
} from 'lucide-react';

interface Props {
  activeView: 'chat' | 'files';
  onViewChange: (view: 'chat' | 'files') => void;
  onLaunch: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export default function ActivityBar({
  activeView,
  onViewChange,
  onLaunch,
  onStop,
  onOpenSettings,
}: Props) {
  const agentStatus = useChatStore((s) => s.agentStatus);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);

  const isRunning = agentStatus === 'running';
  const isStarting = agentStatus === 'starting';
  const showACPLogs = useChatStore((s) => s.showACPLogs);
  const setShowACPLogs = useChatStore((s) => s.setShowACPLogs);
  const acpLogCount = useChatStore((s) => s.acpLogs.length);

  const statusDotColor = isRunning
    ? 'var(--color-success)'
    : isStarting
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';

  return (
    <div
      className="flex flex-col items-center py-2 gap-1 flex-shrink-0 select-none"
      style={{
        width: '48px',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm mb-2 cursor-default"
        style={{
          background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
        }}
        title="RemoteVibe"
      >
        🐾
      </div>

      {/* 文件浏览器 */}
      <ActivityBarButton
        icon={<FolderTree size={20} />}
        label="Explorer"
        active={activeView === 'files'}
        disabled={!isRunning || !activeWorkDir}
        onClick={() => onViewChange(activeView === 'files' ? 'chat' : 'files')}
      />

      {/* 聊天 */}
      <ActivityBarButton
        icon={<MessageSquare size={20} />}
        label="Chat"
        active={activeView === 'chat'}
        onClick={() => onViewChange('chat')}
      />

      {/* ACP 协议日志 */}
      <ActivityBarButton
        icon={
          <div className="relative">
            <Terminal size={20} />
            {acpLogCount > 0 && (
              <div
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                style={{ background: 'var(--color-accent-500)' }}
              />
            )}
          </div>
        }
        label="ACP Protocol Log"
        active={showACPLogs}
        onClick={() => setShowACPLogs(!showACPLogs)}
      />

      {/* 分隔符 */}
      <div className="flex-1" />

      {/* 启动/停止 Agent */}
      {!isRunning && !isStarting && (
        <ActivityBarButton
          icon={<Play size={20} />}
          label="Launch Agent"
          onClick={onLaunch}
        />
      )}
      {isStarting && (
        <ActivityBarButton
          icon={<Loader size={20} className="animate-spin" />}
          label="Starting..."
          disabled
        />
      )}
      {isRunning && (
        <ActivityBarButton
          icon={<Square size={18} />}
          label="Stop Agent"
          onClick={onStop}
          danger
        />
      )}

      {/* 设置 */}
      <ActivityBarButton
        icon={<Settings size={20} />}
        label="Settings"
        onClick={onOpenSettings}
      />

      {/* 状态指示 - 单个圆点，综合显示 Agent + WS 状态 */}
      <div
        className={`w-2.5 h-2.5 rounded-full mt-2 mb-1 ${isRunning && wsStatus === 'connected' ? 'animate-pulse-glow' : ''}`}
        style={{
          background: wsStatus !== 'connected'
            ? 'var(--color-danger)'
            : statusDotColor,
        }}
        title={`Agent: ${agentStatus} · WS: ${wsStatus}`}
      />
    </div>
  );
}

/** Activity Bar 上的图标按钮 */
function ActivityBarButton({
  icon,
  label,
  active,
  disabled,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-default"
      style={{
        background: active ? 'var(--color-surface-3)' : 'transparent',
        color: danger
          ? 'var(--color-danger)'
          : active
            ? 'var(--color-text-primary)'
            : 'var(--color-text-muted)',
        border: 'none',
      }}
      title={label}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.background = 'var(--color-surface-2)';
          e.currentTarget.style.color = danger ? 'var(--color-danger)' : 'var(--color-text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = danger ? 'var(--color-danger)' : 'var(--color-text-muted)';
        }
      }}
    >
      {icon}
      {/* 活动指示条 */}
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
          style={{ background: 'var(--color-text-primary)' }}
        />
      )}
    </button>
  );
}
