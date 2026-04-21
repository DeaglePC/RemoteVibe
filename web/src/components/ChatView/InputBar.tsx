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

      <div
        className="flex items-end gap-2 rounded-2xl px-3 py-2.5 transition-all duration-200"
        style={{
          background: 'var(--color-surface-1)',
          border: `1px solid ${showCommands ? 'var(--color-accent-500)' : 'var(--color-border)'}`,
        }}
      >
        {/* 左侧工具按钮 */}
        <div className="flex items-center gap-0.5 pb-1 shrink-0">
          <button
            className="p-2 rounded-xl transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer"
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
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Start an agent first...' : '输入消息...'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none outline-none text-[0.9375rem] min-h-[24px] disabled:opacity-40 py-1.5"
          style={{
            background: 'transparent',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            lineHeight: '1.5',
          }}
        />

        <div className="flex items-center gap-1 pb-1 shrink-0">
          {isThinking && onCancel && (
            <button
              onClick={onCancel}
              className="p-2 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
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

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className="p-2 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: text.trim() && !disabled
                ? 'var(--color-text-primary)'
                : 'transparent',
              color: text.trim() && !disabled
                ? 'var(--color-surface-0)'
                : 'var(--color-text-muted)',
              border: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
