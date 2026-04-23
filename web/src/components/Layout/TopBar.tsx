import { useState, useEffect, useRef } from 'react';
import { FolderOpen, LoaderCircle, Menu, Play, Square, X } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useBackendStore, getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import FolderPickerModal from '../FolderPickerModal';
import BackendSettingsModal from '../Settings/BackendSettingsModal';
import WorkspacePickerModal from '../WorkspacePickerModal';
import SessionPickerModal from '../SessionPickerModal';

interface Props {
  onStartAgent: (agentId: string, workDir: string, opts?: { geminiSessionId?: string; model?: string }) => void;
  onStopAgent: (agentId: string) => void;
  /** 当此值变化时，自动触发 Launch 流程 */
  launchTrigger?: number;
  /** 为 true 时隐藏 header 栏（桌面端用 ActivityBar 替代），但弹窗仍可用 */
  hideHeader?: boolean;
}

export default function TopBar({ onStartAgent, onStopAgent, launchTrigger, hideHeader }: Props) {
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
  const [selectedModel, setSelectedModel] = useState('');

  const activeAgent = agents.find((a) => a.id === activeAgentId) || agents[0];
  const isRunning = agentStatus === 'running';
  const isStarting = agentStatus === 'starting';

  const handleLaunchClick = () => {
    setShowWorkspacePicker(true);
    setShowMobileMenu(false);
  };

  /*
   * launchTrigger 是「递增触发器」：每次 App 层想触发 Launch 弹窗就把它 +1。
   * 但由于 shell 切换（如 isMobile 跨断点、classic <-> pwa 切换）会导致
   * TopBar 重新挂载，此时 useEffect 首次运行会把一个 「历史残留值」
   * 误当成「新触发」处理，导致窗口变大/变小时弹窗自己跳出来。
   * 用 ref 记住「上次已消费过的值」，只有真正发生递增时才响应。
   */
  const lastHandledLaunchTriggerRef = useRef<number | undefined>(launchTrigger);
  useEffect(() => {
    // 无值或非正数：仅更新基准，不触发
    if (!(launchTrigger && launchTrigger > 0)) {
      lastHandledLaunchTriggerRef.current = launchTrigger;
      return undefined;
    }
    // 和上次已消费值相同（挂载时的初始值 或 重复值），不触发
    if (lastHandledLaunchTriggerRef.current === launchTrigger) {
      return undefined;
    }
    lastHandledLaunchTriggerRef.current = launchTrigger;

    const frameId = window.requestAnimationFrame(() => {
      setShowWorkspacePicker(true);
      setShowMobileMenu(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [launchTrigger]);

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
      onStartAgent(activeAgent.id, path, selectedModel ? { model: selectedModel } : undefined);
      recordWorkspace(path);
    }
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
    {!hideHeader && (
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
    )}

    {/* ==================== Mobile Header ==================== */}
    {!hideHeader && (
    <header className="sm:hidden glass-strong z-10 safe-top"
      style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        {/* Left: Back + Session info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 cursor-pointer flex-shrink-0"
            style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: 'none' }}
            title="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
              {activeAgent?.name || 'BaoMiHua'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRunning ? 'animate-pulse-glow' : ''}`}
                style={{ background: statusDotColor }}
              />
              <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                {activeAgent?.mode || 'claude'} · {useChatStore.getState().activeModel || 'default'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRunning && (
            <button
              onClick={handleToggleFileBrowser}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 cursor-pointer"
              style={{
                background: showFileBrowser ? 'var(--color-surface-3)' : 'transparent',
                color: showFileBrowser ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                border: 'none',
              }}
              title="Open file browser"
            >
              <FolderOpen size={16} />
            </button>
          )}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 cursor-pointer"
            style={{
              background: showMobileMenu ? 'var(--color-surface-3)' : 'transparent',
              color: 'var(--color-text-secondary)',
              border: 'none',
            }}
            title={showMobileMenu ? 'Close menu' : 'Open menu'}
          >
            {showMobileMenu ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
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
              {/* Quick Actions */}
              <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                {!isRunning && !isStarting && activeAgent && (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      handleLaunchClick();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    <Play size={14} />
                    <span>Launch</span>
                  </button>
                )}
                {isRunning && (
                  <>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        handleToggleFileBrowser();
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 cursor-pointer"
                      style={{
                        background: showFileBrowser ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
                        color: showFileBrowser ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <FolderOpen size={14} />
                      <span>Files</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        if (activeAgent) onStopAgent(activeAgent.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 cursor-pointer"
                      style={{
                        background: 'var(--color-surface-2)',
                        color: 'var(--color-danger)',
                        border: '1px solid var(--color-danger)',
                      }}
                    >
                      <Square size={14} fill="currentColor" />
                      <span>Stop</span>
                    </button>
                  </>
                )}
                {isStarting && (
                  <div className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-xl"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-warning)' }}>
                    <LoaderCircle size={14} className="animate-spin" />
                    <span className="font-medium">Starting...</span>
                  </div>
                )}
              </div>

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
    )}

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

      {/* Session picker - 选择完工作区后弹出，提供 Agent / Model 选择与新建会话 */}
      {pendingWorkDir && (
        <SessionPickerModal
          open={showSessionPicker}
          workDir={pendingWorkDir}
          agents={agents}
          selectedAgentId={activeAgent?.id || null}
          selectedModel={selectedModel}
          onAgentChange={(agentId) => {
            useChatStore.getState().setActiveAgentId(agentId);
          }}
          onModelChange={setSelectedModel}
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
