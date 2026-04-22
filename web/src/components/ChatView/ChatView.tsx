import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import ThinkingBlock from './ThinkingBlock';
import InlineToolCall from './InlineToolCall';
import CommandConfirmCard from '../Cards/CommandConfirmCard';
import { buildChatTimeline } from './timelineModel';
import { buildToolActivityItem } from './toolActivityModel';

interface Props {
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
}

/** 距离底部小于该像素阈值时认为用户仍在跟读最新内容，才执行自动滚动 */
const STICK_TO_BOTTOM_THRESHOLD_PX = 120;

/**
 * ChatView 负责渲染消息时间线 — 工具调用会内嵌到紧前的 Agent 气泡之后。
 *
 * 滚动策略（避免流式输出时抖动，参考 Cursor / ChatGPT）：
 * 1. 用户主动向上滚动超过阈值后，不再自动拽回底部。
 * 2. 流式 chunk（content 增长）期间使用 instant 滚动，防止 smooth 动画互相打断。
 * 3. 新消息到达或工具调用到达时用 smooth 滚动，提供更自然的过渡。
 */
export default function ChatView({ onPermissionRespond }: Props) {
  const messages = useChatStore((state) => state.messages);
  const toolCalls = useChatStore((state) => state.toolCalls);
  const pendingPermissions = useChatStore((state) => state.pendingPermissions);
  const agentStatus = useChatStore((state) => state.agentStatus);
  const isThinking = useChatStore((state) => state.isAgentThinking);
  const thinkingContent = useChatStore((state) => state.thinkingContent);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 是否允许自动滚动到底部：用户接近底部时为 true；往上滚动查看历史时为 false
  const stickToBottomRef = useRef(true);
  // 上一次看到的"计数"指纹，用于区分"新结构（新消息/新工具）"与"流式追加"
  const previousCountsRef = useRef({ messages: 0, toolCalls: 0, permissions: 0 });
  // 待处理滚动请求的 RAF id，避免一帧内触发多次 scrollIntoView
  const scrollRafRef = useRef<number | null>(null);

  // 监听用户滚动行为：判断是否仍粘在底部附近
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const updateStickiness = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceToBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
    };

    updateStickiness();
    container.addEventListener('scroll', updateStickiness, { passive: true });
    return () => {
      container.removeEventListener('scroll', updateStickiness);
    };
  }, []);

  // 自动滚动到底部：布局同步阶段执行，避免动画被随后的 reflow 打断；节流到每帧最多一次
  useLayoutEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    const messageCount = messages.length;
    const toolCallCount = toolCalls.size;
    const permissionCount = pendingPermissions.length;
    const previous = previousCountsRef.current;

    // 新的消息 / 工具调用 / 权限请求到达 → 视为结构变化，用 smooth 提供过渡
    // 仅 content 变长（流式 chunk）→ 用 instant 瞬时贴底，避免 smooth 动画不停被打断造成跳动
    const isStructuralChange = messageCount !== previous.messages
      || toolCallCount !== previous.toolCalls
      || permissionCount !== previous.permissions;

    previousCountsRef.current = {
      messages: messageCount,
      toolCalls: toolCallCount,
      permissions: permissionCount,
    };

    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollRef.current;
      const target = bottomRef.current;
      if (!container || !target) {
        return;
      }
      if (isStructuralChange) {
        target.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        // 直接设置 scrollTop 比 scrollIntoView({behavior:'auto'}) 更可控，也不会触发隐式动画
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [messages, toolCalls, pendingPermissions, thinkingContent]);

  // 卸载时清理 RAF
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const isIdle = agentStatus !== 'running';

  const timeline = useMemo(() => {
    return buildChatTimeline(messages, toolCalls);
  }, [messages, toolCalls]);

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
        {timeline.map((entry, index) => {
          if (entry.kind === 'message') {
            return (
              <MessageBubble
                key={entry.message.id}
                message={entry.message}
                index={index}
                toolCalls={entry.toolCalls}
                pendingPermissions={pendingPermissions}
              />
            );
          }

          // orphan_tool：没有紧前 Agent 气泡的工具调用，按整行内联渲染
          return (
            <div key={`orphan-${entry.toolCall.toolCallId}`} className="py-0.5">
              <InlineToolCall item={buildToolActivityItem(entry.toolCall, pendingPermissions)} />
            </div>
          );
        })}
      </div>

      {(isThinking || thinkingContent) && (
        <ThinkingBlock content={thinkingContent} isActive={isThinking} />
      )}

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
