import { useCallback } from 'react';
import type { Session } from '../../stores/chatStore';
import { useChatStore } from '../../stores/chatStore';
import { useIsMobile } from '../../hooks/useBreakpoint';

/**
 * 单个会话条目。
 * 设计参考方案 §4.3 模式 A：
 *  - 激活会话左侧高亮条 2px + 小圆点
 *  - hover 态背景浅提亮
 *  - 文案：会话名 + 相对时间
 */
interface Props {
  session: Session;
  /** 是否为当前激活会话 */
  active: boolean;
  /** 是否存在持久化版本（即关闭后可恢复）。仅用于弱化视觉 */
  isHistory?: boolean;
  /**
   * 点击后（无论是 switchSession 还是 restoreSession）的额外回调，
   * 主要供手机端 push 到聊天页使用。
   * PC 端不传则为 no-op，原有行为不受影响。
   */
  onAfterSelect?: (sessionId: string) => void;
}

/** 把 timestamp 格式化为 "刚刚 / N 分钟前 / N 小时前 / N 天前 / YYYY-MM-DD" */
function formatRelativeTime(ts: number): string {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function SessionItem({ session, active, isHistory = false, onAfterSelect }: Props) {
  const isMobile = useIsMobile();

  const handleClick = useCallback(() => {
    const store = useChatStore.getState();
    // 当前已激活时不重复切换，但仍触发 onAfterSelect（手机端 "点同会话 仍 push” 的诉求）
    if (!active) {
      if (isHistory) {
        store.restoreSession(session.id);
      } else {
        store.switchSession(session.id);
      }
    }
    onAfterSelect?.(session.id);
  }, [session.id, active, isHistory, onAfterSelect]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={session.name}
      style={{
        appearance: 'none',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 10 : 8,
        // 移动端保证 >= 44px 触控热区
        minHeight: isMobile ? 48 : undefined,
        padding: isMobile ? '8px 10px 8px 12px' : '6px 10px 6px 12px',
        borderRadius: 'var(--radius-sm, 8px)',
        border: 0,
        background: active ? 'var(--color-surface-2)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        textAlign: 'left',
        cursor: active ? 'default' : 'pointer',
        fontSize: isMobile ? 15 : 13,
        lineHeight: 1.3,
        position: 'relative',
        opacity: isHistory && !active ? 0.78 : 1,
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-1)';
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* 左侧激活高亮条 */}
      {active && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            borderRadius: 2,
            background: 'var(--color-accent-500)',
          }}
        />
      )}

      {/* 状态圆点 */}
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: isMobile ? 8 : 6,
          height: isMobile ? 8 : 6,
          borderRadius: '50%',
          flexShrink: 0,
          background: active ? 'var(--color-accent-500)' : 'var(--color-text-muted)',
        }}
      />

      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {session.name || '(未命名)'}
      </span>

      <span
        style={{
          fontSize: isMobile ? 12 : 11,
          color: 'var(--color-text-muted)',
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(session.createdAt)}
      </span>
    </button>
  );
}
