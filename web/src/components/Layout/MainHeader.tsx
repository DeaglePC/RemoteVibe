import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import HeaderMetrics from './HeaderMetrics';

/**
 * 主区 PageHeader（方案 §4.4）。
 *
 * 44px 高，位于聊天主区顶部，内容：
 *  - 左：当前会话名 + workDir 的 tooltip
 *  - 右：📂 文件 / ⋯ 更多
 *
 * 不包含返回按钮（PC 端无"返回首页"概念，Q3.5=A）。
 * 手机端有独立的 `MobilePageHeader`，不复用本组件。
 */
export default function MainHeader() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const session = sessions.find((s) => s.id === activeSessionId) || null;

  const rightPaneOpen = useUIStore((s) => s.rightPaneOpen);
  const setRightPaneOpen = useUIStore((s) => s.setRightPaneOpen);
  const setRightPaneContent = useUIStore((s) => s.setRightPaneContent);

  const handleToggleFiles = useCallback(() => {
    if (rightPaneOpen) {
      setRightPaneOpen(false);
    } else {
      setRightPaneContent('files');
      setRightPaneOpen(true);
    }
  }, [rightPaneOpen, setRightPaneContent, setRightPaneOpen]);

  return (
    <header
      style={{
        height: 'var(--layout-page-header, 44px)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-0)',
      }}
    >
      {/* 会话名 */}
      <div
        title={session?.workDir || ''}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {session?.name || '未选择会话'}
        </span>
        {session?.workDir && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {session.workDir}
          </span>
        )}
      </div>

      {/* Model + Context 指标（从底部状态栏上提）*/}
      <HeaderMetrics />

      {/* 文件按钮 */}
      <button
        type="button"
        onClick={handleToggleFiles}
        title={rightPaneOpen ? '关闭文件面板' : '打开文件面板'}
        aria-pressed={rightPaneOpen}
        disabled={!session?.workDir}
        style={{
          appearance: 'none',
          width: 28,
          height: 28,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-sm, 6px)',
          border: '1px solid var(--color-border)',
          background: rightPaneOpen ? 'var(--color-surface-2)' : 'transparent',
          color: session?.workDir ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          cursor: session?.workDir ? 'pointer' : 'not-allowed',
          opacity: session?.workDir ? 1 : 0.5,
          fontSize: 14,
        }}
      >
        📂
      </button>
    </header>
  );
}
