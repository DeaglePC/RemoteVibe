import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommandDef } from './types';
import { scoreCommand } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  commands: CommandDef[];
}

/**
 * Command Palette（Cmd+K）弹窗（方案 §4.5）。
 *
 * 使用要点：
 *  - 打开时自动聚焦输入框，并重置查询；
 *  - 支持 ↑ / ↓ / Enter / Esc；
 *  - 命令按 scoreCommand 评分降序排列；
 *  - 查询为空时展示全部命令。
 *
 * 视觉：居中弹出，600px 宽，毛玻璃背景。
 */
export default function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // React 19 官方推荐的"响应 props 变化重置内部状态"模式：
  // 用 state 记录上一次的 open，然后在 render 期比较并派发新 state。
  // 这样既避开 react-hooks/set-state-in-effect，也避开 react-hooks 的
  // "Cannot access refs during render" 限制。
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  // 打开后下一帧聚焦输入框
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 过滤 + 排序命令
  const filtered = useMemo(() => {
    return commands
      .map((c) => ({ cmd: c, score: scoreCommand(c, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.cmd);
  }, [commands, query]);

  // 有效选中索引：filtered 变化时不改 state，而在使用时 clamp。
  // 这样避免在 effect 中 setState，也不会因为"归 0"后又被选中变化覆盖。
  const effectiveIndex =
    filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1);

  // 选中项滚入视野（仅 DOM 操作，不涉及 setState）
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-cmd-item]');
    const el = items[effectiveIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [effectiveIndex]);

  if (!open) return null;

  const runSelected = () => {
    const cmd = filtered[effectiveIndex];
    if (!cmd) return;
    onClose();
    // 关闭动画后再执行，避免跳转/focus 抢走当前 keydown 事件
    setTimeout(() => cmd.run(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 1000)' as unknown as number,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        background: 'oklch(0 0 0 / 0.45)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(600px, 92vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 16px 48px oklch(0 0 0 / 0.35)',
          overflow: 'hidden',
        }}
      >
        {/* 输入框 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span aria-hidden style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>
            ⌘
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令... (↑ ↓ 选择，Enter 执行，Esc 关闭)"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontSize: 14,
            }}
          />
        </div>

        {/* 命令列表 */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: 6,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                fontSize: 13,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
              }}
            >
              没有匹配的命令
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const active = idx === effectiveIndex;
              return (
                <div
                  key={cmd.id}
                  data-cmd-item
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    setSelectedIndex(idx);
                    runSelected();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    background: active ? 'var(--color-surface-2)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--color-text-primary)',
                    fontSize: 13,
                  }}
                >
                  <span
                    aria-hidden
                    style={{ width: 20, textAlign: 'center', fontSize: 14, flexShrink: 0 }}
                  >
                    {cmd.icon || '•'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cmd.title}
                    </div>
                    {cmd.subtitle && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-text-muted)',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cmd.subtitle}
                      </div>
                    )}
                  </span>
                  {cmd.shortcut && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        color: 'var(--color-text-muted)',
                        padding: '2px 6px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {cmd.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
