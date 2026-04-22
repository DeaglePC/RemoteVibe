import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import ProjectAccordion from '../Sessions/ProjectAccordion';
import SettingsRoot from '../Settings/SettingsRoot';

interface Props {
  /** 新建会话回调：App 层转发到 TopBar 的 launchTrigger 机制 */
  onNewSession: (workDir: string | null) => void;
}

/**
 * 桌面端常驻 Sidebar（方案 §4.3）。
 *
 * 设计要点：
 *  - 固定 220px 宽；可通过 `uiStore.sidebarCollapsed` 折叠为 0 宽（Cmd+B）
 *  - 两种模式由 `uiStore.sidebarMode` 控制：
 *      - `sessions` → 项目手风琴（默认）
 *      - `settings` → 设置导航
 *  - 模式切换通过左侧 ActivityBar 的两个图标，或快捷键 Cmd+, 切到设置模式
 */
export default function DesktopSidebar({ onNewSession }: Props) {
  const mode = useUIStore((s) => s.sidebarMode);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  const handleNewSession = useCallback(
    (workDir: string | null) => {
      onNewSession(workDir);
    },
    [onNewSession],
  );

  // 折叠态：完全隐藏（0 宽），不渲染内部，避免 resize 时重复计算
  if (collapsed) {
    return null;
  }

  return (
    <aside
      aria-label="Sidebar"
      style={{
        width: 'var(--layout-sidebar, 220px)',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-surface-0)',
        borderRight: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}
    >
      {mode === 'sessions' ? <ProjectAccordion onNewSession={handleNewSession} /> : <SettingsRoot />}
    </aside>
  );
}
