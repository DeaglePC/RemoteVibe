import { useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useBackendStore, getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import FolderPickerModal from '../FolderPickerModal';
import BackendSettingsModal from '../Settings/BackendSettingsModal';
import WorkspacePickerModal from '../WorkspacePickerModal';
import SessionPickerModal from '../SessionPickerModal';

interface Props {
  onStartAgent: (agentId: string, workDir: string) => void;
  onStartAgentWithResume: (agentId: string, workDir: string, geminiSessionId: string) => void;
  onStopAgent: (agentId: string) => void;
}

export default function TopBar({ onStartAgent, onStartAgentWithResume, onStopAgent }: Props) {
  const agents = useChatStore((s) => s.agents);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const showFileBrowser = useChatStore((s) => s.showFileBrowser);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);

  // 后端管理
  const backends = useBackendStore((s) => s.backends);
  const activeBackendId = useBackendStore((s) => s.activeBackendId);
  const showBackendSettings = useBackendStore((s) => s.showSettings);
  const activeBackend = backends.find((b) => b.id === activeBackendId);

  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const [showBackendSwitcher, setShowBackendSwitcher] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [pendingWorkDir, setPendingWorkDir] = useState<string | null>(null);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || agents[0];
  const isRunning = agentStatus === 'running';
  const isStarting = agentStatus === 'starting';

  const handleLaunchClick = () => {
    setShowWorkspacePicker(true);
    setShowMobileMenu(false);
  };

  const handleFolderSelect = (path: string) => {
    setShowFolderPicker(false);
    handleWorkspaceSelected(path);
  };

  /** 工作区选中后的通用处理：弹出 session picker 让用户选择 */
  const handleWorkspaceSelected = (path: string) => {
    setShowWorkspacePicker(false);
    // 始终弹出 session picker，因为可能有 Gemini CLI 原生会话
    setPendingWorkDir(path);
    setShowSessionPicker(true);
  };

  /** 记录工作区使用到后端 */
  const recordWorkspace = (path: string) => {
    fetch(`${getApiBaseUrl()}/api/workspaces`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ path }),
    }).catch((err) => {
      console.warn('[TopBar] Failed to record workspace:', err);
    });
  };

  /** 启动全新会话 */
  const startNewSession = (path: string) => {
    setShowSessionPicker(false);
    setPendingWorkDir(null);
    if (activeAgent) {
      useChatStore.getState().createSession(activeAgent.id, path);
      // 立即设为 starting，避免在后端回复前显示 Offline
      useChatStore.getState().setAgentStatus('starting');
      onStartAgent(activeAgent.id, path);
      recordWorkspace(path);
    }
  };

  /** 恢复历史会话并重新启动 agent */
  const handleRestoreAndStart = (sessionId: string) => {
    setShowSessionPicker(false);
    const store = useChatStore.getState();
    store.restoreSession(sessionId);
    const session = store.sessions.find((s) => s.id === sessionId);
    if (session && activeAgent) {
      // 立即设为 starting，避免在后端回复前显示 Offline
      store.setAgentStatus('starting');
      onStartAgent(activeAgent.id, session.workDir);
      recordWorkspace(session.workDir);
    }
    setPendingWorkDir(null);
  };

  /** 恢复 Gemini CLI 原生会话（真正恢复 agent 上下文） */
  const handleResumeGeminiSession = (geminiSessionId: string) => {
    setShowSessionPicker(false);
    const workDir = pendingWorkDir;
    if (workDir && activeAgent) {
      useChatStore.getState().createSession(activeAgent.id, workDir);
      // 立即将全局 agentStatus 设为 starting，避免在等待后端回复前显示 Offline
      useChatStore.getState().setAgentStatus('starting');
      useChatStore.getState().addMessage({
        id: `msg_${Date.now()}_resume`,
        role: 'system',
        content: `🔄 Resuming Gemini CLI session ${geminiSessionId.slice(0, 8)}...`,
        timestamp: Date.now(),
      });
      onStartAgentWithResume(activeAgent.id, workDir, geminiSessionId);
      recordWorkspace(workDir);
    }
    setPendingWorkDir(null);
  };

  /** 后端连接成功后触发的回调 */
  const handleBackendConnected = () => {
    setShowWorkspacePicker(true);
  };

  const handleFolderCancel = () => {
    setShowFolderPicker(false);
  };

  const handleSwitchSession = (sessionId: string) => {
    useChatStore.getState().switchSession(sessionId);
    setShowSessionList(false);
    setShowMobileMenu(false);
  };

  const handleRestoreSession = (sessionId: string) => {
    useChatStore.getState().restoreSession(sessionId);
    setShowSessionList(false);
    setShowMobileMenu(false);
  };

  const handleRemoveSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    useChatStore.getState().removeSession(sessionId);
  };

  const handleClearHistory = () => {
    useChatStore.getState().clearHistory();
  };

  const handleToggleFileBrowser = () => {
    useChatStore.getState().setShowFileBrowser(!showFileBrowser);
    setShowMobileMenu(false);
  };

  // 把会话分为活跃的和历史的
  const activeSessions = sessions.filter((s) => s.agentStatus === 'running' || s.agentStatus === 'starting');
  const historySessions = sessions.filter((s) => s.agentStatus !== 'running' && s.agentStatus !== 'starting');

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 状态指示点颜色
  const statusDotColor = isRunning
    ? 'var(--color-success)'
    : isStarting
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';

  const statusText = isRunning ? 'Connected' : isStarting ? 'Starting' : 'Offline';

  // ==================== Session List Dropdown Content ====================
  const sessionDropdownContent = (
    <div
      className="rounded-xl overflow-hidden animate-fade-in-up"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 8px 30px oklch(0 0 0 / 0.3)',
        maxHeight: '400px',
        overflowY: 'auto',
      }}
    >
      {/* Active sessions section */}
      {activeSessions.length > 0 && (
        <>
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            🟢 Active
          </div>
          {activeSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSwitchSession(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all cursor-pointer group"
              style={{
                background: s.id === activeSessionId ? 'var(--color-surface-2)' : 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                borderLeft: s.id === activeSessionId ? '3px solid var(--color-accent-500)' : '3px solid transparent',
              }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                style={{ background: 'var(--color-success)' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {s.workDir}
                </div>
              </div>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {s.messages.length} msgs
              </span>
            </button>
          ))}
        </>
      )}

      {/* History sessions section */}
      {historySessions.length > 0 && (
        <>
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider flex items-center justify-between"
            style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', borderTop: activeSessions.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
            <span>🕐 History</span>
            <button
              onClick={handleClearHistory}
              className="text-xs px-1.5 py-0.5 rounded cursor-pointer transition-all hover:opacity-80"
              style={{ color: 'var(--color-danger)', background: 'transparent', border: 'none' }}
            >
              Clear
            </button>
          </div>
          {historySessions
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((s) => (
            <button
              key={s.id}
              onClick={() => handleRestoreSession(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all cursor-pointer group"
              style={{
                background: s.id === activeSessionId ? 'var(--color-surface-2)' : 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                borderLeft: s.id === activeSessionId ? '3px solid var(--color-accent-500)' : '3px solid transparent',
              }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: 'var(--color-text-muted)' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.name}</div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{s.workDir.split('/').pop()}</span>
                  <span>·</span>
                  <span>{formatTime(s.createdAt)}</span>
                  <span>·</span>
                  <span>{s.messages.length} msgs</span>
                </div>
              </div>
              <button
                onClick={(e) => handleRemoveSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 text-xs px-1 py-0.5 rounded cursor-pointer transition-all"
                style={{ color: 'var(--color-danger)', background: 'transparent', border: 'none' }}
                title="Delete session"
              >
                ✕
              </button>
            </button>
          ))}
        </>
      )}

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
          No sessions yet
        </div>
      )}
    </div>
  );

  return (
    <>
    {/* ==================== Desktop Header ==================== */}
    <header className="hidden sm:flex glass-strong items-center justify-between px-4 py-3 z-10"
      style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
          style={{
            background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
          }}>
          🐾
        </div>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            BaoMiHua
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Agent Gateway
          </p>
        </div>
      </div>

      {/* Center: Agent selector + Session tabs + Controls */}
      <div className="flex items-center gap-2">
        {/* Agent selector */}
        {agents.length > 0 && (
          <select
            className="text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
            value={activeAgent?.id || ''}
            onChange={(e) => {
              useChatStore.getState().setActiveAgentId(e.target.value);
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {/* Session list button */}
        {sessions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowSessionList(!showSessionList)}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              style={{
                background: showSessionList ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                color: showSessionList ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              {sessions.length} Session{sessions.length > 1 ? 's' : ''}
            </button>

            {/* Session dropdown */}
            {showSessionList && (
              <div className="absolute top-full mt-1 left-0 z-50" style={{ minWidth: '280px' }}>
                {sessionDropdownContent}
              </div>
            )}
          </div>
        )}

        {/* Launch button */}
        {!isRunning && !isStarting && activeAgent && (
          <button
            onClick={handleLaunchClick}
            className="text-sm font-medium px-4 py-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
              color: 'white',
              border: 'none',
            }}
          >
            Launch
          </button>
        )}

        {isStarting && (
          <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-warning)' }}>
            <span className="animate-spin">⟳</span> Starting...
          </div>
        )}

        {isRunning && (
          <>
            {/* File browser toggle */}
            <button
              onClick={handleToggleFileBrowser}
              className="text-sm px-2.5 py-1.5 rounded-lg transition-all duration-200 hover:opacity-80 cursor-pointer"
              style={{
                background: showFileBrowser ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                color: showFileBrowser ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
              title={`Browse files: ${activeWorkDir || ''}`}
            >
              📂
            </button>

            <button
              onClick={() => activeAgent && onStopAgent(activeAgent.id)}
              className="text-sm px-3 py-1.5 rounded-lg transition-all duration-200 hover:opacity-80 cursor-pointer"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger)',
              }}
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Right: Backend switcher + Status indicators */}
      <div className="flex items-center gap-2">
        {/* Backend selector */}
        <div className="relative">
          <button
            onClick={() => setShowBackendSwitcher(!showBackendSwitcher)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
            style={{
              background: showBackendSwitcher ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
              color: activeBackend ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
            title="Switch backend"
          >
            <span>🔗</span>
            <span className="max-w-[100px] truncate" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
              {activeBackend?.name || 'Local'}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Backend dropdown + click-outside overlay */}
          {showBackendSwitcher && (
            <>
              <div
                className="fixed inset-0"
                style={{ zIndex: 99 }}
                onClick={() => setShowBackendSwitcher(false)}
              />
              <div
                className="absolute top-full mt-1 right-0 rounded-xl overflow-hidden animate-fade-in-up"
                style={{
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 8px 30px oklch(0 0 0 / 0.3)',
                  minWidth: '200px',
                  zIndex: 100,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {backends.length === 0 && (
                  <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                    No backends configured
                  </div>
                )}
                {backends.map((b) => {
                  const isActive = b.id === activeBackendId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        if (!isActive) {
                          useBackendStore.getState().setActiveBackend(b.id);
                        }
                        setShowBackendSwitcher(false);
                        // 切换到非活跃后端时自动弹出 workspace picker
                        if (!isActive) {
                          setTimeout(() => setShowWorkspacePicker(true), 300);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all cursor-pointer"
                      style={{
                        background: isActive ? 'var(--color-surface-2)' : 'transparent',
                        border: 'none',
                        color: 'var(--color-text-primary)',
                        borderLeft: isActive ? '3px solid var(--color-accent-500)' : '3px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--color-surface-2)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: isActive ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{b.name}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>
                          {b.apiUrl}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Settings button */}
                <div style={{ borderTop: '1px solid var(--color-border)' }}>
                  <button
                    onClick={() => {
                      setShowBackendSwitcher(false);
                      useBackendStore.getState().setShowSettings(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all cursor-pointer"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-accent-400)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="text-xs">⚙️</span>
                    <span className="text-xs font-medium">Manage Backends...</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Agent status dot */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${isRunning ? 'animate-pulse-glow' : ''}`}
            style={{ background: statusDotColor }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {statusText}
          </span>
        </div>

        {/* WebSocket status */}
        <div className="w-2 h-2 rounded-full ml-2"
          style={{
            background: wsStatus === 'connected'
              ? 'var(--color-success)'
              : wsStatus === 'connecting'
                ? 'var(--color-warning)'
                : 'var(--color-danger)',
          }}
          title={`WS: ${wsStatus}`}
        />
      </div>
    </header>

    {/* ==================== Mobile Header ==================== */}
    <header className="sm:hidden glass-strong z-10 safe-top"
      style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-3 py-2">
        {/* Left: Logo + Status */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
            }}>
            🐾
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${isRunning ? 'animate-pulse-glow' : ''}`}
              style={{ background: statusDotColor }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {statusText}
            </span>
            {/* WS status dot */}
            <div className="w-1.5 h-1.5 rounded-full"
              style={{
                background: wsStatus === 'connected'
                  ? 'var(--color-success)'
                  : wsStatus === 'connecting'
                    ? 'var(--color-warning)'
                    : 'var(--color-danger)',
              }}
            />
          </div>
        </div>

        {/* Center: Quick actions */}
        <div className="flex items-center gap-1.5">
          {!isRunning && !isStarting && activeAgent && (
            <button
              onClick={handleLaunchClick}
              className="text-xs font-medium px-3 py-1.5 rounded-lg active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                color: 'white',
                border: 'none',
              }}
            >
              Launch
            </button>
          )}

          {isStarting && (
            <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-warning)' }}>
              <span className="animate-spin">⟳</span>
            </div>
          )}

          {isRunning && (
            <>
              <button
                onClick={handleToggleFileBrowser}
                className="p-1.5 rounded-lg active:scale-95 cursor-pointer"
                style={{
                  background: showFileBrowser ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                  color: showFileBrowser ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="text-sm">📂</span>
              </button>

              <button
                onClick={() => activeAgent && onStopAgent(activeAgent.id)}
                className="p-1.5 rounded-lg active:scale-95 cursor-pointer"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-danger)',
                  border: '1px solid var(--color-danger)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Right: Menu button */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="p-1.5 rounded-lg active:scale-95 cursor-pointer"
          style={{
            background: showMobileMenu ? 'var(--color-surface-3)' : 'transparent',
            color: 'var(--color-text-secondary)',
            border: 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {showMobileMenu ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {showMobileMenu && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 98 }}
            onClick={() => setShowMobileMenu(false)}
          />
          <div
            className="relative animate-fade-in-up px-3 pb-3"
            style={{ zIndex: 99 }}
          >
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 8px 30px oklch(0 0 0 / 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Agent selector */}
              {agents.length > 0 && (
                <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Agent</div>
                  <select
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none cursor-pointer"
                    style={{
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                    value={activeAgent?.id || ''}
                    onChange={(e) => {
                      useChatStore.getState().setActiveAgentId(e.target.value);
                    }}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sessions */}
              {sessions.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Sessions ({sessions.length})
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {activeSessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSwitchSession(s.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:opacity-70 cursor-pointer"
                        style={{
                          background: s.id === activeSessionId ? 'var(--color-surface-2)' : 'transparent',
                          border: 'none',
                          color: 'var(--color-text-primary)',
                          borderLeft: s.id === activeSessionId ? '3px solid var(--color-accent-500)' : '3px solid transparent',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                          style={{ background: 'var(--color-success)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{s.name}</div>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {s.messages.length}
                        </span>
                      </button>
                    ))}
                    {historySessions
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleRestoreSession(s.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:opacity-70 cursor-pointer"
                        style={{
                          background: s.id === activeSessionId ? 'var(--color-surface-2)' : 'transparent',
                          border: 'none',
                          color: 'var(--color-text-primary)',
                          borderLeft: s.id === activeSessionId ? '3px solid var(--color-accent-500)' : '3px solid transparent',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: 'var(--color-text-muted)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{s.name}</div>
                          <div className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                            {formatTime(s.createdAt)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Backend info */}
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  useBackendStore.getState().setShowSettings(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:opacity-70 cursor-pointer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-primary)',
                }}
              >
                <span className="text-sm">🔗</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{activeBackend?.name || 'Local'}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>
                    {activeBackend?.apiUrl || window.location.origin}
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-accent-400)' }}>⚙️</span>
              </button>
            </div>
          </div>
        </>
      )}
    </header>

      <FolderPickerModal
        open={showFolderPicker}
        onSelect={handleFolderSelect}
        onCancel={handleFolderCancel}
      />

      {/* Workspace picker - shown after backend connection or on Launch */}
      <WorkspacePickerModal
        open={showWorkspacePicker}
        onSelectWorkspace={handleWorkspaceSelected}
        onBrowseNew={() => {
          setShowWorkspacePicker(false);
          setShowFolderPicker(true);
        }}
        onClose={() => setShowWorkspacePicker(false)}
      />

      {/* Session picker - shown after workspace selection if history exists */}
      {pendingWorkDir && (
        <SessionPickerModal
          open={showSessionPicker}
          workDir={pendingWorkDir}
          sessions={sessions.filter(
            (s) => s.workDir === pendingWorkDir && s.messages.length > 0
          )}
          onRestoreSession={handleRestoreAndStart}
          onResumeGeminiSession={handleResumeGeminiSession}
          onNewSession={() => startNewSession(pendingWorkDir)}
          onClose={() => {
            setShowSessionPicker(false);
            setPendingWorkDir(null);
          }}
        />
      )}

      {/* Click-outside handler for session list (desktop) */}
      {showSessionList && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSessionList(false)}
        />
      )}

      {/* Backend settings modal */}
      <BackendSettingsModal
        open={showBackendSettings}
        onClose={() => useBackendStore.getState().setShowSettings(false)}
        onConnected={handleBackendConnected}
      />
    </>
  );
}
