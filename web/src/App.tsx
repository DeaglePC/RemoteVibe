import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useChatStore, genMessageId } from './stores/chatStore';
import { useBackendStore, pingAllBackends } from './stores/backendStore';
import { getSlashCommands, inferAgentKind } from './types/protocol';
import TopBar from './components/Layout/TopBar';
import ActivityBar from './components/Layout/ActivityBar';
import ChatView from './components/ChatView/ChatView';
import ChatRuntimeStrip from './components/ChatView/ChatRuntimeStrip';
import InputBar from './components/ChatView/InputBar';
import TerminalView from './components/ChatView/TerminalView';
import FileTreeBrowser from './components/FileBrowser/FileTreeBrowser';
import FileViewer from './components/FileBrowser/FileViewer';
import SimpleToast from './components/Toast/SimpleToast';
import DesktopShell from './components/Layout/DesktopShell';
import MobileShell from './components/Layout/MobileShell';
import { useBuiltinCommands } from './components/CommandPalette/useBuiltinCommands';
import { useShortcuts } from './hooks/useShortcuts';
import { useUIStore } from './stores/uiStore';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

// 懒加载：ACPLogPanel 只在 /log 命令开启时才显示；
// CommandPalette 仅 Cmd+K 打开时才渲染；
// ModelActionSheet 仅点击聊天输入栏齿轮时才显示
const ACPLogPanel = lazy(() => import('./components/Debug/ACPLogPanel'));
const CommandPalette = lazy(() => import('./components/CommandPalette/CommandPalette'));
const ModelActionSheet = lazy(() => import('./components/ChatView/ModelActionSheet'));

export default function App() {
  const { send } = useWebSocket();
  const agentStatus = useChatStore((s) => s.agentStatus);
  const isThinking = useChatStore((s) => s.isAgentThinking);
  const showFileBrowser = useChatStore((s) => s.showFileBrowser);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const viewingFile = useChatStore((s) => s.viewingFile);
  const showACPLogs = useChatStore((s) => s.showACPLogs);

  // 当前活动视图
  const [, setActiveView] = useState<'chat' | 'files'>('chat');

  // 启动时加载历史会话
  useEffect(() => {
    useChatStore.getState().loadHistorySessions();
    // P5 多机器管理：启动时探测所有后端的在线状态
    void pingAllBackends();
  }, []);

  const handleStartAgent = useCallback((agentId: string, workDir: string, opts?: { geminiSessionId?: string; model?: string }) => {
    const payload: Record<string, string> = { agentId, workDir };
    if (opts?.geminiSessionId) {
      payload.geminiSessionId = opts.geminiSessionId;
    }
    if (opts?.model) {
      payload.model = opts.model;
    }
    if (opts && 'model' in opts) {
      useChatStore.getState().setActiveModel(opts.model || null);
    }
    send({ type: 'start_agent', payload });
  }, [send]);

  const handleStopAgent = useCallback((agentId: string) => {
    send({ type: 'stop_agent', payload: { agentId } });
    useChatStore.getState().setActiveWorkDir(null);
    useChatStore.getState().setShowFileBrowser(false);
    useChatStore.getState().setViewingFile(null);
  }, [send]);

  const handleSendPrompt = useCallback((text: string) => {
    useChatStore.getState().addMessage({
      id: genMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    send({ type: 'send_prompt', payload: { text } });
    useChatStore.getState().setIsAgentThinking(true);
    useChatStore.getState().clearThinkingContent();
  }, [send]);

  const handleReconnectSession = useCallback(() => {
    const store = useChatStore.getState();

    if (!store.activeSessionId || !store.activeAgentId || !store.activeWorkDir) {
      return;
    }

    if (store.agentStatus === 'running' || store.agentStatus === 'starting') {
      return;
    }

    if (store.wsStatus !== 'connected') {
      store.addMessage({
        id: genMessageId(),
        role: 'system',
        content: '⚠️ WebSocket is not connected yet. Please wait a moment and try reconnect again.',
        timestamp: Date.now(),
      });
      return;
    }

    store.addMessage({
      id: genMessageId(),
      role: 'system',
      content: `🔄 Reconnecting session \`${store.activeSessionId}\`...`,
      timestamp: Date.now(),
    });

    handleStartAgent(
      store.activeAgentId,
      store.activeWorkDir,
      store.activeModel ? { model: store.activeModel } : undefined,
    );
  }, [handleStartAgent]);

  const handleSlashCommand = useCallback((commandId: string) => {
    const store = useChatStore.getState();
    const kind = inferAgentKind(activeAgentId);
    const availableCommands = getSlashCommands(kind);
    const cmdDef = availableCommands.find((c) => c.id === commandId);

    if (cmdDef?.scope === 'agent') {
      // agent 命令统一走 prompt 透传（info 型已在瘦身时全部移除）
      if (agentStatus !== 'running') {
        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: `⚠️ Agent is not running. Start an agent first to use \`${cmdDef.name}\`.`,
          timestamp: Date.now(),
        });
        return;
      }
      store.addMessage({
        id: genMessageId(),
        role: 'system',
        content: `${cmdDef.icon} Executing \`${cmdDef.name}\` — sending equivalent prompt to agent...`,
        timestamp: Date.now(),
      });
      handleSendPrompt(cmdDef.webPrompt || cmdDef.description);
      return;
    }

    switch (commandId) {
      case 'help': {
        const localCmds = availableCommands.filter((c) => c.scope === 'local');
        const agentCmds = availableCommands.filter((c) => c.scope === 'agent');

        let helpText = '📖 **Available Commands**\n\n';
        helpText += '**App Commands** (handled locally):\n';
        for (const cmd of localCmds) {
          helpText += `- \`${cmd.name}\` — ${cmd.description}\n`;
        }

        if (agentCmds.length > 0) {
          const agentLabel = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Agent';
          helpText += `\n**${agentLabel} Agent Commands** (sent as prompt to agent):\n`;
          const agentGroups = new Map<string, typeof agentCmds>();
          for (const cmd of agentCmds) {
            const group = agentGroups.get(cmd.group) || [];
            group.push(cmd);
            agentGroups.set(cmd.group, group);
          }
          for (const [group, cmds] of agentGroups) {
            helpText += `\n*${group}:*\n`;
            for (const cmd of cmds) {
              helpText += `- \`${cmd.name}\` — ${cmd.description}\n`;
            }
          }
        } else {
          helpText += '\n_Start an agent to see agent-specific commands._\n';
        }

        store.addMessage({ id: genMessageId(), role: 'system', content: helpText, timestamp: Date.now() });
        break;
      }
      case 'clear': {
        store.clearMessages();
        store.addMessage({ id: genMessageId(), role: 'system', content: '🧹 Chat history cleared.', timestamp: Date.now() });
        break;
      }
      case 'files': {
        if (agentStatus === 'running' && activeWorkDir) {
          store.setShowFileBrowser(!showFileBrowser);
          setActiveView(showFileBrowser ? 'chat' : 'files');
        } else {
          store.addMessage({ id: genMessageId(), role: 'system', content: '⚠️ No agent running. Start an agent first to browse files.', timestamp: Date.now() });
        }
        break;
      }
      case 'history': {
        const sessions = store.sessions;
        if (sessions.length === 0) {
          store.addMessage({ id: genMessageId(), role: 'system', content: '🕐 No session history found.', timestamp: Date.now() });
        } else {
          const lines = sessions.map((s, i) => {
            const date = new Date(s.createdAt).toLocaleString();
            const msgCount = s.messages.length;
            const active = s.id === store.activeSessionId ? ' ← current' : '';
            return `${i + 1}. **${s.name}** (${msgCount} msgs, ${date})${active}`;
          });
          store.addMessage({
            id: genMessageId(), role: 'system',
            content: `🕐 Session History (${sessions.length}):\n${lines.join('\n')}\n\nUse the session switcher in the top bar to restore a session.`,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'status': {
        const agent = store.agents.find((a) => a.id === store.activeAgentId);
        store.addMessage({
          id: genMessageId(), role: 'system',
          content: `📊 Status:\n• Agent: ${agent?.name || 'None'}\n• Status: ${store.agentStatus}\n• Work Dir: ${store.activeWorkDir || 'N/A'}\n• WebSocket: ${store.wsStatus}\n• Sessions: ${store.sessions.length}`,
          timestamp: Date.now(),
        });
        break;
      }
      case 'stop': {
        if (activeAgentId && agentStatus === 'running') {
          handleStopAgent(activeAgentId);
        } else {
          store.addMessage({ id: genMessageId(), role: 'system', content: '⚠️ No agent running to stop.', timestamp: Date.now() });
        }
        break;
      }
      case 'restart': {
        if (activeAgentId && activeWorkDir) {
          handleStopAgent(activeAgentId);
          setTimeout(() => { handleStartAgent(activeAgentId, activeWorkDir); }, 1000);
        } else {
          store.addMessage({ id: genMessageId(), role: 'system', content: '⚠️ No agent to restart.', timestamp: Date.now() });
        }
        break;
      }
      case 'log': {
        const current = store.showACPLogs;
        store.setShowACPLogs(!current);
        store.addMessage({
          id: genMessageId(), role: 'system',
          content: current ? '📡 ACP log panel closed.' : '📡 ACP log panel opened. You can see all protocol communication with Gemini CLI.',
          timestamp: Date.now(),
        });
        break;
      }
      default: {
        store.addMessage({ id: genMessageId(), role: 'system', content: `⚠️ Unknown command: ${commandId}`, timestamp: Date.now() });
      }
    }
  }, [agentStatus, activeWorkDir, activeAgentId, showFileBrowser, handleStopAgent, handleStartAgent, handleSendPrompt]);

  const handlePermissionRespond = useCallback((requestId: unknown, optionId: string) => {
    send({ type: 'permission_response', payload: { requestId, optionId } });
    useChatStore.getState().removePermissionRequest(requestId);
  }, [send]);

  const handleCancel = useCallback(() => {
    send({ type: 'cancel', payload: {} });
  }, [send]);

  const handleFileOpen = useCallback((filePath: string, fileName: string, fileSize?: number) => {
    useChatStore.getState().setViewingFile({ path: filePath, name: fileName, size: fileSize });
  }, []);

  const handleCloseFileViewer = useCallback(() => {
    useChatStore.getState().setViewingFile(null);
  }, []);

  const handleCloseFileBrowser = useCallback(() => {
    useChatStore.getState().setShowFileBrowser(false);
    useChatStore.getState().setViewingFile(null);
    setActiveView('chat');
  }, []);

  const handleViewChange = useCallback((view: 'chat' | 'files') => {
    setActiveView(view);
    if (view === 'files') {
      useChatStore.getState().setShowFileBrowser(true);
    } else {
      useChatStore.getState().setShowFileBrowser(false);
      useChatStore.getState().setViewingFile(null);
    }
  }, []);

  // 用于从 ActivityBar 触发 TopBar 的 Launch 流程
  const [showLaunchTrigger, setShowLaunchTrigger] = useState(0);

  // Model action sheet（聊天输入栏齿轮点击打开）
  const [showModelSheet, setShowModelSheet] = useState(false);
  const handleOpenModelSheet = useCallback(() => setShowModelSheet(true), []);
  const handleCloseModelSheet = useCallback(() => setShowModelSheet(false), []);

  const handleModelSelect = useCallback((modelId: string) => {
    const store = useChatStore.getState();
    const { activeAgentId, activeWorkDir, agentStatus } = store;

    if (activeAgentId && activeWorkDir) {
      if (agentStatus === 'running' || agentStatus === 'starting') {
        handleStopAgent(activeAgentId);
        // 给一点时间让之前的进程退出，再带着新模型启动
        setTimeout(() => {
          handleStartAgent(activeAgentId, activeWorkDir, { model: modelId });
        }, 800);
      } else {
        handleStartAgent(activeAgentId, activeWorkDir, { model: modelId });
      }
    }
  }, [handleStartAgent, handleStopAgent]);

  const handleLaunch = useCallback(() => {
    // 触发 TopBar 中的 launch 逻辑 — 通过 ref 或设置状态
    setShowLaunchTrigger((v) => v + 1);
  }, []);

  const handleStop = useCallback(() => {
    const agent = useChatStore.getState().agents.find((a) => a.id === useChatStore.getState().activeAgentId);
    if (agent) handleStopAgent(agent.id);
  }, [handleStopAgent]);

  const isAgentRunning = agentStatus === 'running';
  const fileBrowserVisible = showFileBrowser && activeWorkDir;

  // 响应式检测是否为移动端
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 桌面宽屏 → 移动窄屏时，若已有激活会话且 mobileNavStack 为空，
  // 则自动 push 一个 chat 帧，避免窄屏回落到 L1 "会话浏览" 首页的跳跃感。
  // 反向（窄 → 宽）不做处理，保留栈以便再次缩小时还原上下文。
  useEffect(() => {
    if (!isMobile) return;
    const uiState = useUIStore.getState();
    if (uiState.mobileNavStack.length > 0) return;
    const activeSessionId = useChatStore.getState().activeSessionId;
    if (!activeSessionId) return;
    uiState.pushMobilePage({ type: 'chat', sessionId: activeSessionId });
  }, [isMobile]);

  // ===== P3：新 shell（pwa）相关 =====
  const shellFlavor = useUIStore((s) => s.shellFlavor);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  // 终端模式：classic 布局下也要根据该开关切换聊天 / 终端视图
  const terminalMode = useUIStore((s) => s.terminalMode);

  // 构建命令面板命令集：新建会话转发给 handleLaunch；停止 Agent 转发给 handleStop
  const commands = useBuiltinCommands({
    onNewSession: handleLaunch,
    onStopAgent: handleStop,
  });

  // 全局快捷键：Cmd+K 打开命令面板；Cmd+B 折 Sidebar；Cmd+J 切 Right Pane；Cmd+, 设置；Cmd+N 新建
  useShortcuts([
    { key: 'k', mod: true, handler: () => { setCommandPaletteOpen(true); } },
    { key: 'b', mod: true, handler: () => { useUIStore.getState().toggleSidebarCollapsed(); } },
    { key: 'j', mod: true, handler: () => {
        const st = useUIStore.getState();
        st.setRightPaneContent('files');
        st.toggleRightPaneOpen();
      } },
    { key: ',', mod: true, handler: () => {
        const st = useUIStore.getState();
        st.setSidebarMode('settings');
        if (st.sidebarCollapsed) st.setSidebarCollapsed(false);
      } },
    { key: 'n', mod: true, handler: () => { handleLaunch(); } },
    { key: 'Escape', handler: () => {
        if (useUIStore.getState().commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else {
          return false; // 不消费，让其他组件处理（如 Modal 关闭）
        }
      } },
  ]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-surface-0)' }}>
      {/* TopBar: 
          - classic 壳：手机端显示完整 header，桌面端仅保留弹窗逻辑
          - pwa 壳：DesktopShell / MobileShell 内部自己引入 TopBar（hideHeader=true），这里跳过
      */}
      {shellFlavor === 'classic' && (
        <TopBar
          onStartAgent={handleStartAgent}
          onStopAgent={handleStopAgent}
          launchTrigger={isMobile ? undefined : showLaunchTrigger}
          hideHeader={!isMobile}
        />
      )}

      {/* ===== 主内容区 ===== */}
      {isMobile && shellFlavor === 'pwa' ? (
        /* 手机端：P4 新 PWA 壳 */
        <MobileShell
          onStartAgent={handleStartAgent}
          onStopAgent={handleStopAgent}
          onSendPrompt={handleSendPrompt}
          onSlashCommand={handleSlashCommand}
          onOpenModelSheet={handleOpenModelSheet}
          onCancel={handleCancel}
          onReconnectSession={handleReconnectSession}
          onPermissionRespond={handlePermissionRespond}
          onSendWS={send}
          launchTrigger={showLaunchTrigger}
          onLaunch={handleLaunch}
        />
      ) : isMobile ? (
        /* 移动端：classic 老布局（全屏覆盖模式） */
        <div className="flex flex-1 overflow-hidden relative">
          {fileBrowserVisible && !viewingFile && (
            <div className="mobile-panel animate-slide-up" style={{ background: 'var(--color-surface-0)' }}>
              <FileTreeBrowser
                rootPath={activeWorkDir}
                onClose={handleCloseFileBrowser}
                onFileOpen={handleFileOpen}
                onSendWS={send}
              />
            </div>
          )}
          {viewingFile && (
            <div className="mobile-panel animate-slide-in-right" style={{ background: 'var(--color-surface-0)' }}>
              <FileViewer
                filePath={viewingFile.path}
                fileName={viewingFile.name}
                fileSize={viewingFile.size}
                onClose={handleCloseFileViewer}
                isMobile
              />
            </div>
          )}
          {!fileBrowserVisible && !viewingFile && (
            <div className="flex flex-col flex-1 min-w-0">
              {terminalMode ? (
                <TerminalView cwd={activeWorkDir} />
              ) : (
                <>
                  <ChatRuntimeStrip onReconnectSession={handleReconnectSession} />
                  <ChatView onPermissionRespond={handlePermissionRespond} />
                  <InputBar
                    onSend={handleSendPrompt}
                    onSlashCommand={handleSlashCommand}
                    onOpenModelSheet={handleOpenModelSheet}
                    disabled={!isAgentRunning}
                    isThinking={isThinking}
                    onCancel={handleCancel}
                  />
                </>
              )}
            </div>
          )}
        </div>
      ) : shellFlavor === 'pwa' ? (
        /* 桌面端：P3 新 PWA 壳 */
        <DesktopShell
          onStartAgent={handleStartAgent}
          onStopAgent={handleStopAgent}
          onSendPrompt={handleSendPrompt}
          onSlashCommand={handleSlashCommand}
          onOpenModelSheet={handleOpenModelSheet}
          onCancel={handleCancel}
          onReconnectSession={handleReconnectSession}
          onPermissionRespond={handlePermissionRespond}
          onSendWS={send}
          launchTrigger={showLaunchTrigger}
          onLaunch={handleLaunch}
        />
      ) : (
        /* 桌面端：classic 老布局（?shell=classic 或 localStorage 切换后可用） */
        <div className="flex flex-1 overflow-hidden">
          {/* Activity Bar (最左侧) */}
          <ActivityBar
            activeView={fileBrowserVisible ? 'files' : 'chat'}
            onViewChange={handleViewChange}
            onLaunch={handleLaunch}
            onStop={handleStop}
            onOpenSettings={() => {
              useBackendStore.getState().setShowSettings(true);
            }}
          />

          {/* 可拖拽分割面板 */}
          <div className="flex-1 overflow-hidden">
            <Allotment proportionalLayout={false}>
              {/* 文件树 (左侧面板) */}
              {fileBrowserVisible && (
                <Allotment.Pane minSize={180} maxSize={500} preferredSize={240}>
                  <div className="h-full overflow-hidden">
                    <FileTreeBrowser
                      rootPath={activeWorkDir}
                      onClose={handleCloseFileBrowser}
                      onFileOpen={handleFileOpen}
                      onSendWS={send}
                    />
                  </div>
                </Allotment.Pane>
              )}

              {/* 文件查看器 (中间) — 仅在有文件打开时显示 */}
              {viewingFile && (
                <Allotment.Pane minSize={300} preferredSize={500}>
                  <div className="h-full overflow-hidden">
                    <FileViewer
                      filePath={viewingFile.path}
                      fileName={viewingFile.name}
                      fileSize={viewingFile.size}
                      onClose={handleCloseFileViewer}
                    />
                  </div>
                </Allotment.Pane>
              )}

              {/* 聊天区 (右侧，始终显示) */}
              <Allotment.Pane minSize={320}>
                <Allotment vertical proportionalLayout={false}>
                  {/* 聊天 + 输入框 */}
                  <Allotment.Pane minSize={200}>
                    <div className="flex flex-col h-full min-w-0">
                      {terminalMode ? (
                        <TerminalView cwd={activeWorkDir} />
                      ) : (
                        <>
                          <ChatRuntimeStrip onReconnectSession={handleReconnectSession} />
                          <ChatView onPermissionRespond={handlePermissionRespond} />
                          <InputBar
                            onSend={handleSendPrompt}
                            onSlashCommand={handleSlashCommand}
                            onOpenModelSheet={handleOpenModelSheet}
                            disabled={!isAgentRunning}
                            isThinking={isThinking}
                            onCancel={handleCancel}
                          />
                        </>
                      )}
                    </div>
                  </Allotment.Pane>

                  {/* ACP 协议日志面板 (底部) */}
                  {showACPLogs && (
                    <Allotment.Pane minSize={120} preferredSize={250} maxSize={500}>
                      <Suspense fallback={null}>
                        <ACPLogPanel />
                      </Suspense>
                    </Allotment.Pane>
                  )}
                </Allotment>
              </Allotment.Pane>
            </Allotment>
          </div>
        </div>
      )}

      {/* PWA 提示：新版本可更新 / 可安装到主屏幕（P2 临时 Toast，P3 会替换） */}
      <SimpleToast />

      {/* 命令面板 (Cmd+K) — P3 新增；懒加载，仅打开时渲染 */}
      {commandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
        </Suspense>
      )}

      {/* Model action sheet — 聊天输入栏齿轮打开 */}
      {showModelSheet && (
        <Suspense fallback={null}>
          <ModelActionSheet open={showModelSheet} onClose={handleCloseModelSheet} onModelSelect={handleModelSelect} />
        </Suspense>
      )}
    </div>
  );
}
