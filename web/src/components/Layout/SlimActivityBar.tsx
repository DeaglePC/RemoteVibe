import { useUIStore } from '../../stores/uiStore';

/**
 * 桌面端精简版 ActivityBar（方案 §4.2）。
 *
 * 只包含 2 个图标，和手机 TabBar 一一对应：
 *  - 💬 会话  → 切 Sidebar 到项目手风琴模式
 *  - ⚙️ 设置  → 切 Sidebar 到设置导航模式
 *
 * 行为：点击切换 sidebarMode；若 Sidebar 已折叠则同时展开。
 * 之所以内联在 DesktopShell 目录下独立一个组件而不复用
 * 老的 `components/Layout/ActivityBar.tsx`，是为了让新旧双壳（classic / pwa）
 * 互不影响，各自独立维护交互。
 */
export default function SlimActivityBar() {
  const mode = useUIStore((s) => s.sidebarMode);
  const setSidebarMode = useUIStore((s) => s.setSidebarMode);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  const handlePick = (next: 'sessions' | 'settings') => {
    if (collapsed) {
      setCollapsed(false);
      setSidebarMode(next);
      return;
    }
    if (mode === next) {
      // 已在此模式，点击等同折叠/展开 Sidebar
      setCollapsed(true);
    } else {
      setSidebarMode(next);
    }
  };

  const items: Array<{ id: 'sessions' | 'settings'; icon: string; label: string }> = [
    { id: 'sessions', icon: '💬', label: '会话' },
    { id: 'settings', icon: '⚙️', label: '设置' },
  ];

  return (
    <nav
      aria-label="ActivityBar"
      style={{
        width: 'var(--layout-activity-bar, 48px)',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 0',
        background: 'var(--color-surface-0)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {items.map((it) => {
        const active = !collapsed && mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => handlePick(it.id)}
            title={it.label}
            aria-label={it.label}
            aria-pressed={active}
            style={{
              position: 'relative',
              appearance: 'none',
              width: 36,
              height: 36,
              border: 0,
              borderRadius: 'var(--radius-md, 8px)',
              background: active ? 'var(--color-surface-2)' : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              transition: 'background var(--duration-fast, 120ms) var(--ease-out)',
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
            <span aria-hidden>{it.icon}</span>
            {active && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: -8,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  borderRadius: 2,
                  background: 'var(--color-accent-500)',
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
