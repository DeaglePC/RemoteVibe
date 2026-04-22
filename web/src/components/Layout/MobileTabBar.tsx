import { useUIStore } from '../../stores/uiStore';

/**
 * 手机端底部 TabBar（方案 §5.2 / §5.6）。
 *
 * 只包含 2 个 Tab：💬 会话 / ⚙️ 设置（Q3=双 Tab 拍板）。
 * - 本组件仅在 L1 页面显示，栈非空时由 `MobileShell` 负责隐藏。
 * - 底部预留 `env(safe-area-inset-bottom)` 以贴合 iPhone 底边。
 */
export default function MobileTabBar() {
  const tab = useUIStore((s) => s.mobileTab);
  const setTab = useUIStore((s) => s.setMobileTab);

  const items: Array<{ id: 'sessions' | 'settings'; icon: string; label: string }> = [
    { id: 'sessions', icon: '💬', label: '会话' },
    { id: 'settings', icon: '⚙️', label: '设置' },
  ];

  return (
    <nav
      aria-label="MobileTabBar"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        height: 56,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        background: 'var(--color-surface-0)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setTab(it.id)}
            aria-label={it.label}
            aria-pressed={active}
            style={{
              flex: 1,
              appearance: 'none',
              border: 0,
              background: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              color: active ? 'var(--color-accent-500)' : 'var(--color-text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              paddingTop: 6,
            }}
          >
            <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>
              {it.icon}
            </span>
            <span style={{ fontWeight: active ? 600 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
