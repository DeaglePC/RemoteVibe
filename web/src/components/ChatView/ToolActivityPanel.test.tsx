import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ToolActivityViewModel } from './toolActivityModel';

vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => {
    throw new Error('useChatStore should not be called in presentational tests');
  },
}));

import { ToolActivityPanelContent } from './ToolActivityPanel';

const viewModel: ToolActivityViewModel = {
  summary: {
    totalCount: 2,
    activeCount: 2,
    completedCount: 0,
    failedCount: 0,
    permissionCount: 2,
  },
  items: [
    {
      toolCallId: 'search-1',
      title: 'Search project',
      kind: 'search',
      status: 'in_progress',
      createdAt: 100,
      content: [
        { type: 'text', text: 'Found 8 files' },
      ],
      locations: [],
      pendingPermissionCount: 0,
      hasDiff: false,
      hasTerminal: false,
      hasText: true,
    },
    {
      toolCallId: 'edit-1',
      title: 'Edit config file',
      kind: 'edit',
      status: 'in_progress',
      createdAt: 200,
      content: [
        { type: 'diff', path: '/tmp/config.ts', oldText: 'a', newText: 'b' },
      ],
      locations: [],
      pendingPermissionCount: 2,
      hasDiff: true,
      hasTerminal: false,
      hasText: false,
    },
  ],
};

describe('ToolActivityPanelContent', () => {
  it('renders tool activity outside the chat bubble timeline with summary counts', () => {
    const html = renderToStaticMarkup(<ToolActivityPanelContent viewModel={viewModel} />);

    expect(html).toContain('Tool activity');
    expect(html).toContain('2 total');
    expect(html).toContain('2 active');
    expect(html).toContain('2 approvals pending');
    expect(html).toContain('Edit config file');
    expect(html).toContain('Search project');
    expect(html).toContain('Found 8 files');
    expect(html.indexOf('Search project')).toBeLessThan(html.indexOf('Edit config file'));
  });
});

