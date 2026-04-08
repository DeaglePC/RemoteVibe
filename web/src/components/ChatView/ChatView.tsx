import { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import ThinkingBlock from './ThinkingBlock';
import ToolCallCard from '../Cards/ToolCallCard';
import CommandConfirmCard from '../Cards/CommandConfirmCard';
import DiffViewerCard from '../Cards/DiffViewerCard';

interface Props {
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
}

export default function ChatView({ onPermissionRespond }: Props) {
  const messages = useChatStore((s) => s.messages);
  const toolCalls = useChatStore((s) => s.toolCalls);
  const pendingPermissions = useChatStore((s) => s.pendingPermissions);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const isThinking = useChatStore((s) => s.isAgentThinking);
  const thinkingContent = useChatStore((s) => s.thinkingContent);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls, pendingPermissions, thinkingContent]);

  const isIdle = agentStatus !== 'running';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 sm:py-4">
      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-5xl mb-4">🐾</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            BaoMiHua Agent Gateway
          </h2>
          <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isIdle
              ? 'Select and start an agent to begin your coding session.'
              : 'Agent is ready. Type a message to start coding.'}
          </p>
          {isIdle && (
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <span className="text-lg">👆</span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Click "Launch" in the top bar to start
              </span>
            </div>
          )}
        </div>
      )}

      {/* Message list */}
      {messages.map((msg, i) => (
        <MessageBubble key={msg.id} message={msg} index={i} />
      ))}

      {/* Thinking block — shows agent's reasoning process in real-time */}
      {(isThinking || thinkingContent) && (
        <ThinkingBlock content={thinkingContent} isActive={isThinking} />
      )}

      {/* Active tool calls */}
      {Array.from(toolCalls.values())
        .filter((tc) => tc.status === 'pending' || tc.status === 'in_progress')
        .map((tc) => (
          <ToolCallCard key={tc.toolCallId} toolCall={tc} />
        ))}

      {/* Completed tool calls with diffs */}
      {Array.from(toolCalls.values())
        .filter((tc) => tc.status === 'completed' && tc.content?.some((c) => c.type === 'diff'))
        .map((tc) =>
          tc.content?.filter((c) => c.type === 'diff').map((c, i) => (
            <DiffViewerCard key={`${tc.toolCallId}-diff-${i}`} content={c} />
          ))
        )}

      {/* Pending permission requests */}
      {pendingPermissions.map((req) => (
        <CommandConfirmCard
          key={String(req.requestId)}
          request={req}
          onRespond={onPermissionRespond}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
