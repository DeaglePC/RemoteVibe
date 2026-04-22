import { useEffect } from 'react';

/**
 * 键盘快捷键定义。
 *
 * - `key`: 同 KeyboardEvent.key，大小写敏感。例如 'k'、'Enter'、','、'ArrowUp'
 * - `mod`: 是否要求 Mod 键按下（macOS = metaKey，其他 = ctrlKey）
 * - `shift`: 是否要求 Shift 键
 * - `alt`:   是否要求 Alt/Option 键
 * - `handler`: 回调；返回 `true` 表示已消费此事件（会 preventDefault + stopPropagation）
 * - `allowInInput`: 默认在 input/textarea/contentEditable 中不响应，设为 true 可强制响应
 */
export interface ShortcutDef {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => boolean | void;
  allowInInput?: boolean;
}

/** 判断事件目标是否为输入控件 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/** 跨平台判断 Mod 键（macOS meta；其他 ctrl） */
function isModPressed(e: KeyboardEvent): boolean {
  // navigator.platform 已不推荐，改用 userAgent 推断
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * 全局快捷键注册 Hook。
 *
 * 使用示例：
 * ```tsx
 * useShortcuts([
 *   { key: 'k', mod: true, handler: () => { openPalette(); return true; } },
 *   { key: 'b', mod: true, handler: () => { toggleSidebar(); return true; } },
 * ]);
 * ```
 *
 * 传入的 shortcuts 数组应尽量保持稳定引用（useMemo 包裹），
 * 否则每次变化都会重新绑定事件监听。
 */
export function useShortcuts(shortcuts: ShortcutDef[]): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 只响应键位事件；忽略 IME 组合中
      if (e.isComposing || (e as KeyboardEvent).keyCode === 229) return;

      const inEditable = isEditableTarget(e.target);

      for (const sc of shortcuts) {
        if (sc.key !== e.key && sc.key.toLowerCase() !== e.key.toLowerCase()) continue;
        if (sc.mod !== undefined && sc.mod !== isModPressed(e)) continue;
        if (sc.shift !== undefined && sc.shift !== e.shiftKey) continue;
        if (sc.alt !== undefined && sc.alt !== e.altKey) continue;
        if (inEditable && !sc.allowInInput) continue;

        const consumed = sc.handler(e);
        if (consumed !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
