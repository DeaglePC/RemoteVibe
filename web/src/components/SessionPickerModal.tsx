import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { Session } from '../stores/chatStore';
import type { AgentInfo, GeminiSessionInfo } from '../types/protocol';

interface Props {
  open: boolean;
  workDir: string;
  sessions: Session[];
  agents: AgentInfo[];
  selectedAgentId: string | null;
  onAgentChange: (agentId: string) => void;
  onRestoreSession: (sessionId: string) => void;
  onResumeGeminiSession: (geminiSessionId: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}

/**
 * SessionPickerModal 在选择工作区后展示该工作区的会话。
 * 包含四部分：
 * 1. Agent 选择器（让用户选择要使用的 AI Agent）
 * 2. 新建会话按钮
 * 3. Gemini CLI 原生会话（可以真正恢复上下文，仅 ACP 模式）
 * 4. 本地 UI 历史会话（只恢复聊天记录）
 */
export default function SessionPickerModal({
  open,
  workDir,
  sessions,
  agents,
  selectedAgentId,
  onAgentChange,
  onRestoreSession,
  onResumeGeminiSession,
  onNewSession,
  onClose,
}: Props) {
  const folderName = workDir.split('/').pop() || workDir;
  const geminiSessions = useChatStore((s) => s.geminiSessions);
  const geminiSessionsLoading = useChatStore((s) => s.geminiSessionsLoading);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  // Gemini 相关的 agent（ACP 或 CLI 模式）都支持原生会话恢复
  const isGeminiAgent = selectedAgent?.id === 'gemini' || selectedAgent?.id === 'gemini-cli';

  // 打开弹窗时自动拉取 Gemini CLI 原生会话列表
  useEffect(() => {
    if (open && workDir && isGeminiAgent) {
      useChatStore.getState().fetchGeminiSessions(workDir);
    }
  }, [open, workDir, isGeminiAgent]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-xl sm:rounded-xl overflow-hidden animate-fade-in-up"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px oklch(0 0 0 / 0.5)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.15), oklch(0.72 0.18 195 / 0.1))',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className="text-xl">💬</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Start Session
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {folderName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-80 cursor-pointer flex-shrink-0"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Agent Selector */}
        <div className="px-3 sm:px-4 pt-3 flex-shrink-0">
          <div className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}>
            🤖 Select Agent
          </div>
          <div className="flex flex-col gap-1">
            {agents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              const isAvailable = agent.available !== false; // 默认可用（兼容旧版后端）
              const modeLabel = agent.mode === 'cli' ? 'CLI' : agent.mode === 'acp' ? 'ACP' : 'ACP';
              const modeColor = agent.mode === 'cli'
                ? { bg: 'oklch(0.55 0.15 160 / 0.2)', text: 'oklch(0.75 0.15 160)' }
                : { bg: 'oklch(0.55 0.15 270 / 0.2)', text: 'oklch(0.75 0.15 270)' };
              return (
                <button
                  key={agent.id}
                  onClick={() => isAvailable && onAgentChange(agent.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150"
                  style={{
                    background: isSelected
                      ? 'var(--color-surface-2)'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid var(--color-accent-500)'
                      : '1px solid transparent',
                    color: 'var(--color-text-primary)',
                    opacity: isAvailable ? 1 : 0.4,
                    cursor: isAvailable ? 'pointer' : 'not-allowed',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && isAvailable) {
                      e.currentTarget.style.background = 'var(--color-surface-2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && isAvailable) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                  title={isAvailable ? agent.name : `${agent.name} — not installed on server`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))'
                        : 'var(--color-surface-3)',
                    }}
                  >
                    {isSelected ? '✓' : '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{agent.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: modeColor.bg,
                          color: modeColor.text,
                          fontSize: '0.55rem',
                          fontWeight: 600,
                        }}
                      >
                        {modeLabel}
                      </span>
                      {!isAvailable && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: 'oklch(0.55 0.18 25 / 0.2)',
                            color: 'var(--color-danger)',
                            fontSize: '0.55rem',
                            fontWeight: 600,
                          }}
                        >
                          Not installed
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-accent-500)' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 my-2" style={{ borderTop: '1px solid var(--color-border)' }} />

        {/* New Session button - always at top */}
        <div className="px-3 sm:px-4 pb-2 flex-shrink-0">
          <button
            onClick={onNewSession}
            disabled={!selectedAgentId}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
              color: 'white',
              border: 'none',
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">New Session</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Start fresh with {selectedAgent?.name || 'selected agent'}
              </div>
            </div>
          </button>
        </div>

        {/* Scrollable sessions area */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-3 safe-bottom">
          {/* Gemini CLI Native Sessions */}
          {isGeminiAgent && geminiSessionsLoading && (
            <div className="flex items-center gap-2 px-1 py-3">
              <span className="animate-spin text-sm">⟳</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Loading Gemini CLI sessions...
              </span>
            </div>
          )}

          {isGeminiAgent && !geminiSessionsLoading && geminiSessions.length > 0 && (
            <>
              <div className="px-1 py-1.5 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: 'var(--color-text-muted)' }}>
                <span>🔄</span>
                <span>Resume Session ({geminiSessions.length})</span>
              </div>
              <p className="px-1 pb-1.5 text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                Restore full agent context from Gemini CLI
              </p>
              {geminiSessions.map((gs: GeminiSessionInfo) => (
                <GeminiSessionItem
                  key={gs.id}
                  session={gs}
                  onSelect={() => onResumeGeminiSession(gs.id)}
                  formatTime={formatTime}
                />
              ))}
            </>
          )}

          {/* Local UI History Sessions */}
          {sessions.length > 0 && (
            <>
              <div className="px-1 py-1.5 mt-1 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: 'var(--color-text-muted)' }}>
                <span>🕐</span>
                <span>Chat History ({sessions.length})</span>
              </div>
              <p className="px-1 pb-1.5 text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                View messages only (starts new agent)
              </p>
              {sessions
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((session) => (
                  <LocalSessionItem
                    key={session.id}
                    session={session}
                    onSelect={() => onRestoreSession(session.id)}
                    formatTime={formatTime}
                  />
                ))}
            </>
          )}

          {/* Empty state */}
          {(!isGeminiAgent || (!geminiSessionsLoading && geminiSessions.length === 0)) && sessions.length === 0 && (
            <div className="text-center py-6 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              No previous sessions found for this workspace
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gemini CLI 原生会话列表项 */
function GeminiSessionItem({
  session,
  onSelect,
  formatTime,
}: {
  session: GeminiSessionInfo;
  onSelect: () => void;
  formatTime: (ts: number) => string;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group mb-1"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
        style={{
          background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.2), oklch(0.72 0.18 195 / 0.15))',
        }}
      >
        🔄
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{session.title}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: 'oklch(0.55 0.20 270 / 0.15)',
              color: 'oklch(0.75 0.15 270)',
              fontSize: '0.6rem',
            }}>
            Resumable
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>
            [{session.id}]
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
          {formatTime(session.updatedAt)}
        </span>
        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'oklch(0.75 0.15 270)', fontSize: '0.6rem' }}>
          Resume →
        </span>
      </div>
    </button>
  );
}

/** 本地 UI 历史会话列表项 */
function LocalSessionItem({
  session,
  onSelect,
  formatTime,
}: {
  session: Session;
  onSelect: () => void;
  formatTime: (ts: number) => string;
}) {
  const lastMsg = session.messages[session.messages.length - 1];
  const preview = lastMsg
    ? (lastMsg.role === 'user' ? '→ ' : '← ') + lastMsg.content.slice(0, 60)
    : 'Empty session';

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group mb-1"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-primary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: 'var(--color-text-muted)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{session.name}</span>
        </div>
        <div className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
          {preview}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
          {formatTime(session.createdAt)}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
          {session.messages.length} msgs
        </span>
      </div>
    </button>
  );
}
