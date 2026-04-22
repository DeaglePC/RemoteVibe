import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useBackendStore,
  pingAllBackends,
  pingBackend,
  type BackendHealthState,
} from '../../stores/backendStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useBreakpoint';

/**
 * 状态点颜色映射。
 * - online: 绿
 * - offline: 红
 * - checking: 黄（略带脉冲）
 * - unknown: 灰
 */
function getStatusColor(state: BackendHealthState | undefined): string {
  switch (state) {
    case 'online':
      return 'var(--color-success, #2ecc71)';
    case 'offline':
      return 'var(--color-danger, #e74c3c)';
    case 'checking':
      return 'var(--color-warning, #f1c40f)';
    default:
      return 'var(--color-text-muted, #888)';
  }
}

interface Props {
  /** 紧凑模式：true 时只显示状态点 + 名称缩略 + 下拉箭头 */
  compact?: boolean;
  /** 点击"管理后端机器…"时的自定义回调。不传则默认跳转到设置页的 BackendManagement */
  onManage?: () => void;
}

/**
 * 后端机器切换芯片（P5：多机器管理优化）。
 *
 * 用途：
 *  - 手机首页 header 右侧显示
 *  - PC Sidebar `ProjectAccordion` 顶栏
 *  - 设置页 `BackendManagement` 头部
 *
 * 设计：
 *  - 按钮主体：🟢 pa-mini ▾
 *  - 下拉：列出全部机器（状态点 / 名称 / apiUrl / ACTIVE 徽章） + 底部"管理后端机器…"
 *  - 点击非 active 项触发切换；切换后 ping 该机器一次以刷新状态
 */
export default function BackendSwitcherChip({ compact = false, onManage }: Props) {
  const backends = useBackendStore((s) => s.backends);
  const activeBackendId = useBackendStore((s) => s.activeBackendId);
  const statusMap = useBackendStore((s) => s.statusMap);
  const active = backends.find((b) => b.id === activeBackendId) || null;
  const isMobile = useIsMobile();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // 打开下拉时 ping 所有机器（只对缺失 / offline 的刷新）
  const handleToggleOpen = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) {
      // 非阻塞：异步刷新所有机器状态
      void pingAllBackends();
    }
  }, [open]);

  const handleSwitch = useCallback(
    (id: string) => {
      const store = useBackendStore.getState();
      if (id === store.activeBackendId) {
        setOpen(false);
        return;
      }
      store.setActiveBackend(id);
      setOpen(false);
      // 切换后立刻 ping 该机器一次，快速反馈状态
      void pingBackend(id);
    },
    [],
  );

  const handleManage = useCallback(() => {
    setOpen(false);
    if (onManage) {
      onManage();
      return;
    }
    // 默认行为：切到设置面板的 backend 页
    const uiStore = useUIStore.getState();
    uiStore.setSidebarMode('settings');
    if (uiStore.sidebarCollapsed) {
      uiStore.setSidebarCollapsed(false);
    }
    // 兼容老路径：同时唤起 Modal（Settings 页未路由到 backend tab 时的兜底）
    useBackendStore.getState().setShowSettings(true);
  }, [onManage]);

  const activeStatus = active ? statusMap[active.id]?.state : undefined;
  const dotColor = getStatusColor(activeStatus);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={handleToggleOpen}
        title={active ? `${active.name} · ${active.apiUrl}` : '未配置后端机器'}
        style={{
          appearance: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 6,
          // 移动端押大热区到≈ 36px（在 44px 的 header 条里留足空间）
          minHeight: isMobile ? 36 : undefined,
          padding: isMobile ? '6px 12px' : compact ? '3px 8px' : '4px 10px',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--color-border)',
          background: open ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
          color: 'var(--color-text-primary)',
          fontSize: isMobile ? 13 : 12,
          lineHeight: 1.2,
          cursor: 'pointer',
          maxWidth: isMobile ? 180 : compact ? 140 : 180,
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: isMobile ? 10 : 8,
            height: isMobile ? 10 : 8,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            animation: activeStatus === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined,
          }}
        />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            fontWeight: 500,
          }}
        >
          {active ? active.name : '未配置'}
        </span>
        <svg
          width={isMobile ? 12 : 10}
          height={isMobile ? 12 : 10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ flexShrink: 0, opacity: 0.7 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: isMobile ? 260 : 240,
            maxWidth: isMobile ? 'calc(100vw - 24px)' : 320,
            maxHeight: isMobile ? 'min(70vh, 480px)' : 360,
            overflow: 'auto',
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 8px 24px oklch(0 0 0 / 0.3)',
            zIndex: 200,
            padding: isMobile ? 6 : 4,
          }}
        >
          {backends.length === 0 && (
            <div
              style={{
                padding: '12px 10px',
                fontSize: 12,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              尚未配置任何机器
            </div>
          )}

          {backends.map((b) => {
            const isActive = b.id === activeBackendId;
            const st = statusMap[b.id]?.state;
            const color = getStatusColor(st);
            const latency = statusMap[b.id]?.latencyMs;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleSwitch(b.id)}
                style={{
                  appearance: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minHeight: isMobile ? 56 : undefined,
                  padding: isMobile ? '10px 12px' : '8px 10px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: isActive ? 'var(--color-surface-2)' : 'transparent',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--color-surface-2)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: isMobile ? 14 : 12,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.name}
                    {isActive && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: 'var(--color-accent-500)',
                          color: 'white',
                          verticalAlign: 'middle',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: isMobile ? 12 : 10,
                      color: 'var(--color-text-muted)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.apiUrl}
                  </div>
                  {st && st !== 'unknown' && (
                    <div style={{ fontSize: isMobile ? 11 : 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {st === 'online' && `🟢 在线${typeof latency === 'number' ? ` · ${latency}ms` : ''}`}
                      {st === 'offline' && '🔴 离线'}
                      {st === 'checking' && '⏳ 检测中…'}
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              onClick={handleManage}
              style={{
                appearance: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                minHeight: isMobile ? 44 : undefined,
                padding: isMobile ? '10px 12px' : '8px 10px',
                border: 'none',
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'transparent',
                color: 'var(--color-accent-400)',
                cursor: 'pointer',
                fontSize: isMobile ? 14 : 12,
                fontWeight: 500,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              ⚙️ 管理后端机器…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
