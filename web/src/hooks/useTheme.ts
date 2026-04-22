import { useCallback, useEffect, useState } from 'react';

/**
 * 主题模式。
 *  - `auto`：跟随系统（`prefers-color-scheme`），默认值
 *  - `light`：强制浅色
 *  - `dark`：强制深色
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

/** 实际生效的主题（`auto` 会解析成具体值） */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'remotevibe_theme';
const STORAGE_VERSION = 1;

interface PersistedTheme {
  mode: ThemeMode;
  version: number;
}

/** 从 localStorage 读取用户选择；读不到则返回 auto */
function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'auto';
    const data: PersistedTheme = JSON.parse(raw);
    if (data.version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return 'auto';
    }
    if (data.mode === 'auto' || data.mode === 'light' || data.mode === 'dark') {
      return data.mode;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

/** 写入 localStorage */
function persistTheme(mode: ThemeMode): void {
  try {
    const data: PersistedTheme = { mode, version: STORAGE_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景可能写入失败，忽略即可
    console.warn('Failed to persist theme preference');
  }
}

/**
 * 把给定模式应用到 `<html>` 元素。
 *  - `auto`：移除 `data-theme` 属性，由 CSS 的 `@media (prefers-color-scheme)` 决定
 *  - `light` / `dark`：写入 `data-theme` 属性
 * 同时同步更新 `<meta name="theme-color">`，
 * 让 PWA/移动浏览器的状态栏颜色和实际主题保持一致。
 */
function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement;
  if (mode === 'auto') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }

  // 读取 CSS 变量 --theme-meta-color 作为状态栏颜色
  const metaColor = getComputedStyle(html)
    .getPropertyValue('--theme-meta-color')
    .trim();
  if (metaColor) {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', metaColor);
    }
  }
}

/** 解析 auto 到具体值 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
  return mode;
}

/**
 * useTheme Hook。
 *
 * 功能：
 *  - 返回当前用户选择的模式 `mode` 和实际生效的 `resolved`
 *  - 提供 `setMode` 切换主题，自动持久化并同步到 `<html>` 和 `<meta>`
 *  - 监听系统主题变化（仅在 `auto` 模式下响应）
 *
 * 使用示例：
 * ```tsx
 * const { mode, resolved, setMode } = useTheme();
 * <Select value={mode} onChange={setMode}>
 *   <option value="auto">跟随系统</option>
 *   <option value="light">浅色</option>
 *   <option value="dark">深色</option>
 * </Select>
 * ```
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => loadTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(loadTheme())
  );

  // 模式变化时，写 DOM + localStorage + 更新 resolved
  useEffect(() => {
    applyTheme(mode);
    setResolved(resolveTheme(mode));
  }, [mode]);

  // 监听系统主题变化（仅 auto 模式下响应）
  useEffect(() => {
    if (mode !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      // auto 模式下 html 没有 data-theme，CSS 会自己切；这里只同步 meta 与 resolved state
      applyTheme('auto');
      setResolved(resolveTheme('auto'));
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    persistTheme(next);
    setModeState(next);
  }, []);

  return { mode, resolved, setMode };
}

/**
 * 在应用挂载前调用一次，立刻应用已持久化的主题。
 *
 * 目的：避免"先渲染深色，再闪烁成浅色"的 FOUC。
 * 建议在 `main.tsx` 的 `createRoot` 调用之前调用，
 * 或者在 `index.html` 里以 inline script 形式内联此逻辑（更快）。
 *
 * 本函数只读一次 localStorage 并同步写 DOM，无副作用订阅。
 */
export function initThemeBeforeMount(): void {
  const mode = loadTheme();
  applyTheme(mode);
}
