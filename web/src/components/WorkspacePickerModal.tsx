import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, getAuthHeaders } from '../stores/backendStore';

interface WorkspaceInfo {
  path: string;
  lastUsed: number;
  sessionCount: number;
}

interface Props {
  open: boolean;
  onSelectWorkspace: (path: string) => void;
  onBrowseNew: () => void;
  onClose: () => void;
}

/**
 * WorkspacePickerModal 在连接后端成功后展示历史工作区列表。
 * 用户可以快速选择一个历史工作区或浏览新目录。
 */
interface AgentAuthInfo {
  id: string;
  name: string;
  authenticated: boolean;
}

export default function WorkspacePickerModal({ open, onSelectWorkspace, onBrowseNew, onClose }: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthAgents, setUnauthAgents] = useState<AgentAuthInfo[]>([]);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/workspaces`, {
        headers: getAuthHeaders(),
      });
      if (!resp.ok) {
        setError(`HTTP ${resp.status}: ${resp.statusText}`);
        return;
      }
      const data = await resp.json();
      setWorkspaces(data.workspaces || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  /** 检查 Agent CLI 认证状态 */
  const fetchAuthStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/auth-status`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const agents: AgentAuthInfo[] = data.agents || [];
      setUnauthAgents(agents.filter((a) => !a.authenticated));
    } catch {
      // 认证检测失败时不阻塞正常功能
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchWorkspaces();
      fetchAuthStatus();
    }
  }, [open, fetchWorkspaces, fetchAuthStatus]);

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl overflow-hidden animate-fade-in-up"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px oklch(0 0 0 / 0.5)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.15), oklch(0.72 0.18 195 / 0.1))',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className="text-xl">📂</span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Open Workspace
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Select a recent workspace or browse a new folder
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-6 text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </div>
          )}

          {!loading && !error && workspaces.length === 0 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-3">🆕</div>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No recent workspaces
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Browse a folder to get started
              </p>
            </div>
          )}

          {!loading && !error && workspaces.length > 0 && (
            <div className="px-3 py-2">
              <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
                Recent Workspaces
              </div>
              {workspaces.map((ws) => {
                const folderName = ws.path.split('/').pop() || ws.path;
                const parentPath = ws.path.replace(/\/[^/]+$/, '');
                return (
                  <button
                    key={ws.path}
                    onClick={() => onSelectWorkspace(ws.path)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-150 cursor-pointer group mb-1"
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
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: 'var(--color-surface-3)' }}
                    >
                      📂
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{folderName}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                        {parentPath}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                        {formatTime(ws.lastUsed)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                        {ws.sessionCount} session{ws.sessionCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent CLI auth hint - 仅在有未认证的 Agent 时显示 */}
        {unauthAgents.length > 0 && (
          <div
            className="mx-4 mb-3 px-3 py-2.5 rounded-lg"
            style={{
              background: 'oklch(0.80 0.16 80 / 0.08)',
              border: '1px solid oklch(0.80 0.16 80 / 0.2)',
            }}
          >
            {unauthAgents.map((agent) => (
              <div key={agent.id} className="flex items-start gap-2">
                <span className="text-sm flex-shrink-0 mt-0.5">💡</span>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                    {agent.name} Auth Required
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Run <code style={{ background: 'var(--color-surface-3)', padding: '0 4px', borderRadius: '3px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {agent.id === 'gemini' ? 'gemini auth login' : `${agent.id} auth login`}
                    </code> on the server before first use. This cannot be done remotely.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 flex-shrink-0 safe-bottom"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg transition-all cursor-pointer hover:opacity-80"
            style={{
              background: 'var(--color-surface-3)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onBrowseNew}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
              color: 'white',
              border: 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Browse Folder
          </button>
        </div>
      </div>
    </div>
  );
}
