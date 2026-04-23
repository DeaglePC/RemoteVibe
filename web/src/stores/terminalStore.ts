import { create } from 'zustand';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useBackendStore } from './backendStore';

/**
 * 终端会话状态。
 *  - connecting：WebSocket 正在建立
 *  - connected：WebSocket 已打开（不代表 shell 已启动，需等 hello 消息）
 *  - ready：收到 hello，shell 已就绪
 *  - exited：shell 退出（code 记录退出码）
 *  - error：发生错误（WebSocket 层或服务端返回 error）
 *  - closed：用户主动关闭，会话已从列表移除前的短暂态
 */
export type TerminalSessionStatus = 'connecting' | 'connected' | 'ready' | 'exited' | 'error' | 'closed';

/**
 * TerminalSession 代表一个后台常驻的终端会话。
 *
 * 关键设计：
 *  - term / fit / ws 都是运行时对象，常驻内存，不随 React 组件挂卸生命周期销毁
 *  - hostEl 是 xterm 实例挂载的宿主 DOM（一个 div），切 tab 时我们把它 appendChild
 *    到可见容器，从而实现"DOM 复用"、保留屏幕/滚动/光标等完整状态
 *  - hasUnread 在会话非激活且有新输出时置 true，用于 tab 栏红点提示
 */
export interface TerminalSession {
  id: string;
  title: string;
  cwd: string | null;
  // 运行时对象
  term: Terminal;
  fit: FitAddon;
  hostEl: HTMLDivElement;
  /** xterm 是否已调用过 term.open(hostEl)；必须在 hostEl 挂进 DOM 后才能 open */
  opened: boolean;
  ws: WebSocket | null;
  // 状态
  status: TerminalSessionStatus;
  shell: string | null;
  statusText: string;
  exitCode: number | null;
  hasUnread: boolean;
  createdAt: number;
}

interface TerminalStoreState {
  /** 所有活跃会话，按创建时间升序 */
  sessions: TerminalSession[];
  /** 当前激活会话 ID，null 表示没有任何会话 */
  activeSessionId: string | null;

  /** 新建一个会话并立即尝试连接；返回新 session id */
  createSession: (cwd: string | null) => string;
  /** 关闭并销毁一个会话（真正释放 WS + xterm） */
  closeSession: (id: string) => void;
  /** 切换激活会话（并清空其未读标记） */
  setActiveSessionId: (id: string | null) => void;
  /** 往指定会话的 PTY 写入用户按键字节 */
  sendInput: (id: string, data: string | Uint8Array) => void;
  /** 通知指定会话的 PTY 调整窗口尺寸 */
  sendResize: (id: string, cols: number, rows: number) => void;
  /** 清除指定会话的未读标记 */
  clearUnread: (id: string) => void;
  /** 清空指定会话的本地屏幕缓冲（不影响 shell 进程） */
  clearScreen: (id: string) => void;
}

// ==================== xterm 主题（与暗色调协调） ====================

const xtermTheme = {
  background: '#0b0d10',
  foreground: '#e5e7eb',
  cursor: '#e5e7eb',
  cursorAccent: '#0b0d10',
  selectionBackground: '#334155aa',
  black: '#1f2937',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e7eb',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
};

// ==================== 工具函数 ====================

/** 生成简单的会话 id（时间戳 + 随机后缀） */
function genId(): string {
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 按当前会话数量生成默认标题，如 "Terminal 1" */
function genTitle(count: number): string {
  return `Terminal ${count + 1}`;
}

/**
 * 根据当前后端配置构造 /ws/terminal 的 WebSocket URL。
 * 复用 apiKey 作为 token（与 /ws 保持一致）；cwd 作为 query 参数传给后端。
 */
function buildWsUrl(cwd: string | null): string {
  const store = useBackendStore.getState();
  const active = store.getActiveBackend();
  const cwdParam = cwd ? `&cwd=${encodeURIComponent(cwd)}` : '';
  if (active?.apiUrl) {
    const parsed = new URL(active.apiUrl);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = active.apiKey || '';
    return `${protocol}//${parsed.host}/ws/terminal?token=${encodeURIComponent(token)}${cwdParam}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const token = localStorage.getItem('bmh_token') || '';
  return `${protocol}//${host}/ws/terminal?token=${encodeURIComponent(token)}${cwdParam}`;
}

/** 把 string / Uint8Array 统一封装成可发送的 ArrayBuffer。 */
function toArrayBuffer(data: string | Uint8Array): ArrayBuffer {
  const src = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy.buffer as ArrayBuffer;
}

// ==================== Store 实现 ====================

/**
 * 全局终端会话 store：
 *  - 承载所有会话的生命周期，WS 和 xterm 实例都挂在这里，不随 UI 挂卸而销毁
 *  - UI 层（TerminalView）只负责把 session.hostEl 挂到可见容器里渲染
 */
export const useTerminalStore = create<TerminalStoreState>((set, get) => {
  // 内部工具：原地修改 session 对象的字段，然后浅复制 sessions 数组触发订阅更新。
  //
  // ⚠️ 关键设计：不能用 { ...s, ...patch } 生成"新 session 对象"，原因是：
  //   - session 里有 ws / term / fit / hostEl / opened 等运行时字段
  //   - connect() 闭包、onData() 闭包持有的是创建时的旧 session 引用
  //   - 如果 spread 复制生成新对象，闭包里的 `session.ws = ws` 赋值永远打不到
  //     store 里的当前 session 上，导致 sendInput 时 findSession().ws === null
  //     → 表现为"终端无法输入"
  // 所以这里坚持 mutation：仅 sessions 数组做浅复制，session 对象引用保持稳定。
  const patchSession = (id: string, patch: Partial<TerminalSession>): void => {
    set((state) => {
      const target = state.sessions.find((s) => s.id === id);
      if (!target) return state;
      Object.assign(target, patch);
      return { sessions: [...state.sessions] };
    });
  };

  // 内部工具：查找会话
  const findSession = (id: string): TerminalSession | undefined => {
    return get().sessions.find((s) => s.id === id);
  };

  // 内部工具：给指定会话建立 WS 连接并挂好事件
  const connect = (session: TerminalSession): void => {
    const url = buildWsUrl(session.cwd);
    patchSession(session.id, { status: 'connecting', statusText: '正在连接…' });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      session.term.writeln(`\x1b[31m[connect error] ${msg}\x1b[0m`);
      patchSession(session.id, { status: 'error', statusText: `连接失败：${msg}` });
      return;
    }
    ws.binaryType = 'arraybuffer';
    session.ws = ws;

    ws.onopen = () => {
      patchSession(session.id, { status: 'connected', statusText: '已连接，等待 shell…' });
      // 连接打开后立刻 fit 一次，把前端尺寸同步给 PTY
      requestAnimationFrame(() => {
        try {
          session.fit.fit();
        } catch {
          // 容器尚未可见时 fit 会抛错，忽略
        }
      });
    };

    ws.onclose = (event) => {
      const current = findSession(session.id);
      if (!current) return;
      // 若已 exited，就保持 exited 状态文案更贴切；否则标记为 error/closed
      if (current.status === 'exited') {
        return;
      }
      const msg = `连接已断开（code=${event.code}${event.reason ? `, reason=${event.reason}` : ''}）`;
      patchSession(session.id, {
        status: 'error',
        statusText: msg,
      });
    };

    ws.onerror = () => {
      patchSession(session.id, {
        status: 'error',
        statusText: '连接出错：请检查后端地址 / token / 平台是否支持终端',
      });
    };

    ws.onmessage = (e) => {
      // 二进制帧 = PTY 输出
      if (e.data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(e.data);
        session.term.write(bytes);
        // 非激活会话有新输出 → 标记未读
        const activeId = get().activeSessionId;
        if (activeId !== session.id && !session.hasUnread) {
          patchSession(session.id, { hasUnread: true });
        }
        return;
      }

      // 文本帧 = 控制消息
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data) as {
            type: string;
            shell?: string;
            cwd?: string;
            code?: number;
            message?: string;
          };
          switch (msg.type) {
            case 'hello':
              patchSession(session.id, {
                status: 'ready',
                shell: msg.shell ?? null,
                statusText: `shell=${msg.shell ?? '?'}${msg.cwd ? ` cwd=${msg.cwd}` : ''}`,
              });
              break;
            case 'exit':
              session.term.writeln(`\r\n\x1b[90m[shell exited, code=${msg.code ?? 0}]\x1b[0m`);
              patchSession(session.id, {
                status: 'exited',
                exitCode: msg.code ?? 0,
                statusText: `shell 已退出（code=${msg.code ?? 0}）`,
              });
              break;
            case 'error':
              session.term.writeln(`\x1b[31m[server error] ${msg.message ?? ''}\x1b[0m`);
              patchSession(session.id, {
                status: 'error',
                statusText: `❌ ${msg.message ?? 'unknown error'}`,
              });
              break;
            default:
              break;
          }
        } catch {
          // 非 JSON 文本帧忽略
        }
      }
    };
  };

  return {
    sessions: [],
    activeSessionId: null,

    createSession: (cwd) => {
      const id = genId();

      // 创建宿主 div（先不挂到 DOM 树，由 UI 层切 tab 时 appendChild）
      const hostEl = document.createElement('div');
      hostEl.style.width = '100%';
      hostEl.style.height = '100%';

      const term = new Terminal({
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.25,
        cursorBlink: true,
        convertEol: false,
        scrollback: 5000,
        theme: xtermTheme,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);

      // 注意：不在此处 term.open(hostEl)！因为此时 hostEl 是游离节点，
      // xterm 在游离节点上 open 会导致字体度量失败、键盘事件失效等问题。
      // UI 层（TerminalView）把 hostEl 挂进可见容器后，会再触发 ensureOpened。

      const currentCount = get().sessions.length;
      const session: TerminalSession = {
        id,
        title: genTitle(currentCount),
        cwd,
        term,
        fit,
        hostEl,
        opened: false,
        ws: null,
        status: 'connecting',
        shell: null,
        statusText: '准备中…',
        exitCode: null,
        hasUnread: false,
        createdAt: Date.now(),
      };

      // 用户输入 → 发给 WS
      term.onData((data) => {
        get().sendInput(id, data);
      });
      // xterm 尺寸变化 → 通知 PTY
      term.onResize(({ cols, rows }) => {
        get().sendResize(id, cols, rows);
      });

      set((state) => ({
        sessions: [...state.sessions, session],
        activeSessionId: id,
      }));

      // 异步连接，避免阻塞 createSession 调用方
      queueMicrotask(() => connect(session));

      return id;
    },

    closeSession: (id) => {
      const session = findSession(id);
      if (!session) return;

      // 关闭 WS
      if (session.ws) {
        try {
          session.ws.close();
        } catch {
          // 忽略关闭异常
        }
        session.ws = null;
      }
      // 从 DOM 拆下宿主（如果仍挂着）
      if (session.hostEl.parentNode) {
        session.hostEl.parentNode.removeChild(session.hostEl);
      }
      // dispose xterm，释放 canvas / WebGL 等资源
      try {
        session.term.dispose();
      } catch {
        // 忽略重复 dispose
      }

      set((state) => {
        const nextSessions = state.sessions.filter((s) => s.id !== id);
        let nextActive = state.activeSessionId;
        if (nextActive === id) {
          // 激活会话被关闭 → 切到最近的一个；没有则置空
          nextActive = nextSessions.length > 0 ? nextSessions[nextSessions.length - 1].id : null;
        }
        return { sessions: nextSessions, activeSessionId: nextActive };
      });
    },

    setActiveSessionId: (id) => {
      set({ activeSessionId: id });
      if (id) {
        // 切到某个 tab 时自动清空它的未读标记
        patchSession(id, { hasUnread: false });
      }
    },

    sendInput: (id, data) => {
      const session = findSession(id);
      if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
      session.ws.send(toArrayBuffer(data));
    },

    sendResize: (id, cols, rows) => {
      const session = findSession(id);
      if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
      session.ws.send(
        JSON.stringify({ type: 'resize', cols: Math.floor(cols), rows: Math.floor(rows) }),
      );
    },

    clearUnread: (id) => {
      patchSession(id, { hasUnread: false });
    },

    clearScreen: (id) => {
      const session = findSession(id);
      if (!session) return;
      session.term.clear();
    },
  };
});
