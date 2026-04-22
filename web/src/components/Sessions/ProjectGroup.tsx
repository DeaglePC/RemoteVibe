import { useCallback } from 'react';
import type { Project } from '../../stores/sessionSelectors';
import { useIsMobile } from '../../hooks/useBreakpoint';
import SessionItem from './SessionItem';

interface Props {
  project: Project;
  /** 是否当前展开 */
  expanded: boolean;
  /** 当前激活会话 ID（用于高亮） */
  activeSessionId: string | null;
  /** 展开/收起回调 */
  onToggle: (workDir: string) => void;
  /** 在该项目下新建会话 */
  onNewSession: (workDir: string) => void;
  /** 历史会话（持久化但未在 active sessions 中），需要 restoreSession 才能激活 */
  isHistory?: boolean;
  /** 点击会话项后的额外回调（通常手机端用于 push 到聊天页） */
  onSessionSelect?: (sessionId: string) => void;
}

/**
 * 单个项目折叠组（手风琴的一行）。
 * 展开后列出该项目下的所有会话 + "+ 新建会话" 按钮。
 */
export default function ProjectGroup({
  project,
  expanded,
  activeSessionId,
  onToggle,
  onNewSession,
  isHistory = false,
  onSessionSelect,
}: Props) {
  const isMobile = useIsMobile();

  const handleHeaderClick = useCallback(() => {
    onToggle(project.workDir);
  }, [onToggle, project.workDir]);

  const handleNewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onNewSession(project.workDir);
    },
    [onNewSession, project.workDir],
  );

  return (
    <div style={{ marginBottom: isMobile ? 2 : 4 }}>
      {/* 项目头 */}
      <button
        type="button"
        onClick={handleHeaderClick}
        title={project.workDir}
        style={{
          appearance: 'none',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 6,
          // 移动端给足 44px 触控热区
          minHeight: isMobile ? 44 : undefined,
          padding: isMobile ? '6px 10px' : '6px 10px',
          borderRadius: 'var(--radius-sm, 8px)',
          border: 0,
          background: 'transparent',
          color: 'var(--color-text-primary)',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: isMobile ? 15 : 13,
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            // 移动端展开小三角拡大为 20×20，配合 header 点击即可展开
            width: isMobile ? 20 : 10,
            height: isMobile ? 20 : undefined,
            transition: 'transform var(--duration-fast, 120ms) var(--ease-out, ease-out)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            color: 'var(--color-text-muted)',
            fontSize: isMobile ? 12 : undefined,
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        <span aria-hidden style={{ flexShrink: 0, fontSize: isMobile ? 18 : undefined }}>
          📁
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {project.displayName}
        </span>
        <span style={{ fontSize: isMobile ? 12 : 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {project.sessions.length}
        </span>
      </button>

      {/* 项目展开后的会话列表（CSS grid 动画展开/收起 auto 高度）*/}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--duration-base, 180ms) var(--ease-out, ease-out)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              paddingLeft: isMobile ? 12 : 16,
              marginTop: expanded ? 2 : 0,
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 4 : 2,
              opacity: expanded ? 1 : 0,
              transition: 'opacity var(--duration-fast, 120ms) var(--ease-out, ease-out)',
            }}
          >
            {project.sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                isHistory={isHistory}
                onAfterSelect={onSessionSelect}
              />
            ))}
            <button
              type="button"
              onClick={handleNewClick}
              style={{
                appearance: 'none',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isMobile ? 'center' : 'flex-start',
                gap: 6,
                minHeight: isMobile ? 40 : undefined,
                padding: isMobile ? '8px 12px' : '6px 10px 6px 12px',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px dashed var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                textAlign: isMobile ? 'center' : 'left',
                cursor: 'pointer',
                fontSize: isMobile ? 14 : 12,
                marginTop: isMobile ? 4 : 2,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-strong)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)';
              }}
            >
              <span aria-hidden>＋</span>
              <span>新建会话</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
