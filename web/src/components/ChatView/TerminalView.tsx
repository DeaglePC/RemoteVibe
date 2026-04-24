import { useEffect, useLayoutEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { useTerminalStore, type TerminalSession, type TerminalSessionStatus } from '../../stores/terminalStore';
import TerminalQuickKeys from './TerminalQuickKeys';

/**
 * TerminalView 是终端模式下替代 ChatView 的主区域视图（多会话版）。
 *
 * 架构：
 *  - xterm 实例 + WebSocket 全部托管在 terminalStore，UI 层不创建也不销毁它们
 *  - 本组件只做两件事：
 *    1. 渲染 Tab 栏（新建 / 切换 / 关闭会话）+ 顶部状态栏
 *    2. 维护一个"可见容器" div，切 tab 时把激活会话的 hostEl appendChild 进来
 *  - 点"返回聊天"只把 uiStore.terminalMode 设 false，会话依然在后台常驻
 *  - 点"关闭终端"调 closeSession 才真正释放资源
 */

interface Props {
  /** 工作目录，作为新建会话时的默认 cwd */
  cwd: string | null;
}

const BACKGROUND = '#0b0d10';

export default function TerminalView({ cwd }: Props) {
  const setTerminalMode = useUIStore((s) => s.setTerminalMode);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const effectiveCwd = cwd ?? activeWorkDir;
  const isMobile = useIsMobile();

  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const createSession = useTerminalStore((s) => s.createSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const setActiveSessionId = useTerminalStore((s) => s.setActiveSessionId);
  const clearScreen = useTerminalStore((s) => s.clearScreen);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // 可见容器 ref：激活会话的 hostEl 会被 appendChild 到这里
  const viewportRef = useRef<HTMLDivElement>(null);

  // 防止 React StrictMode 下 effect 被执行两次导致创建两个会话的守卫。
  // 也能避免 TerminalView 因父组件 re-mount 而重复自动建会话。
  const autoCreatedRef = useRef(false);

  // 首次进入终端模式若没有任何会话，自动新建一个
  useEffect(() => {
    if (autoCreatedRef.current) return;
    // 这里读最新的 store 状态，避免闭包拿到旧的 sessions
    const current = useTerminalStore.getState().sessions;
    if (current.length === 0) {
      autoCreatedRef.current = true;
      createSession(effectiveCwd ?? null);
    } else {
      autoCreatedRef.current = true;
    }
    // 仅在 mount 时判断一次；后续不自动建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换激活会话 or 激活会话变化时，把 hostEl 挂到可见容器
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !activeSession) return;

    // 如果当前挂着的不是目标 hostEl，先清空再挂
    if (activeSession.hostEl.parentNode !== vp) {
      // 清掉之前挂着的 hostEl（会被移回它原来的游离状态）
      while (vp.firstChild) {
        vp.removeChild(vp.firstChild);
      }
      vp.appendChild(activeSession.hostEl);
    }

    // 首次挂进 DOM 后才 open xterm（xterm 必须在真实 DOM 节点上 open，
    // 否则字体度量失败，键盘事件也绑不上）
    if (!activeSession.opened) {
      activeSession.term.open(activeSession.hostEl);
      activeSession.opened = true;
    }

    // 激活后立刻 fit 一次，并聚焦到 xterm 的 textarea
    requestAnimationFrame(() => {
      try {
        activeSession.fit.fit();
      } catch {
        // 忽略
      }
      activeSession.term.focus();
    });
  }, [activeSession]);

  // 可见容器尺寸变化时，fit 当前会话
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      const current = useTerminalStore.getState();
      const sess = current.sessions.find((s) => s.id === current.activeSessionId);
      if (!sess) return;
      try {
        sess.fit.fit();
      } catch {
        // 忽略
      }
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const handleNewTab = () => {
    createSession(effectiveCwd ?? null);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeSession(id);
  };

  const handleSwitchTab = (id: string) => {
    setActiveSessionId(id);
  };

  const handleClearScreen = () => {
    if (activeSessionId) clearScreen(activeSessionId);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: 'var(--color-surface-0)',
      }}
    >
      {/* Tab 栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: isMobile ? 4 : 2,
          padding: isMobile ? '6px 8px 0 8px' : '4px 8px 0 8px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-1)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {sessions.map((s) => (
          <TerminalTab
            key={s.id}
            session={s}
            active={s.id === activeSessionId}
            compact={isMobile}
            onClick={() => handleSwitchTab(s.id)}
            onClose={(e) => handleCloseTab(s.id, e)}
          />
        ))}
        <button
          type="button"
          onClick={handleNewTab}
          title="新建终端"
          style={{
            minWidth: isMobile ? 40 : undefined,
            minHeight: isMobile ? 40 : undefined,
            padding: isMobile ? '0 12px' : '0 10px',
            marginLeft: 4,
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: isMobile ? 20 : 16,
            lineHeight: 1,
            alignSelf: 'center',
            flexShrink: 0,
          }}
        >
          ＋
        </button>
        <div style={{ flex: 1, minWidth: isMobile ? 8 : 0 }} />
        <button
          type="button"
          onClick={handleClearScreen}
          style={{
            minHeight: isMobile ? 36 : undefined,
            padding: isMobile ? '8px 14px' : '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: isMobile ? 13 : 11,
            alignSelf: 'center',
            marginBottom: 4,
            flexShrink: 0,
          }}
          title="清空当前终端屏幕（仅本地，不影响 shell）"
          disabled={!activeSession}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setTerminalMode(false)}
          style={{
            minHeight: isMobile ? 36 : undefined,
            padding: isMobile ? '8px 14px' : '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontSize: isMobile ? 13 : 11,
            alignSelf: 'center',
            marginLeft: 4,
            marginBottom: 4,
            marginRight: 4,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          title="返回聊天（终端在后台保持运行）"
        >
          {isMobile ? '返回' : '返回聊天'}
        </button>
      </div>

      {/* 状态条：展示当前激活会话的详细状态 */}
      {activeSession && <TerminalStatusBar session={activeSession} compact={isMobile} />}

      {/* 可见容器：当前激活会话的 hostEl 会挂到这里 */}
      <div
        ref={viewportRef}
        onClick={() => activeSession?.term.focus()}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '6px 10px',
          background: BACKGROUND,
          overflow: 'hidden',
        }}
      >
        {!activeSession && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 12,
            }}
          >
            没有活跃终端，点击左上角 ＋ 新建一个
          </div>
        )}
      </div>

      {/* 手机模式：底部快捷键栏（Ctrl / Tab / 方向键 / 符号） */}
      {isMobile && <TerminalQuickKeys activeSessionId={activeSessionId} />}
    </div>
  );
}

// ==================== 子组件 ====================

/** 单个 Tab：显示标题 + 状态图标 + 未读红点 + 关闭按钮。 */
function TerminalTab(props: {
  session: TerminalSession;
  active: boolean;
  compact?: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const { session, active, compact, onClick, onClose } = props;
  return (
    <div
      onClick={onClick}
      title={`${session.title} · ${session.statusText}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 6,
        minHeight: compact ? 36 : undefined,
        padding: compact ? '6px 8px 6px 10px' : '6px 10px 6px 10px',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        border: '1px solid var(--color-border)',
        borderBottom: active ? '1px solid var(--color-surface-0)' : '1px solid transparent',
        background: active ? 'var(--color-surface-0)' : 'transparent',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        cursor: 'pointer',
        fontSize: compact ? 13 : 12,
        whiteSpace: 'nowrap',
        marginBottom: -1,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <StatusIndicator status={session.status} compact={compact} />
      <span>{compact ? `T${session.title.replace(/\D/g, '')}` : session.title}</span>
      {session.hasUnread && (
        <span
          aria-label="有新输出"
          style={{
            width: compact ? 8 : 6,
            height: compact ? 8 : 6,
            borderRadius: '50%',
            background: 'oklch(0.75 0.2 40)',
          }}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        title="关闭终端"
        style={{
          marginLeft: compact ? 4 : 2,
          width: compact ? 24 : 16,
          height: compact ? 24 : 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: compact ? 16 : 14,
          lineHeight: 1,
          padding: 0,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}

/** 状态点：根据会话状态用不同颜色/符号。 */
function StatusIndicator({ status, compact }: { status: TerminalSessionStatus; compact?: boolean }) {
  let color = 'var(--color-text-muted)';
  let label = '未知';
  switch (status) {
    case 'connecting':
      color = 'oklch(0.75 0.15 80)'; // 黄
      label = '连接中';
      break;
    case 'connected':
      color = 'oklch(0.75 0.15 80)';
      label = '已连接';
      break;
    case 'ready':
      color = 'oklch(0.7 0.15 160)'; // 绿
      label = '就绪';
      break;
    case 'exited':
      color = 'var(--color-text-muted)';
      label = '已退出';
      break;
    case 'error':
      color = 'oklch(0.7 0.2 25)'; // 红
      label = '错误';
      break;
    case 'closed':
      color = 'var(--color-text-muted)';
      label = '已关闭';
      break;
  }
  return (
    <span
      aria-label={label}
      title={label}
      style={{
        width: compact ? 8 : 8,
        height: compact ? 8 : 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/** 状态条：展示当前激活会话的 shell、cwd 和状态文字。 */
function TerminalStatusBar({ session, compact }: { session: TerminalSession; compact?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? '6px 12px' : '4px 14px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
        fontSize: compact ? 12 : 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-muted)',
        flexShrink: 0,
      }}
    >
      <StatusIndicator status={session.status} compact={compact} />
      {session.shell && (
        <span style={{ color: 'var(--color-text-primary)' }}>{session.shell}</span>
      )}
      {session.cwd && !compact && (
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 360,
          }}
          title={session.cwd}
        >
          cwd: {session.cwd}
        </span>
      )}
      <span style={{ flex: 1 }} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: compact ? '60%' : '40%',
        }}
        title={session.statusText}
      >
        {session.statusText}
      </span>
    </div>
  );
}
