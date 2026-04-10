import { useRef, useEffect, useMemo } from 'react';
import { useChatStore, type ToolCallState } from '../../stores/chatStore';
import type { ChatMessage } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import ThinkingBlock from './ThinkingBlock';
import ToolCallCard from '../Cards/ToolCallCard';
import CommandConfirmCard from '../Cards/CommandConfirmCard';
import DiffViewerCard from '../Cards/DiffViewerCard';

interface Props {
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
}

/**
 * 时间线条目类型：
 * - message: 聊天消息（user/agent/system）
 * - toolcall: 进行中或已完成的 tool call（含 diff）
 */
type TimelineEntry =
  | { kind: 'message'; data: ChatMessage; timestamp: number }
  | { kind: 'toolcall'; data: ToolCallState; timestamp: number };

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

  // 构建统一的时间线：按 timestamp 排序，消息和 tool calls 交错显示
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    // 添加所有消息
    for (const msg of messages) {
      entries.push({ kind: 'message', data: msg, timestamp: msg.timestamp });
    }

    // 添加已完成且有 diff 的 tool calls
    for (const tc of toolCalls.values()) {
      if (tc.status === 'completed' && tc.content?.some((c) => c.type === 'diff')) {
        entries.push({ kind: 'toolcall', data: tc, timestamp: tc.createdAt || 0 });
      }
    }

    // 按时间戳排序，保持稳定顺序
    entries.sort((a, b) => a.timestamp - b.timestamp);

    return entries;
  }, [messages, toolCalls]);

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

      {/* 统一时间线：消息和已完成 diff 交错显示 */}
      {timeline.map((entry) => {
        if (entry.kind === 'message') {
          const msgIndex = messages.indexOf(entry.data);
          return (
            <MessageBubble key={entry.data.id} message={entry.data} index={msgIndex >= 0 ? msgIndex : 0} />
          );
        }
        if (entry.kind === 'toolcall') {
          return entry.data.content?.filter((c) => c.type === 'diff').map((c, i) => (
            <DiffViewerCard key={`${entry.data.toolCallId}-diff-${i}`} content={c} />
          ));
        }
        return null;
      })}

      {/* Thinking block — shows agent's reasoning process in real-time */}
      {(isThinking || thinkingContent) && (
        <ThinkingBlock content={thinkingContent} isActive={isThinking} />
      )}

      {/* Active tool calls (pending / in_progress) — 始终显示在底部 */}
      {Array.from(toolCalls.values())
        .filter((tc) => tc.status === 'pending' || tc.status === 'in_progress')
        .map((tc) => (
          <ToolCallCard key={tc.toolCallId} toolCall={tc} />
        ))}

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
