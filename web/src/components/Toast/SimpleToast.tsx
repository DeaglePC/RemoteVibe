// SimpleToast.tsx
// P2 临时 Toast 组件：只承载「SW 新版本可更新」和「PWA 可安装」两条提示，
// P3 会被正式的 Toast/通知系统替代。
//
// 设计约束：
//  - 视觉尽量贴近后续正式 toast，但不引入新依赖；
//  - 只使用已有的 design tokens（tokens.css / themes.css）；
//  - 移动端固定底部（SafeArea 以上），桌面端固定右下角；
//  - 支持手动关闭和忽略。

import { useEffect, useState } from 'react';
import { useSwUpdate } from '../../hooks/useSwUpdate';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

/**
 * 小尺寸操作按钮
 */
function ActionButton(props: {
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  const { label, primary, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        border: primary ? '0' : '1px solid var(--color-border)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-md, 8px)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        color: primary ? '#13051b' : 'var(--color-text-1)',
        background: primary
          ? 'linear-gradient(135deg, var(--color-brand-500, #a78bfa), var(--color-accent-500, #22d3ee))'
          : 'transparent',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

/**
 * SW 新版本提示条
 */
function UpdateToast(props: { onApply: () => void; onDismiss: () => void }) {
  return (
    <ToastShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-0)' }}>
          发现新版本
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5 }}>
          点击立即更新，页面会刷新一次。
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
          <ActionButton label="稍后" onClick={props.onDismiss} />
          <ActionButton label="立即更新" primary onClick={props.onApply} />
        </div>
      </div>
    </ToastShell>
  );
}

/**
 * PWA 安装提示条
 */
function InstallToast(props: { onInstall: () => void; onDismiss: () => void }) {
  return (
    <ToastShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-0)' }}>
          安装到主屏幕
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5 }}>
          获得更接近原生 App 的体验，启动更快、窗口独立。
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
          <ActionButton label="不用了" onClick={props.onDismiss} />
          <ActionButton label="安装" primary onClick={props.onInstall} />
        </div>
      </div>
    </ToastShell>
  );
}

/**
 * Toast 外壳（视觉样式 + 定位）
 */
function ToastShell(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 'max(16px, env(safe-area-inset-left))',
        right: 'max(16px, env(safe-area-inset-right))',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 2000,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: 'min(360px, 100%)',
          padding: 14,
          background: 'var(--color-surface-1, #1d0d2a)',
          border: '1px solid var(--color-border, rgba(167,139,250,0.18))',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

/**
 * 全局 PWA 相关提示（更新 / 安装）
 * - 更新提示优先展示；
 * - 用户点「稍后」后本会话内不再提示（刷新或下次启动会重新出现）；
 * - 安装提示被拒 7 天内不再自动弹出。
 */
export default function SimpleToast() {
  const { updateAvailable, applyUpdate } = useSwUpdate();
  const { canInstall, promptInstall } = useInstallPrompt();

  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      const raw = localStorage.getItem('pwa-install-dismissed-at');
      if (!raw) return false;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return false;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return Date.now() - ts < sevenDaysMs;
    } catch {
      return false;
    }
  });

  // 用户首次真正使用 3 次后才提示安装（避免过早打扰）
  const [usageCount, setUsageCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('pwa-usage-count');
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try {
      const next = usageCount + 1;
      localStorage.setItem('pwa-usage-count', String(next));
      setUsageCount(next);
    } catch {
      // ignore
    }
    // 只在组件首次挂载时自增一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (updateAvailable && !updateDismissed) {
    return (
      <UpdateToast
        onApply={applyUpdate}
        onDismiss={() => setUpdateDismissed(true)}
      />
    );
  }

  if (canInstall && !installDismissed && usageCount >= 3) {
    return (
      <InstallToast
        onInstall={() => {
          void promptInstall();
        }}
        onDismiss={() => {
          try {
            localStorage.setItem('pwa-install-dismissed-at', String(Date.now()));
          } catch {
            // ignore
          }
          setInstallDismissed(true);
        }}
      />
    );
  }

  return null;
}
