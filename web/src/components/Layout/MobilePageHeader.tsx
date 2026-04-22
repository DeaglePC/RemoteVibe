import type { ReactNode } from 'react';

/**
 * 手机端页面 Header（方案 §5.3）。
 *
 * 一个通用的 44px header：
 *  - 左侧：可选的 back button 或自定义 slot（宽度自适应，紧贴 title）
 *  - 中间：标题 + 可选副标题（左对齐，紧跟返回按钮，iOS 原生导航栏风格）
 *  - 右侧：可选的动作图标 slot
 *
 * 顶部贴合 `env(safe-area-inset-top)` 以处理 iPhone 刘屏结构。
 */
interface Props {
  title: string;
  subtitle?: string;
  /** 点击返回回调；不传则不显示返回按钮（L1 页） */
  onBack?: () => void;
  /** 右侧自定义内容（按钮组 / 等） */
  rightSlot?: ReactNode;
}

export default function MobilePageHeader({ title, subtitle, onBack, rightSlot }: Props) {
  return (
    <header
      style={{
        flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top, 0)',
        background: 'var(--color-surface-0)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 4,
        }}
      >
        {/* 左侧：返回或留空（宽度自适应，紧贴 title） */}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              padding: '4px 8px 4px 4px',
              fontSize: 28,
              lineHeight: 1,
              color: 'var(--color-accent-500)',
              cursor: 'pointer',
              fontWeight: 300,
              flexShrink: 0,
            }}
          >
            ‹
          </button>
        ) : null}

        {/* 中间：标题（左对齐，紧跟返回按钮） */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-muted)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* 右侧：自定义 slot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            flexShrink: 0,
          }}
        >
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
