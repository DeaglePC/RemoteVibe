import { useState, useRef, useEffect, useCallback } from 'react';
import { SLASH_COMMANDS } from '../../types/protocol';
import type { SlashCommand } from '../../types/protocol';

interface Props {
  onSend: (text: string) => void;
  onSlashCommand: (commandId: string) => void;
  disabled?: boolean;
  isThinking?: boolean;
  onCancel?: () => void;
  agentActivity?: 'idle' | 'thinking' | 'streaming' | 'tool_calling';
}

/**
 * InputBar 是聊天输入框组件。
 * 支持：Enter 发送、Shift+Enter 换行、/ 命令模式下拉框、自动高度调整。
 */
export default function InputBar({ onSend, onSlashCommand, disabled, isThinking, onCancel, agentActivity = 'idle' }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash command state
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [selectedCommandIdx, setSelectedCommandIdx] = useState(0);
  const commandListRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, [text]);

  // 检测 / 命令输入
  useEffect(() => {
    if (text.startsWith('/')) {
      const query = text.slice(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(
        (cmd) => cmd.name.toLowerCase().includes(query) || cmd.description.toLowerCase().includes(query)
      );
      setFilteredCommands(filtered);
      setShowCommands(filtered.length > 0);
      setSelectedCommandIdx(0);
    } else {
      setShowCommands(false);
    }
  }, [text]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // 如果是斜杠命令
    if (showCommands && filteredCommands.length > 0) {
      const cmd = filteredCommands[selectedCommandIdx];
      onSlashCommand(cmd.id);
      setText('');
      setShowCommands(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    // 检查是否完全匹配一个命令
    const exactCmd = SLASH_COMMANDS.find((c) => c.name === trimmed);
    if (exactCmd) {
      onSlashCommand(exactCmd.id);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, showCommands, filteredCommands, selectedCommandIdx, onSend, onSlashCommand]);

  const selectCommand = useCallback((cmd: SlashCommand) => {
    onSlashCommand(cmd.id);
    setText('');
    setShowCommands(false);
    textareaRef.current?.focus();
  }, [onSlashCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 输入法正在组合中（选词/拼音阶段），不处理 Enter 等按键
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }

    // 命令面板导航
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          selectCommand(filteredCommands[selectedCommandIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    // Enter 发送 (Shift+Enter 换行)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 保持选中项在视图内
  useEffect(() => {
    if (commandListRef.current) {
      const el = commandListRef.current.children[selectedCommandIdx] as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedCommandIdx]);

  return (
    <div
      className="glass-strong px-4 py-3 relative"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      {/* Slash command dropdown */}
      {showCommands && (
        <div
          ref={commandListRef}
          className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 rounded-xl overflow-hidden animate-fade-in-up"
          style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 -8px 30px oklch(0 0 0 / 0.3)',
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Commands ({filteredCommands.length})
            </span>
          </div>
          {(() => {
            let lastGroup = '';
            return filteredCommands.map((cmd, i) => {
              const showGroupHeader = cmd.group !== lastGroup;
              lastGroup = cmd.group;
              return (
                <div key={cmd.id}>
                  {showGroupHeader && (
                    <div
                      className="px-3 py-1"
                      style={{
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-surface-0)',
                        borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                        fontSize: '0.6rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase' as const,
                        fontWeight: 600,
                      }}
                    >
                      {cmd.group}
                    </div>
                  )}
                  <button
                    onClick={() => selectCommand(cmd)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-100 cursor-pointer"
                    style={{
                      background: i === selectedCommandIdx ? 'var(--color-surface-2)' : 'transparent',
                      border: 'none',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={() => setSelectedCommandIdx(i)}
                  >
                    <span className="text-base flex-shrink-0">{cmd.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-accent-400)', fontFamily: 'var(--font-mono)' }}>
                          {cmd.name}
                        </span>
                        {cmd.scope === 'agent' && cmd.webAction === 'prompt' && (
                          <span
                            className="text-xs px-1 rounded"
                            style={{
                              background: 'oklch(0.55 0.15 160 / 0.2)',
                              color: 'oklch(0.75 0.15 160)',
                              fontSize: '0.55rem',
                            }}
                          >
                            PROMPT
                          </span>
                        )}
                        {cmd.scope === 'agent' && cmd.webAction !== 'prompt' && (
                          <span
                            className="text-xs px-1 rounded"
                            style={{
                              background: 'var(--color-surface-3)',
                              color: 'var(--color-text-muted)',
                              fontSize: '0.55rem',
                            }}
                          >
                            CLI
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {cmd.description}
                      </div>
                    </div>
                  </button>
                </div>
              );
            });
          })()}
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-xl px-3 py-2 transition-all duration-200"
        style={{
          background: 'var(--color-surface-2)',
          border: `1px solid ${showCommands ? 'var(--color-accent-500)' : 'var(--color-border)'}`,
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? 'Start an agent first...'
              : 'Type a message or / for commands... (Enter to send, Shift+Enter for newline)'
          }
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none outline-none text-sm min-h-[24px] disabled:opacity-40"
          style={{
            background: 'transparent',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            lineHeight: '1.5',
          }}
        />

        <div className="flex items-center gap-1.5 pb-0.5">
          {isThinking && onCancel && (
            <button
              onClick={onCancel}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
              style={{
                background: 'var(--color-danger)',
                color: 'white',
                border: 'none',
              }}
              title="Cancel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          )}

          {/* 发送按钮提示 */}
          <div className="text-xs hidden sm:block px-1" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
            ⏎
          </div>

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: text.trim() && !disabled
                ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))'
                : 'var(--color-surface-3)',
              color: 'white',
              border: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Status hints */}
      {isThinking && (
        <div className="flex items-center gap-2 mt-2 ml-1">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {agentActivity === 'streaming'
              ? 'Agent is responding...'
              : agentActivity === 'tool_calling'
                ? 'Agent is using tools...'
                : 'Agent is thinking...'}
          </span>
        </div>
      )}

      {!isThinking && !disabled && (
        <div className="hidden sm:flex items-center gap-3 mt-1.5 ml-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
            <kbd style={{ background: 'var(--color-surface-3)', padding: '0 4px', borderRadius: '3px' }}>Enter</kbd> send
            {' · '}
            <kbd style={{ background: 'var(--color-surface-3)', padding: '0 4px', borderRadius: '3px' }}>Shift+Enter</kbd> newline
            {' · '}
            <kbd style={{ background: 'var(--color-surface-3)', padding: '0 4px', borderRadius: '3px' }}>/</kbd> commands
          </span>
        </div>
      )}
    </div>
  );
}
