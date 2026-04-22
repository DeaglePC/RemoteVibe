import { describe, expect, it } from 'vitest';
import { buildChatTimeline } from './timelineModel';
import type { ChatMessage, ToolCallState } from '../../stores/chatStore';

function createMessage(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'timestamp'>): ChatMessage {
  return {
    id: partial.id,
    role: partial.role,
    content: partial.content ?? '',
    timestamp: partial.timestamp,
  };
}

function createToolCall(partial: Partial<ToolCallState> & Pick<ToolCallState, 'toolCallId' | 'createdAt'>): ToolCallState {
  return {
    toolCallId: partial.toolCallId,
    title: partial.title ?? 'Tool',
    kind: partial.kind ?? 'read',
    status: partial.status ?? 'completed',
    createdAt: partial.createdAt,
    content: partial.content,
    locations: partial.locations,
  };
}

describe('buildChatTimeline', () => {
  it('attaches tool calls to the preceding agent bubble in chronological order', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', timestamp: 100 }),
      createMessage({ id: 'a1', role: 'agent', timestamp: 150 }),
      createMessage({ id: 'a2', role: 'agent', timestamp: 400 }),
    ];
    const toolCalls = new Map<string, ToolCallState>([
      ['t1', createToolCall({ toolCallId: 't1', createdAt: 200 })],
      ['t2', createToolCall({ toolCallId: 't2', createdAt: 250 })],
      ['t3', createToolCall({ toolCallId: 't3', createdAt: 500 })],
    ]);

    const timeline = buildChatTimeline(messages, toolCalls);

    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toMatchObject({ kind: 'message', message: { id: 'u1' } });
    expect(timeline[1]).toMatchObject({ kind: 'message', message: { id: 'a1' } });
    expect(timeline[2]).toMatchObject({ kind: 'message', message: { id: 'a2' } });

    const first = timeline[1];
    const second = timeline[2];
    if (first.kind !== 'message' || second.kind !== 'message') {
      throw new Error('expected message entries');
    }
    expect(first.toolCalls.map((tc) => tc.toolCallId)).toEqual(['t1', 't2']);
    expect(second.toolCalls.map((tc) => tc.toolCallId)).toEqual(['t3']);
  });

  it('renders tool calls preceding any message as orphan entries', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', timestamp: 500 }),
    ];
    const toolCalls = new Map<string, ToolCallState>([
      ['t1', createToolCall({ toolCallId: 't1', createdAt: 100 })],
    ]);

    const timeline = buildChatTimeline(messages, toolCalls);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ kind: 'orphan_tool', toolCall: { toolCallId: 't1' } });
    expect(timeline[1]).toMatchObject({ kind: 'message', message: { id: 'u1' } });
  });

  it('treats tool calls arriving after a user message but before next agent as orphans', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'a1', role: 'agent', timestamp: 100 }),
      createMessage({ id: 'u1', role: 'user', timestamp: 300 }),
    ];
    const toolCalls = new Map<string, ToolCallState>([
      // 该工具调用在 user 消息之后、没有新 agent 气泡前到达，不应挂到前面的 agent 气泡
      ['t1', createToolCall({ toolCallId: 't1', createdAt: 400 })],
    ]);

    const timeline = buildChatTimeline(messages, toolCalls);

    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toMatchObject({ kind: 'message', message: { id: 'a1' } });
    expect(timeline[1]).toMatchObject({ kind: 'message', message: { id: 'u1' } });
    expect(timeline[2]).toMatchObject({ kind: 'orphan_tool', toolCall: { toolCallId: 't1' } });
  });

  it('falls back legacy tool calls without createdAt to the last agent bubble', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'u1', role: 'user', timestamp: 100 }),
      createMessage({ id: 'a1', role: 'agent', timestamp: 200 }),
    ];
    const toolCalls = new Map<string, ToolCallState>([
      ['legacy', createToolCall({ toolCallId: 'legacy', createdAt: Number.NaN })],
    ]);

    const timeline = buildChatTimeline(messages, toolCalls);

    expect(timeline).toHaveLength(2);
    const last = timeline[1];
    if (last.kind !== 'message') {
      throw new Error('expected message entry');
    }
    expect(last.toolCalls.map((tc) => tc.toolCallId)).toEqual(['legacy']);
  });

  it('sorts tool calls by createdAt within the same agent bubble', () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'a1', role: 'agent', timestamp: 100 }),
    ];
    // 插入顺序与时间顺序不一致，验证排序生效
    const toolCalls = new Map<string, ToolCallState>([
      ['t-later', createToolCall({ toolCallId: 't-later', createdAt: 300 })],
      ['t-early', createToolCall({ toolCallId: 't-early', createdAt: 150 })],
      ['t-mid', createToolCall({ toolCallId: 't-mid', createdAt: 200 })],
    ]);

    const timeline = buildChatTimeline(messages, toolCalls);
    expect(timeline).toHaveLength(1);
    const first = timeline[0];
    if (first.kind !== 'message') {
      throw new Error('expected message entry');
    }
    expect(first.toolCalls.map((tc) => tc.toolCallId)).toEqual(['t-early', 't-mid', 't-later']);
  });
});
