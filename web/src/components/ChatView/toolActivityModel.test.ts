import { describe, expect, it } from 'vitest';
import { buildToolActivityViewModel } from './toolActivityModel';
import type { ToolCallState } from '../../stores/chatStore';

function createToolCall(partial: Partial<ToolCallState>): ToolCallState {
  return {
    toolCallId: partial.toolCallId || 'tool-1',
    title: partial.title || 'Read file',
    kind: partial.kind || 'read',
    status: partial.status || 'completed',
    createdAt: partial.createdAt ?? 0,
    content: partial.content,
    locations: partial.locations,
  };
}

describe('buildToolActivityViewModel', () => {
  it('sorts tool calls strictly by createdAt instead of guessing from the tool title', () => {
    const toolCalls = new Map<string, ToolCallState>([
      ['later-read', createToolCall({ toolCallId: 'later-read', title: 'Read file', status: 'completed', createdAt: 200, content: [{ type: 'text', text: 'Read completed later' }] })],
      ['earlier-write', createToolCall({ toolCallId: 'earlier-write', title: 'Write file', kind: 'edit', status: 'in_progress', createdAt: 100, content: [{ type: 'diff', path: '/tmp/config.ts', oldText: 'a', newText: 'b' }] })],
    ]);

    const viewModel = buildToolActivityViewModel(toolCalls, []);

    expect(viewModel.items).toHaveLength(2);
    expect(viewModel.items[0].toolCallId).toBe('earlier-write');
    expect(viewModel.items[1].toolCallId).toBe('later-read');
    expect(viewModel.summary.completedCount).toBe(1);
    expect(viewModel.summary.activeCount).toBe(1);
  });

  it('keeps valid chronological items ahead of invalid timestamps and preserves arrival order for ties', () => {
    const toolCalls = new Map<string, ToolCallState>([
      ['invalid-first', createToolCall({ toolCallId: 'invalid-first', title: 'Search project', kind: 'search', createdAt: Number.NaN })],
      ['valid-first', createToolCall({ toolCallId: 'valid-first', title: 'Read file', createdAt: 100 })],
      ['valid-second', createToolCall({ toolCallId: 'valid-second', title: 'Write file', kind: 'edit', createdAt: 100 })],
      ['invalid-second', createToolCall({ toolCallId: 'invalid-second', title: 'Run command', kind: 'execute', createdAt: Number.NaN })],
    ]);

    const viewModel = buildToolActivityViewModel(toolCalls, []);

    expect(viewModel.items.map((item) => item.toolCallId)).toEqual([
      'valid-first',
      'valid-second',
      'invalid-first',
      'invalid-second',
    ]);
  });

  it('attaches permission badge counts to the related tool call', () => {
    const toolCalls = new Map<string, ToolCallState>([
      ['write', createToolCall({ toolCallId: 'write', title: 'Write file', kind: 'edit', status: 'pending', createdAt: 50 })],
    ]);

    const viewModel = buildToolActivityViewModel(toolCalls, [
      {
        requestId: 'req-1',
        toolCallId: 'write',
        options: [],
      },
      {
        requestId: 'req-2',
        toolCallId: 'write',
        options: [],
      },
    ]);

    expect(viewModel.items[0].pendingPermissionCount).toBe(2);
    expect(viewModel.summary.permissionCount).toBe(2);
  });
});
