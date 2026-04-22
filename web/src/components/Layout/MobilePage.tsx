import type { ReactNode } from 'react';

/**
 * 手机端二级页面容器（方案 §5.6）。
 *
 * 包裹一个 push 进栈的页面，行为：
 *  - fixed 全屏覆盖（位于 MobileShell 的栈顶）
 *  - slide-in-right 动画（复用 index.css 的 `.animate-slide-in-right`）
 *  - 直接背景色 var(--color-surface-0)，与主布局一致
 *
 * 内部要求为纵向 flex：子组件通常为 `MobilePageHeader + 主内容 + 可选底栏`。
 */
interface Props {
  children: ReactNode;
  /** 栈深度用于计算 zIndex，避免多层页叠加时层序交错 */
  depth?: number;
}

export default function MobilePage({ children, depth = 0 }: Props) {
  return (
    <div
      className="mobile-panel animate-slide-in-right"
      style={{
        background: 'var(--color-surface-0)',
        zIndex: 50 + depth,
      }}
    >
      {children}
    </div>
  );
}
