import { useCallback, useEffect, useRef, useState } from 'react';
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
 *  - 宽度由 `uiStore.sidebarWidth` 控制（默认 240px，范围 180–480），
 *    右边缘提供拖拽把手，用户可按住鼠标左右拖动调整。
 *  - 可通过 `uiStore.sidebarCollapsed` 折叠为 0 宽（Cmd+B）
 *  - 两种模式由 `uiStore.sidebarMode` 控制：
 *      - `sessions` → 项目手风琴（默认）
 *      - `settings` → 设置导航
 *  - 模式切换通过左侧 ActivityBar 的两个图标，或快捷键 Cmd+, 切到设置模式
 */
export default function DesktopSidebar({ onNewSession }: Props) {
  const mode = useUIStore((s) => s.sidebarMode);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const width = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  const handleNewSession = useCallback(
    (workDir: string | null) => {
      onNewSession(workDir);
    },
    [onNewSession],
  );

  // 拖拽状态：仅本地组件使用，拖拽过程中每帧 setSidebarWidth（内部有 clamp + 去重）
  const [isDragging, setIsDragging] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);

  // 拖拽过程中绑定 window 级 mousemove/mouseup，保证鼠标移出 Resizer 仍能继续响应
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const aside = asideRef.current;
      if (!aside) return;
      // 相对 aside 左边缘的距离即为新宽度
      const rect = aside.getBoundingClientRect();
      const next = e.clientX - rect.left;
      setSidebarWidth(next);
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    // 拖拽期间统一光标与禁止选中，避免文本被选上
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isDragging, setSidebarWidth]);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // 双击把手：快速重置为默认宽度（240）
  const handleResizerDoubleClick = useCallback(() => {
    setSidebarWidth(240);
  }, [setSidebarWidth]);

  // 折叠态：完全隐藏（0 宽），不渲染内部，避免 resize 时重复计算
  if (collapsed) {
    return null;
  }

  return (
    <aside
      ref={asideRef}
      aria-label="Sidebar"
      style={{
        width,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-surface-0)',
        borderRight: '1px solid var(--color-border)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {mode === 'sessions' ? <ProjectAccordion onNewSession={handleNewSession} /> : <SettingsRoot />}

      {/* 右边缘拖拽把手：宽 6px，绝对定位贴右边；hover / 拖拽中高亮 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={handleResizerMouseDown}
        onDoubleClick={handleResizerDoubleClick}
        title="拖动调整宽度，双击重置"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          // 拖拽时显示一条高亮线；平时透明，hover 时加个淡色
          background: isDragging ? 'var(--color-primary, #3b82f6)' : 'transparent',
          transition: isDragging ? 'none' : 'background 120ms ease',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          if (!isDragging) {
            (e.currentTarget as HTMLDivElement).style.background =
              'var(--color-border-hover, rgba(255,255,255,0.12))';
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }
        }}
      />
    </aside>
  );
}
