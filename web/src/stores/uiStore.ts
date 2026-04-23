import { create } from 'zustand';

/**
 * Sidebar 模式：
 *  - `sessions`：项目手风琴（默认）
 *  - `settings`：设置导航
 */
export type SidebarMode = 'sessions' | 'settings';

/**
 * Shell 风格：
 *  - `classic`：老版 App.tsx 内联布局（P3 前行为）
 *  - `pwa`：新版 DesktopShell / MobileShell（P3 起步）
 *
 * 通过 URL `?shell=classic` 或 `?shell=pwa` 手动切换；持久化到 localStorage。
 * 未设置时默认走 `pwa`。
 */
export type ShellFlavor = 'classic' | 'pwa';

/**
 * 手机端底部 Tab。
 * 仅当栈为空时需要根据它来決定 L1 展示哪个首页；栏顶自身也用来高亮当前活跃 Tab。
 */
export type MobileTab = 'sessions' | 'settings';

/**
 * 手机端页面栈条目。
 * 每一项对应一个 L2/L3 页面，并携带所需参数，以防组件串参。
 *  - `chat`：会话聊天页，携带 sessionId
 *  - `files`：文件树页，携带 rootPath（默认取当前 activeWorkDir）
 *  - `file-viewer`：文件查看器，携带 path + name (+ size)
 *  - `settings-detail`：设置子页，携带 pageId
 */
export type MobilePage =
  | { type: 'chat'; sessionId: string }
  | { type: 'files'; rootPath: string }
  | { type: 'file-viewer'; path: string; name: string; size?: number }
  | { type: 'settings-detail'; pageId: 'theme' | 'backend' | 'about' };

interface UIState {
  /** Sidebar 当前展示的内容主题 */
  sidebarMode: SidebarMode;
  setSidebarMode: (mode: SidebarMode) => void;
  toggleSidebarMode: () => void;

  /** Sidebar 是否折叠（PC 端） */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;

  /** Sidebar 宽度（PC 端，单位 px），可由用户拖拽调整 */
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;

  /** 右侧 Pane 是否打开（PC 端） */
  rightPaneOpen: boolean;
  setRightPaneOpen: (open: boolean) => void;
  toggleRightPaneOpen: () => void;

  /** 右侧 Pane 当前内容主题 */
  rightPaneContent: 'files' | 'tool-detail';
  setRightPaneContent: (content: UIState['rightPaneContent']) => void;

  /** 命令面板是否打开（Cmd+K） */
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  /** Shell 风格（feature flag） */
  shellFlavor: ShellFlavor;
  setShellFlavor: (flavor: ShellFlavor) => void;

  /** 设置页当前展开的子项（Sidebar 设置模式下使用） */
  activeSettingsPage: 'theme' | 'backend' | 'behavior' | 'about' | null;
  setActiveSettingsPage: (page: UIState['activeSettingsPage']) => void;

  /**
   * 打开会话时是否自动恢复 Agent。
   * true（默认）：ChatPage 挂载后若有可恢复的会话，自动触发 Reconnect。
   * false：用户需手动点击左上角状态点来恢复。
   */
  autoReconnectOnOpen: boolean;
  setAutoReconnectOnOpen: (v: boolean) => void;

  /**
   * 终端模式：开启后聊天窗口切换为 TerminalView（基于 xterm.js 的真实 PTY 终端），
   * 通过 /ws/terminal 与后端长驻 shell 进程双向透传字节流。
   * 仅内存态，不持久化：刷新页面回到聊天模式。
   */
  terminalMode: boolean;
  setTerminalMode: (v: boolean) => void;
  toggleTerminalMode: () => void;

  // ==================== 手机端导航（P4） ====================

  /** 手机端底部当前活跃 Tab */
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;

  /** 手机端页面栈（不包含 L1 首页）。栈非空时显示栈顶，TabBar 隐藏 */
  mobileNavStack: MobilePage[];
  /** 压入一个页面（push） */
  pushMobilePage: (page: MobilePage) => void;
  /** 弹出栈顶（pop）；栈空时为空操作 */
  popMobilePage: () => void;
  /** 清空斀页面栈（一键回首页） */
  clearMobileStack: () => void;
}

// ==================== Persistence（仅持久化 shellFlavor & sidebarCollapsed） ====================

const STORAGE_KEY = 'remotevibe_ui';
const STORAGE_VERSION = 1;

interface PersistedUI {
  shellFlavor: ShellFlavor;
  sidebarCollapsed: boolean;
  sidebarWidth?: number;
  autoReconnectOnOpen?: boolean;
  version: number;
}

/** Sidebar 宽度默认值与合法范围（px） */
const SIDEBAR_WIDTH_DEFAULT = 240;
const SIDEBAR_WIDTH_MIN = 180;
const SIDEBAR_WIDTH_MAX = 480;

function clampSidebarWidth(w: number): number {
  if (!Number.isFinite(w)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(w)));
}

/** 从 URL `?shell=xxx` 读取 shell 偏好（仅当值合法时生效） */
function readShellFromUrl(): ShellFlavor | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('shell');
  if (raw === 'classic' || raw === 'pwa') return raw;
  return null;
}

/** 从 localStorage 加载 UI 偏好 */
function loadUIPreference(): {
  shellFlavor: ShellFlavor;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  autoReconnectOnOpen: boolean;
} {
  // URL 参数最高优先级，允许从网址临时切换
  const urlShell = readShellFromUrl();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        shellFlavor: urlShell ?? 'pwa',
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
        autoReconnectOnOpen: true,
      };
    }
    const data: PersistedUI = JSON.parse(raw);
    if (data.version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return {
        shellFlavor: urlShell ?? 'pwa',
        sidebarCollapsed: false,
        sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
        autoReconnectOnOpen: true,
      };
    }
    return {
      shellFlavor: urlShell ?? (data.shellFlavor === 'classic' || data.shellFlavor === 'pwa' ? data.shellFlavor : 'pwa'),
      sidebarCollapsed: Boolean(data.sidebarCollapsed),
      sidebarWidth:
        typeof data.sidebarWidth === 'number'
          ? clampSidebarWidth(data.sidebarWidth)
          : SIDEBAR_WIDTH_DEFAULT,
      autoReconnectOnOpen: data.autoReconnectOnOpen !== false,
    };
  } catch {
    return {
      shellFlavor: urlShell ?? 'pwa',
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      autoReconnectOnOpen: true,
    };
  }
}

/** 保存 UI 偏好到 localStorage */
function persistUI(
  shellFlavor: ShellFlavor,
  sidebarCollapsed: boolean,
  autoReconnectOnOpen: boolean,
  sidebarWidth: number,
): void {
  try {
    const data: PersistedUI = {
      shellFlavor,
      sidebarCollapsed,
      sidebarWidth,
      autoReconnectOnOpen,
      version: STORAGE_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}

// ==================== Store ====================

const initial = loadUIPreference();

/**
 * UI 状态 store：承载 Sidebar / Right Pane / Command Palette / Shell 风格等纯视图状态。
 * 不存业务数据（会话、后端等都在各自的 store 里）。
 */
export const useUIStore = create<UIState>((set, get) => ({
  sidebarMode: 'sessions',
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  toggleSidebarMode: () =>
    set((state) => ({ sidebarMode: state.sidebarMode === 'sessions' ? 'settings' : 'sessions' })),

  sidebarCollapsed: initial.sidebarCollapsed,
  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    persistUI(get().shellFlavor, collapsed, get().autoReconnectOnOpen, get().sidebarWidth);
  },
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    persistUI(get().shellFlavor, next, get().autoReconnectOnOpen, get().sidebarWidth);
  },

  sidebarWidth: initial.sidebarWidth,
  setSidebarWidth: (w) => {
    const next = clampSidebarWidth(w);
    if (next === get().sidebarWidth) return;
    set({ sidebarWidth: next });
    persistUI(get().shellFlavor, get().sidebarCollapsed, get().autoReconnectOnOpen, next);
  },

  rightPaneOpen: false,
  setRightPaneOpen: (open) => set({ rightPaneOpen: open }),
  toggleRightPaneOpen: () => set((state) => ({ rightPaneOpen: !state.rightPaneOpen })),

  rightPaneContent: 'files',
  setRightPaneContent: (content) => set({ rightPaneContent: content }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  shellFlavor: initial.shellFlavor,
  setShellFlavor: (flavor) => {
    set({ shellFlavor: flavor });
    persistUI(flavor, get().sidebarCollapsed, get().autoReconnectOnOpen, get().sidebarWidth);
  },

  activeSettingsPage: null,
  setActiveSettingsPage: (page) => set({ activeSettingsPage: page }),

  autoReconnectOnOpen: initial.autoReconnectOnOpen,
  setAutoReconnectOnOpen: (v) => {
    set({ autoReconnectOnOpen: v });
    persistUI(get().shellFlavor, get().sidebarCollapsed, v, get().sidebarWidth);
  },

  terminalMode: false,
  setTerminalMode: (v) => set({ terminalMode: v }),
  toggleTerminalMode: () => set((state) => ({ terminalMode: !state.terminalMode })),

  // ==================== 手机端导航（P4） ====================

  mobileTab: 'sessions',
  setMobileTab: (tab) => {
    // 切换 Tab 时清空页面栈，避免跨 Tab 回进剫余页面
    set({ mobileTab: tab, mobileNavStack: [] });
  },

  mobileNavStack: [],
  pushMobilePage: (page) =>
    set((state) => ({ mobileNavStack: [...state.mobileNavStack, page] })),
  popMobilePage: () =>
    set((state) =>
      state.mobileNavStack.length === 0
        ? state
        : { mobileNavStack: state.mobileNavStack.slice(0, -1) },
    ),
  clearMobileStack: () => set({ mobileNavStack: [] }),
}));
