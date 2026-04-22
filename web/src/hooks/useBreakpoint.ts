import { useEffect, useState } from 'react';

/**
 * 响应式断点。
 * 设计参考方案文档：
 *  - `mobile`:   `< 640px`（iPhone 竖屏、小屏）
 *  - `tablet`:   `640px – 1024px`（平板竖屏、折叠屏展开）
 *  - `desktop`:  `≥ 1024px`（桌面 / 笔记本）
 *
 * 该 hook 监听窗口尺寸变化并在断点跨越时触发 re-render，
 * 用以替代 App.tsx 里散落的 `window.innerWidth < 640` 判断。
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_MAX = 639;
const TABLET_MAX = 1023;

/** 根据当前视口宽度计算断点 */
function computeBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w <= MOBILE_MAX) return 'mobile';
  if (w <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

/**
 * useBreakpoint hook
 * @returns 当前视口对应的断点名称
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => computeBreakpoint());

  useEffect(() => {
    let raf = 0;
    const handler = () => {
      // 用 rAF 节流，resize 事件触发频繁
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setBp((prev) => {
          const next = computeBreakpoint();
          return prev === next ? prev : next;
        });
      });
    };
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return bp;
}

/** 便捷布尔 hook：是否 mobile */
export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

/** 便捷布尔 hook：是否 desktop（包括桌面和平板横屏） */
export function useIsDesktop(): boolean {
  return useBreakpoint() === 'desktop';
}
