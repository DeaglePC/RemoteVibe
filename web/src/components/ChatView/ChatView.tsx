import { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import ThinkingBlock from './ThinkingBlock';
import ToolActivityPanel from './ToolActivityPanel';
import CommandConfirmCard from '../Cards/CommandConfirmCard';

interface Props {
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
}

/**
 * ChatView 负责渲染消息时间线，以及独立的工具活动与授权卡片区域。
 */
export default function ChatView({ onPermissionRespond }: Props) {
  const messages = useChatStore((state) => state.messages);
  const pendingPermissions = useChatStore((state) => state.pendingPermissions);
  const agentStatus = useChatStore((state) => state.agentStatus);
  const isThinking = useChatStore((state) => state.isAgentThinking);
  const thinkingContent = useChatStore((state) => state.thinkingContent);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingPermissions, thinkingContent]);

  const isIdle = agentStatus !== 'running';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 sm:py-6">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <div className="text-5xl mb-4">🐾</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            BaoMiHua Agent Gateway
          </h2>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {isIdle
              ? 'Select and start an agent to begin your coding session.'
              : 'Agent is ready. Type a message to start coding.'}
          </p>
          {isIdle && (
            <div
              className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span className="text-lg">👆</span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Click "Launch" in the top bar to start
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {messages.map((message, index) => (
          <MessageBubble key={message.id} message={message} index={index} />
        ))}
      </div>

      {(isThinking || thinkingContent) && (
        <ThinkingBlock content={thinkingContent} isActive={isThinking} />
      )}

      <ToolActivityPanel />

      {pendingPermissions.map((request) => (
        <CommandConfirmCard
          key={String(request.requestId)}
          request={request}
          onRespond={onPermissionRespond}
        />
      ))}

      <div ref={bottomRef} className="h-2" />
    </div>
  );
}
