import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { SLASH_COMMANDS } from '../../types/protocol';
import type { SlashCommand } from '../../types/protocol';

interface Props {
  onSend: (text: string) => void;
  onSlashCommand: (commandId: string) => void;
  disabled?: boolean;
  isThinking?: boolean;
  onCancel?: () => void;
}

/**
 * InputBar 是聊天输入框组件。
 * 支持：Enter 发送、Shift+Enter 换行、/ 命令模式下拉框、自动高度调整。
 */
export default function InputBar({ onSend, onSlashCommand, disabled, isThinking, onCancel }: Props) {
  const [text, setText] = useState('');
  const [selectedCommandIdx, setSelectedCommandIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  const filteredCommands = useMemo(() => {
    if (!text.startsWith('/')) {
      return [];
    }

    const query = text.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter((command) => {
      return command.name.toLowerCase().includes(query)
        || command.description.toLowerCase().includes(query);
    });
  }, [text]);

  const showCommands = filteredCommands.length > 0;
  const activeCommandIdx = showCommands
    ? Math.min(selectedCommandIdx, filteredCommands.length - 1)
    : 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [text]);

  const resetComposer = useCallback(() => {
    setText('');
    setSelectedCommandIdx(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText || disabled) {
      return;
    }

    if (showCommands && filteredCommands.length > 0) {
      const command = filteredCommands[activeCommandIdx];
      onSlashCommand(command.id);
      resetComposer();
      return;
    }

    const exactCommand = SLASH_COMMANDS.find((command) => command.name === trimmedText);
    if (exactCommand) {
      onSlashCommand(exactCommand.id);
      resetComposer();
      return;
    }

    onSend(trimmedText);
    resetComposer();
  }, [activeCommandIdx, disabled, filteredCommands, onSend, onSlashCommand, resetComposer, showCommands, text]);

  const selectCommand = useCallback((command: SlashCommand) => {
    onSlashCommand(command.id);
    resetComposer();
    textareaRef.current?.focus();
  }, [onSlashCommand, resetComposer]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (showCommands) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommandIdx((index) => Math.min(index + 1, filteredCommands.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommandIdx((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        if (filteredCommands.length > 0) {
          selectCommand(filteredCommands[activeCommandIdx]);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedCommandIdx(0);
        setText((value) => (value.startsWith('/') ? '/' : value));
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    setText(nextText);
    if (nextText.startsWith('/')) {
      setSelectedCommandIdx(0);
    }
  };

  useEffect(() => {
    if (commandListRef.current && showCommands) {
      const element = commandListRef.current.children[activeCommandIdx] as HTMLElement;
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeCommandIdx, showCommands]);

  return (
    <div
      className="glass-strong px-4 py-3 relative"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
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
            return filteredCommands.map((command, index) => {
              const showGroupHeader = command.group !== lastGroup;
              lastGroup = command.group;
              return (
                <div key={command.id}>
                  {showGroupHeader && (
                    <div
                      className="px-3 py-1"
                      style={{
                        color: 'var(--color-text-muted)',
                        background: 'var(--color-surface-0)',
                        borderTop: index > 0 ? '1px solid var(--color-border)' : 'none',
                        fontSize: '0.6rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {command.group}
                    </div>
                  )}
                  <button
                    onClick={() => selectCommand(command)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-100 cursor-pointer"
                    style={{
                      background: index === activeCommandIdx ? 'var(--color-surface-2)' : 'transparent',
                      border: 'none',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={() => setSelectedCommandIdx(index)}
                  >
                    <span className="text-base flex-shrink-0">{command.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-sm font-medium"
                          style={{
                            color: 'var(--color-accent-400)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {command.name}
                        </span>
                        {command.scope === 'agent' && command.webAction === 'prompt' && (
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
                        {command.scope === 'agent' && command.webAction !== 'prompt' && (
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
                        {command.description}
                      </div>
                    </div>
                  </button>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/*
        新布局（2026-04-22）：单个大圆角容器纵向排列
         ┌─────────────────────────────┐
         │ [textarea]                  │
         │                             │
         │ 📎 ⚙️ ⏹           ⬆ (send) │
         └─────────────────────────────┘
        - textarea 占满顶部
        - 底部工具条：左排小图标、右单个圆形发送按钮
      */}
      <div
        className="flex flex-col gap-2 rounded-3xl px-3 pt-3 pb-2 transition-all duration-200"
        style={{
          background: 'var(--color-surface-1)',
          border: `1px solid ${showCommands ? 'var(--color-accent-500)' : 'var(--color-border)'}`,
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Start an agent first...' : '输入消息...'}
          disabled={disabled}
          rows={1}
          className="w-full resize-none outline-none text-[0.9375rem] min-h-[24px] disabled:opacity-40 px-1"
          style={{
            background: 'transparent',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            lineHeight: '1.5',
          }}
        />

        {/* 底部工具条 */}
        <div className="flex items-center justify-between">
          {/* 左：📎 附件 / ⚙️ 斜杠命令 / ⏹ 取消 */}
          <div className="flex items-center gap-0.5">
            <button
              className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[color:var(--color-surface-2)] active:scale-95 cursor-pointer"
              style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
              title="Attach file"
              onClick={() => {
                const store = useChatStore.getState();
                store.addMessage({
                  id: `msg_${Date.now()}`,
                  role: 'system',
                  content: '📎 File upload will be available soon.',
                  timestamp: Date.now(),
                });
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <button
              type="button"
              className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[color:var(--color-surface-2)] active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
              title="斜杠命令"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                // 以 "/" 触发命令面板（复用现有 SLASH_COMMANDS 下拉）
                setText('/');
                // 下一帧聚焦到 textarea 末尾，方便继续输入
                requestAnimationFrame(() => {
                  const ta = textareaRef.current;
                  if (ta) {
                    ta.focus();
                    ta.setSelectionRange(1, 1);
                  }
                });
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {isThinking && onCancel && (
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg transition-all duration-150 hover:bg-[color:var(--color-surface-2)] active:scale-95 cursor-pointer"
                style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
                title="停止生成"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>

          {/* 右：圆形发送按钮 */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: text.trim() && !disabled
                ? 'var(--color-text-primary)'
                : 'var(--color-surface-3)',
              color: text.trim() && !disabled
                ? 'var(--color-surface-0)'
                : 'var(--color-text-muted)',
              border: 'none',
            }}
            title="发送 (Enter)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
