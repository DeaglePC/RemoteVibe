import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChatStatusViewModel } from './chatStatusBarModel';

vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => {
    throw new Error('useChatStore should not be called in presentational tests');
  },
}));

import { ChatStatusBarContent } from './ChatStatusBar';

const viewModel: ChatStatusViewModel = {
  agent: { label: 'Agent', value: 'Gemini CLI · CLI' },
  activity: { label: 'Activity', value: 'Responding' },
  worktree: { label: 'Worktree', value: '/Users/patrickdu/github/RemoteVibe' },
  model: { label: 'Model', value: 'gemini-2.5-pro' },
  context: { label: 'Context', value: '128.4k used · remaining --' },
  toolCalls: { label: 'Tools', value: '3 total · 1 active' },
  permissions: { label: 'Approvals', value: '1 pending' },
  duration: { label: 'Last turn', value: '18.3s' },
  connection: { label: 'Connection', value: 'WS connected' },
  reconnectAction: {
    visible: false,
    enabled: false,
    label: 'Reconnect',
    title: 'No restorable session available',
  },
};

describe('ChatStatusBarContent', () => {
  it('renders the chat runtime metrics as an independent footer bar', () => {
    const html = renderToStaticMarkup(<ChatStatusBarContent viewModel={viewModel} />);

    expect(html).toContain('Agent');
    expect(html).toContain('Gemini CLI · CLI');
    expect(html).toContain('Worktree');
    expect(html).toContain('/Users/patrickdu/github/RemoteVibe');
    expect(html).toContain('128.4k used · remaining --');
    expect(html).toContain('WS connected');
  });

  it('shows a reconnect action on the right when the current session can be restored', () => {
    const html = renderToStaticMarkup(
      <ChatStatusBarContent
        viewModel={{
          ...viewModel,
          reconnectAction: {
            visible: true,
            enabled: true,
            label: 'Reconnect',
            title: 'Reconnect current session',
          },
        }}
      />,
    );

    expect(html).toContain('Reconnect');
  });
});
