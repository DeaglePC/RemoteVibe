import { useCallback, useMemo, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { findProjectOfSession, selectProjects } from '../../stores/sessionSelectors';
import { useIsMobile } from '../../hooks/useBreakpoint';
import ProjectGroup from './ProjectGroup';
import BackendSwitcherChip from '../Backend/BackendSwitcherChip';

interface Props {
  /** 新建会话回调（通常交给 App.tsx 里的 launchTrigger 机制处理） */
  onNewSession: (workDir: string | null) => void;
  /** 点击会话项后的回调（手机端用于 push 到聊天页） */
  onSessionSelect?: (sessionId: string) => void;
  /**
   * 是否隐藏组件内置的「会话」标题行（含 BackendSwitcherChip）。
   *
   * 默认 false（PC 端 Sidebar 需要显示标题+机器切换 chip）。
   * 手机端 `HomePage` 外层已用 `MobilePageHeader` 渲染了同样的标题+chip，
   * 须传 true 以避免重复。
   */
  hideHeader?: boolean;
}

/**
 * 项目手风琴（Q3.2=A 拍板）：
 *  - 按 workDir 分组，默认全部折叠
 *  - 激活会话所在项目自动展开
 *  - 活跃会话列表 + 历史会话列表合并分组（历史弱化视觉 + restoreSession）
 *  - 顶栏搜索：按项目名或会话名模糊过滤
 *
 * 设计参考方案 §4.3 模式 A：
 *  - 顶部 [🔍] [+]
 *  - 项目按最近活动时间排序，最新在前
 */
export default function ProjectAccordion({ onNewSession, onSessionSelect, hideHeader = false }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isMobile = useIsMobile();

  const [query, setQuery] = useState('');
  const [expandedWorkDirs, setExpandedWorkDirs] = useState<Set<string>>(() => new Set());

  // React 19 官方推荐的"响应 store 变化重置内部状态"模式（用 state 记录上一次值）。
  // 当 activeSessionId 变化时，在 render 期派生新的展开集合，避开
  // react-hooks/set-state-in-effect 和 Cannot-access-refs-during-render 两条规则。
  const [prevActiveId, setPrevActiveId] = useState<string | null>(activeSessionId);
  if (prevActiveId !== activeSessionId) {
    setPrevActiveId(activeSessionId);
    const workDir = findProjectOfSession(sessions, activeSessionId);
    if (workDir !== null && !expandedWorkDirs.has(workDir)) {
      setExpandedWorkDirs((prev) => {
        if (prev.has(workDir)) return prev;
        const next = new Set(prev);
        next.add(workDir);
        return next;
      });
    }
  }

  // 组装过滤后的项目列表
  const projects = useMemo(() => {
    const all = selectProjects(sessions);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((p) => ({
        ...p,
        sessions: p.sessions.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            p.displayName.toLowerCase().includes(q) ||
            p.workDir.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.sessions.length > 0);
  }, [sessions, query]);

  const handleToggle = useCallback((workDir: string) => {
    setExpandedWorkDirs((prev) => {
      const next = new Set(prev);
      if (next.has(workDir)) {
        next.delete(workDir);
      } else {
        next.add(workDir);
      }
      return next;
    });
  }, []);

  const handleHeaderNew = useCallback(() => {
    onNewSession(null);
  }, [onNewSession]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 顶栏：第一行 标题 + 机器 chip（可选，hideHeader=true 时不渲染）；第二行 搜索 + 新建。
          移动端放大字号、热区（>= 40px）以改善触控体验；PC 端也适当放宽 padding/gap 以获得更好的呼吸感。*/}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? 10 : 10,
          padding: isMobile ? '12px 12px' : '12px 12px 10px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {!hideHeader && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              minHeight: 24,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                letterSpacing: 0.2,
              }}
            >
              会话
            </span>
            <BackendSwitcherChip compact />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 8 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话 / 项目..."
            style={{
              flex: 1,
              minWidth: 0,
              height: isMobile ? 40 : 30,
              padding: isMobile ? '0 12px' : '0 10px',
              // 移动端字号 >= 16px 避免 iOS Safari 聚焦时自动缩放
              fontSize: isMobile ? 16 : 12.5,
              lineHeight: 1.4,
              color: 'var(--color-text-primary)',
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md, 8px)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleHeaderNew}
            title="打开新项目 / 新建会话"
            aria-label="新建会话"
            style={{
              appearance: 'none',
              width: isMobile ? 40 : 30,
              height: isMobile ? 40 : 30,
              flexShrink: 0,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-1)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              fontSize: isMobile ? 20 : 16,
              lineHeight: 1,
              transition: 'background 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-1)';
            }}
          >
            ＋
          </button>
        </div>
      </div>

      {/* 项目列表滚动区 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          // 移动端底部贴合 safe-area，避免最后一条被 TabBar 遮挡
          padding: isMobile
            ? '6px 8px calc(12px + env(safe-area-inset-bottom, 0px))'
            : '8px',
        }}
      >
        {projects.length === 0 ? (
          <div
            style={{
              padding: '24px 8px',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              lineHeight: 1.7,
            }}
          >
            {query ? '没有匹配的会话' : '暂无会话\n点击右上角 ＋ 打开一个项目'}
          </div>
        ) : (
          projects.map((project) => (
            <ProjectGroup
              key={project.workDir}
              project={project}
              expanded={expandedWorkDirs.has(project.workDir)}
              activeSessionId={activeSessionId}
              onToggle={handleToggle}
              onNewSession={onNewSession}
              onSessionSelect={onSessionSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
