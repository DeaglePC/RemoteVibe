import { useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useChatStore, genMessageId } from './stores/chatStore';
import { SLASH_COMMANDS } from './types/protocol';
import TopBar from './components/Layout/TopBar';
import ChatView from './components/ChatView/ChatView';
import InputBar from './components/ChatView/InputBar';
import FileBrowser from './components/FileBrowser/FileBrowser';

export default function App() {
  const { send } = useWebSocket();
  const agentStatus = useChatStore((s) => s.agentStatus);
  const isThinking = useChatStore((s) => s.isAgentThinking);
  const showFileBrowser = useChatStore((s) => s.showFileBrowser);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const activeAgentId = useChatStore((s) => s.activeAgentId);

  // 启动时加载历史会话
  useEffect(() => {
    useChatStore.getState().loadHistorySessions();
  }, []);

  const handleStartAgent = useCallback((agentId: string, workDir: string) => {
    send({ type: 'start_agent', payload: { agentId, workDir } });
  }, [send]);

  const handleStartAgentWithResume = useCallback((agentId: string, workDir: string, geminiSessionId: string) => {
    send({ type: 'start_agent', payload: { agentId, workDir, geminiSessionId } });
  }, [send]);

  const handleStopAgent = useCallback((agentId: string) => {
    send({ type: 'stop_agent', payload: { agentId } });
    useChatStore.getState().setActiveWorkDir(null);
    useChatStore.getState().setShowFileBrowser(false);
  }, [send]);

  const handleSendPrompt = useCallback((text: string) => {
    // Add user message to chat
    useChatStore.getState().addMessage({
      id: genMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    // Send to backend
    send({ type: 'send_prompt', payload: { text } });
    useChatStore.getState().setIsAgentThinking(true);
    useChatStore.getState().clearThinkingContent();
  }, [send]);

  const handleSlashCommand = useCallback((commandId: string) => {
    const store = useChatStore.getState();

    // 查找命令定义
    const cmdDef = SLASH_COMMANDS.find((c) => c.id === commandId);

    // 如果是 agent scope 的命令，透传给 Gemini CLI
    if (cmdDef?.scope === 'agent') {
      if (agentStatus !== 'running') {
        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: `⚠️ Agent is not running. Start an agent first to use ${cmdDef.name}.`,
          timestamp: Date.now(),
        });
        return;
      }
      // 把 slash command 作为 prompt 发送给 agent
      handleSendPrompt(cmdDef.name);
      return;
    }

    // 前端本地处理的命令
    switch (commandId) {
      case 'help': {
        const localCmds = SLASH_COMMANDS.filter((c) => c.scope === 'local');
        const agentCmds = SLASH_COMMANDS.filter((c) => c.scope === 'agent');

        // 按 group 分组
        const agentGroups = new Map<string, typeof agentCmds>();
        for (const cmd of agentCmds) {
          const group = agentGroups.get(cmd.group) || [];
          group.push(cmd);
          agentGroups.set(cmd.group, group);
        }

        let helpText = '📖 **Available Commands**\n\n';
        helpText += '**App Commands** (handled locally):\n';
        for (const cmd of localCmds) {
          helpText += `  \`${cmd.name}\` — ${cmd.description}\n`;
        }
        helpText += '\n**Gemini CLI Commands** (sent to agent):\n';
        for (const [group, cmds] of agentGroups) {
          helpText += `\n*${group}:*\n`;
          for (const cmd of cmds) {
            helpText += `  \`${cmd.name}\` — ${cmd.description}\n`;
          }
        }

        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: helpText,
          timestamp: Date.now(),
        });
        break;
      }
      case 'clear': {
        store.clearMessages();
        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: '🧹 Chat history cleared.',
          timestamp: Date.now(),
        });
        break;
      }
      case 'files': {
        if (agentStatus === 'running' && activeWorkDir) {
          store.setShowFileBrowser(!showFileBrowser);
        } else {
          store.addMessage({
            id: genMessageId(),
            role: 'system',
            content: '⚠️ No agent running. Start an agent first to browse files.',
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'history': {
        const sessions = store.sessions;
        if (sessions.length === 0) {
          store.addMessage({
            id: genMessageId(),
            role: 'system',
            content: '🕐 No session history found.',
            timestamp: Date.now(),
          });
        } else {
          const lines = sessions.map((s, i) => {
            const date = new Date(s.createdAt).toLocaleString();
            const msgCount = s.messages.length;
            const active = s.id === store.activeSessionId ? ' ← current' : '';
            return `${i + 1}. **${s.name}** (${msgCount} msgs, ${date})${active}`;
          });
          store.addMessage({
            id: genMessageId(),
            role: 'system',
            content: `🕐 Session History (${sessions.length}):\n${lines.join('\n')}\n\nUse the session switcher in the top bar to restore a session.`,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'status': {
        const agent = store.agents.find((a) => a.id === store.activeAgentId);
        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: `📊 Status:\n• Agent: ${agent?.name || 'None'}\n• Status: ${store.agentStatus}\n• Work Dir: ${store.activeWorkDir || 'N/A'}\n• WebSocket: ${store.wsStatus}\n• Sessions: ${store.sessions.length}`,
          timestamp: Date.now(),
        });
        break;
      }
      case 'stop': {
        if (activeAgentId && agentStatus === 'running') {
          handleStopAgent(activeAgentId);
        } else {
          store.addMessage({
            id: genMessageId(),
            role: 'system',
            content: '⚠️ No agent running to stop.',
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'restart': {
        if (activeAgentId && activeWorkDir) {
          handleStopAgent(activeAgentId);
          // Small delay then restart
          setTimeout(() => {
            handleStartAgent(activeAgentId, activeWorkDir);
          }, 1000);
        } else {
          store.addMessage({
            id: genMessageId(),
            role: 'system',
            content: '⚠️ No agent to restart.',
            timestamp: Date.now(),
          });
        }
        break;
      }
      default: {
        store.addMessage({
          id: genMessageId(),
          role: 'system',
          content: `⚠️ Unknown command: ${commandId}`,
          timestamp: Date.now(),
        });
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

  const isAgentRunning = agentStatus === 'running';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-surface-0)' }}>
      <TopBar
        onStartAgent={handleStartAgent}
        onStartAgentWithResume={handleStartAgentWithResume}
        onStopAgent={handleStopAgent}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main chat area */}
        <div className="flex flex-col flex-1 min-w-0">
          <ChatView onPermissionRespond={handlePermissionRespond} />
          <InputBar
            onSend={handleSendPrompt}
            onSlashCommand={handleSlashCommand}
            disabled={!isAgentRunning}
            isThinking={isThinking}
            onCancel={handleCancel}
          />
        </div>

        {/* File browser — desktop: sidebar, mobile: full-screen overlay */}
        {showFileBrowser && activeWorkDir && (
          <>
            {/* Desktop sidebar */}
            <div className="hidden sm:block w-72 flex-shrink-0">
              <FileBrowser
                rootPath={activeWorkDir}
                onClose={() => useChatStore.getState().setShowFileBrowser(false)}
              />
            </div>
            {/* Mobile full-screen overlay */}
            <div className="sm:hidden mobile-panel animate-slide-up" style={{ background: 'var(--color-surface-0)' }}>
              <FileBrowser
                rootPath={activeWorkDir}
                onClose={() => useChatStore.getState().setShowFileBrowser(false)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
