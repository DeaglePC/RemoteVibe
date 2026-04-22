import { useUIStore } from '../../stores/uiStore';
import ThemeSettings from './Pages/ThemeSettings';
import BackendManagement from './Pages/BackendManagement';
import BehaviorSettings from './Pages/BehaviorSettings';
import AboutPage from './Pages/AboutPage';

/**
 * 设置页的"路由器"。
 *
 * 设计：
 *  - 顶部：列出所有设置入口（iOS 分组设置感），点击展开对应子页
 *  - 中部：展示当前选中子页内容
 *  - 未选中子页时，只显示入口列表
 *
 * 当前子页由 `uiStore.activeSettingsPage` 控制，双端（Desktop Sidebar / Mobile Page）共用。
 */

interface EntryDef {
  id: NonNullable<ReturnType<typeof useUIStore.getState>['activeSettingsPage']>;
  icon: string;
  title: string;
  summary: string;
}

const ENTRIES: EntryDef[] = [
  { id: 'theme', icon: '🎨', title: '主题', summary: 'auto / 浅色 / 深色' },
  { id: 'backend', icon: '🖥️', title: '后端机器', summary: '多机器管理' },
  { id: 'behavior', icon: '⚙️', title: '行为', summary: '自动恢复等选项' },
  { id: 'about', icon: 'ℹ️', title: '关于', summary: '版本与仓库' },
];

function SettingsEntry(props: { entry: EntryDef; active: boolean; onClick: () => void }) {
  const { entry, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm, 6px)',
        border: 0,
        background: active ? 'var(--color-surface-2)' : 'transparent',
        color: 'var(--color-text-primary)',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 13,
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
      <span aria-hidden style={{ fontSize: 16, flexShrink: 0, width: 20, textAlign: 'center' }}>
        {entry.icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 500 }}>{entry.title}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{entry.summary}</span>
      </span>
      <span aria-hidden style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
        ›
      </span>
    </button>
  );
}

export default function SettingsRoot() {
  const active = useUIStore((s) => s.activeSettingsPage);
  const setActive = useUIStore((s) => s.setActiveSettingsPage);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {active ? (
          <>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="返回设置列表"
              style={{
                appearance: 'none',
                width: 24,
                height: 24,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 0,
                background: 'transparent',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ‹
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {ENTRIES.find((e) => e.id === active)?.title || '设置'}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            设置
          </span>
        )}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {active === null && (
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ENTRIES.map((entry) => (
              <SettingsEntry
                key={entry.id}
                entry={entry}
                active={false}
                onClick={() => setActive(entry.id)}
              />
            ))}
          </div>
        )}
        {active === 'theme' && <ThemeSettings />}
        {active === 'backend' && <BackendManagement />}
        {active === 'behavior' && <BehaviorSettings />}
        {active === 'about' && <AboutPage />}
      </div>
    </div>
  );
}
