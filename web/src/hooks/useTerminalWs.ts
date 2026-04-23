import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackendStore } from '../stores/backendStore';

/**
 * 终端通道的状态信息（PTY 版）。
 *
 * - connected：WebSocket 是否已打开
 * - shell：服务端实际启动的 shell 路径（由 hello 消息下发）
 * - statusText：最近一条状态/错误消息，用于 UI 顶栏显示
 */
export interface TerminalChannelState {
  connected: boolean;
  shell: string | null;
  statusText: string;
}

/** 外部（通常是 xterm 实例）通过这些回调订阅 PTY 字节流和生命周期事件。 */
export interface TerminalChannelHandlers {
  /** PTY 输出字节流（二进制帧），直接 feed 给 xterm.write */
  onData?: (data: Uint8Array) => void;
  /** shell 退出，附带退出码 */
  onExit?: (code: number) => void;
  /** 服务端错误（如 Windows 不支持、启动 shell 失败） */
  onError?: (message: string) => void;
  /** 连接打开时触发，通常用来下发初始 resize */
  onOpen?: () => void;
}

/**
 * useTerminalWs 维护终端模式下与 /ws/terminal 的 WebSocket 连接（PTY 版）。
 *
 * 设计为纯传输层：
 *  - 二进制帧：双向透传用户按键字节和 PTY 输出字节
 *  - 文本帧 JSON：控制消息（hello / resize / exit / error / ping / pong）
 *
 * 典型用法见 TerminalView.tsx：xterm 的 onData 接到 sendInput，
 * WebSocket 的 onData 回调调 xterm.write。
 *
 * 连接生命周期：
 *  - enabled=true 时自动 connect；false 时主动断开
 *  - 切换后端（activeBackendId 变化）自动重连
 *  - 组件卸载时自动清理
 */
export function useTerminalWs(
  enabled: boolean,
  handlers: TerminalChannelHandlers,
  initialCwd: string | null,
) {
  const wsRef = useRef<WebSocket | null>(null);

  // handlers 用 ref 保存避免 effect 依赖变化引起重连
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [state, setState] = useState<TerminalChannelState>({
    connected: false,
    shell: null,
    statusText: '正在连接…',
  });

  const activeBackendId = useBackendStore((s) => s.activeBackendId);

  /** 把用户按键字节发给服务端（走二进制帧）。 */
  const sendInput = useCallback((data: string | Uint8Array) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // 构造一块独立的、类型明确为 ArrayBuffer 的数据发出去。
    // 这里主动 new 一个 Uint8Array 再取 .buffer，避免 TS 对 SharedArrayBuffer 的严格校验。
    const src = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    ws.send(copy.buffer as ArrayBuffer);
  }, []);

  /** 通知服务端调整 PTY 窗口大小。 */
  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
    ws.send(JSON.stringify({ type: 'resize', cols: Math.floor(cols), rows: Math.floor(rows) }));
  }, []);

  // 连接管理：enabled 开关 + 后端切换
  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setState({ connected: false, shell: null, statusText: '已断开' });
      return;
    }

    const store = useBackendStore.getState();
    const active = store.getActiveBackend();

    // 基于 apiUrl 构造 /ws/terminal URL，复用 apiKey 作为 token（与 /ws 保持一致）
    // 同时把初始 cwd 作为 query 参数传给服务端，shell 启动时作为工作目录
    const cwdParam = initialCwd ? `&cwd=${encodeURIComponent(initialCwd)}` : '';
    let url: string;
    if (active?.apiUrl) {
      const parsed = new URL(active.apiUrl);
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = active.apiKey || '';
      url = `${protocol}//${parsed.host}/ws/terminal?token=${encodeURIComponent(token)}${cwdParam}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const token = localStorage.getItem('bmh_token') || '';
      url = `${protocol}//${host}/ws/terminal?token=${encodeURIComponent(token)}${cwdParam}`;
    }

    const ws = new WebSocket(url);
    // 重要：服务端用二进制帧传 PTY 字节，让浏览器直接给我们 ArrayBuffer，避免 Blob 异步读取
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // React StrictMode 双挂载或切换后端主动 close 时，抑制 onerror/onclose 的误报
    let suppressClose = false;

    setState((prev) => ({ ...prev, statusText: '正在连接…' }));

    ws.onopen = () => {
      setState((prev) => ({ ...prev, connected: true, statusText: '已连接，等待 shell…' }));
      handlersRef.current.onOpen?.();
    };

    ws.onclose = (event) => {
      if (suppressClose) {
        setState({ connected: false, shell: null, statusText: '已断开' });
        return;
      }
      const msg = `连接已断开（code=${event.code}${event.reason ? `, reason=${event.reason}` : ''}）`;
      setState({ connected: false, shell: null, statusText: msg });
    };

    ws.onerror = () => {
      if (suppressClose) return;
      setState((prev) => ({
        ...prev,
        statusText: '连接出错：请检查后端地址 / token / 平台是否支持终端',
      }));
    };

    ws.onmessage = (e) => {
      // 二进制帧 = PTY 输出，直接塞给 xterm
      if (e.data instanceof ArrayBuffer) {
        handlersRef.current.onData?.(new Uint8Array(e.data));
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
              setState((prev) => ({
                ...prev,
                shell: msg.shell ?? null,
                statusText: `shell=${msg.shell ?? '?'}${msg.cwd ? ` cwd=${msg.cwd}` : ''}`,
              }));
              break;
            case 'exit':
              handlersRef.current.onExit?.(msg.code ?? 0);
              setState((prev) => ({ ...prev, statusText: `shell 已退出（code=${msg.code ?? 0}）` }));
              break;
            case 'error':
              handlersRef.current.onError?.(msg.message ?? 'unknown error');
              setState((prev) => ({ ...prev, statusText: `❌ ${msg.message ?? 'unknown error'}` }));
              break;
            case 'pong':
              // 心跳，忽略
              break;
            default:
              break;
          }
        } catch {
          // 非 JSON 文本帧忽略
        }
      }
    };

    return () => {
      suppressClose = true;
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeBackendId, initialCwd]);

  return {
    state,
    sendInput,
    sendResize,
  };
}
