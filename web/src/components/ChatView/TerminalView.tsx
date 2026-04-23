import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useTerminalWs } from '../../hooks/useTerminalWs';

/**
 * TerminalView 是终端模式下替代 ChatView 的主区域视图（PTY + xterm.js 版）。
 *
 * 架构：
 *  - xterm.js 负责完整的终端渲染：ANSI 颜色、光标、滚动缓冲、选区复制等
 *  - FitAddon 负责把 xterm 尺寸自适应到容器，并在 resize 时同步通知后端 PTY
 *  - WebLinksAddon 让输出里的 http(s) 链接可点击
 *  - useTerminalWs 是纯字节传输层：二进制帧双向透传 PTY 流，文本帧传控制消息
 *
 * UI 形态：
 *  - 顶部条：状态灯 + shell 信息 + Clear / 返回聊天
 *  - 中间：xterm 容器，填满剩余空间
 *  - 不再有单独的输入框：所有按键（包括 Enter / Tab / ↑↓ / Ctrl+C）直接进入 PTY
 */

interface Props {
  /** 工作目录，用作 PTY 的初始 cwd */
  cwd: string | null;
}

// xterm 主题，和项目暗色调保持协调（可以后面再精调到 CSS 变量）
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

export default function TerminalView({ cwd }: Props) {
  const terminalMode = useUIStore((s) => s.terminalMode);
  const setTerminalMode = useUIStore((s) => s.setTerminalMode);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);

  const effectiveCwd = cwd ?? activeWorkDir;

  // xterm 实例以 ref 维护，避免 React 重渲染重建
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // 当 xterm 还没实例化完成时，PTY 的二进制输出会先缓存到这里，实例化后一次 flush
  const pendingOutputRef = useRef<Uint8Array[]>([]);

  // 连接是否应当启用：组件挂载且处于终端模式
  const [wsHandlers] = useState(() => ({
    onData: (data: Uint8Array) => {
      const term = termRef.current;
      if (term) {
        term.write(data);
      } else {
        pendingOutputRef.current.push(data);
      }
    },
    onError: (msg: string) => {
      // 把服务端错误直接打印到终端上，最容易被用户看到
      termRef.current?.writeln(`\x1b[31m[server error] ${msg}\x1b[0m`);
    },
    onExit: (code: number) => {
      termRef.current?.writeln(`\r\n\x1b[90m[shell exited, code=${code}]\x1b[0m`);
    },
    onOpen: () => {
      // 连接打开后让 xterm 重新 fit 一次，立刻把当前尺寸同步给后端
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          // 容器尚未准备好时 fit 可能抛错，忽略
        }
      });
    },
  }));

  const { state, sendInput, sendResize } = useTerminalWs(
    terminalMode,
    wsHandlers,
    effectiveCwd ?? null,
  );

  // 创建 xterm 实例（仅一次）
  useLayoutEffect(() => {
    if (!containerRef.current || termRef.current) return;

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
    term.open(containerRef.current);

    // 把用户按键字节传给 WebSocket；注意这里走的是闭包里的 sendInputRef
    term.onData((data) => {
      sendInputRef.current(data);
    });

    // resize 时通知后端
    term.onResize(({ cols, rows }) => {
      sendResizeRef.current(cols, rows);
    });

    termRef.current = term;
    fitRef.current = fit;

    // flush 在 term 创建前堆积的 PTY 输出
    for (const chunk of pendingOutputRef.current) {
      term.write(chunk);
    }
    pendingOutputRef.current = [];

    // 首次 fit
    try {
      fit.fit();
    } catch {
      // 忽略
    }

    return () => {
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // 把 sendInput / sendResize 放进 ref，供 xterm 事件里取最新引用
  const sendInputRef = useRef(sendInput);
  const sendResizeRef = useRef(sendResize);
  useEffect(() => {
    sendInputRef.current = sendInput;
    sendResizeRef.current = sendResize;
  }, [sendInput, sendResize]);

  // 容器尺寸变化时自动 fit
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // 忽略
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // 进入终端模式时自动聚焦到 xterm
  useEffect(() => {
    if (terminalMode) {
      requestAnimationFrame(() => termRef.current?.focus());
    }
  }, [terminalMode]);

  const handleClear = () => {
    termRef.current?.clear();
  };

  const shellLabel = useMemo(() => {
    if (!state.connected) return state.statusText;
    if (state.shell) return state.shell;
    return state.statusText;
  }, [state]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        background: 'var(--color-surface-0)',
      }}
    >
      {/* 顶部条：状态 + cwd + 操作 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-1)',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        <span
          aria-label={state.connected ? '已连接' : '未连接'}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: state.connected ? 'oklch(0.7 0.15 160)' : 'var(--color-text-muted)',
          }}
        />
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Terminal</span>
        <span
          style={{
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={shellLabel}
        >
          {shellLabel}
        </span>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: 11,
          }}
          title="清空当前终端输出（仅本地，不影响 shell）"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setTerminalMode(false)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontSize: 11,
          }}
          title="退出终端模式，回到聊天"
        >
          返回聊天
        </button>
      </div>

      {/* xterm 容器：填满剩余空间 */}
      <div
        ref={containerRef}
        onClick={() => termRef.current?.focus()}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '6px 10px',
          background: xtermTheme.background,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
