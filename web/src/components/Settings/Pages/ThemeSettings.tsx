import type { ThemeMode } from '../../../hooks/useTheme';
import { useTheme } from '../../../hooks/useTheme';

/**
 * 主题设置。
 * 视觉为 3 个分段选项（跟随系统 / 浅色 / 深色），立即生效 + 持久化。
 */
export default function ThemeSettings() {
  const { mode, setMode } = useTheme();

  const options: Array<{ value: ThemeMode; label: string; hint: string }> = [
    { value: 'auto', label: '跟随系统', hint: 'Auto' },
    { value: 'light', label: '浅色', hint: 'Light' },
    { value: 'dark', label: '深色', hint: 'Dark' },
  ];

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '0 2px' }}>
        浅色主题尚在清理硬编码样式阶段，部分区域暂时仍为深色。
      </div>
      <div
        role="radiogroup"
        aria-label="主题模式"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md, 8px)',
        }}
      >
        {options.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(opt.value)}
              style={{
                flex: 1,
                appearance: 'none',
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 'var(--radius-sm, 6px)',
                border: 0,
                background: active ? 'var(--color-surface-3)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor: active ? 'default' : 'pointer',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
