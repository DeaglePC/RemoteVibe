import { useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useChatStore, genMessageId } from './stores/chatStore';
import TopBar from './components/Layout/TopBar';
import ChatView from './components/ChatView/ChatView';
import InputBar from './components/ChatView/InputBar';

export default function App() {
  const { send } = useWebSocket();
  const agentStatus = useChatStore((s) => s.agentStatus);
  const isThinking = useChatStore((s) => s.isAgentThinking);

  const handleStartAgent = useCallback((agentId: string) => {
    send({ type: 'start_agent', payload: { agentId } });
  }, [send]);

  const handleStopAgent = useCallback((agentId: string) => {
    send({ type: 'stop_agent', payload: { agentId } });
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
  }, [send]);

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
        onStopAgent={handleStopAgent}
      />
      <ChatView onPermissionRespond={handlePermissionRespond} />
      <InputBar
        onSend={handleSendPrompt}
        disabled={!isAgentRunning}
        isThinking={isThinking}
        onCancel={handleCancel}
      />
    </div>
  );
}
