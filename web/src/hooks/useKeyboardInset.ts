import { useEffect, useState } from 'react';

/**
 * useVisualViewport 返回当前软键盘（虚拟键盘）挤占的底部高度，单位 px。
 *
 * 背景：
 *  - iOS Safari / Android Chrome 软键盘弹出时，window.innerHeight 不变，
 *    只有 window.visualViewport.height 会变小。
 *  - `env(keyboard-inset-height)` 在部分浏览器可用，但兼容性不一。
 *  - 最稳妥方式是监听 visualViewport 的 resize 事件。
 *
 * 使用示例：
 * ```tsx
 * const keyboardInset = useKeyboardInset();
 * <div style={{ paddingBottom: keyboardInset }}>...</div>
 * ```
 *
 * 当页面没有虚拟键盘（桌面 / 键盘收起）时返回 0。
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;

    const update = () => {
      // 键盘挤占量 = 窗口总高 - visualViewport 可见高 - visualViewport 相对窗口的偏移
      // offsetTop 表示页面被向上推的距离，通常为 0；键盘出现时键盘高 = 剩余遮挡
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // 小于 40px 视为误差（浏览器 UI 栏伸缩等），不触发重排
      setInset(occluded > 40 ? Math.round(occluded) : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
