import { useState, useRef, useEffect } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  isThinking?: boolean;
  onCancel?: () => void;
}

export default function InputBar({ onSend, disabled, isThinking, onCancel }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="glass-strong px-4 py-3"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <div
        className="flex items-end gap-2 rounded-xl px-3 py-2 transition-all duration-200"
        style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Start an agent first...' : 'Type your message...'}
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

      {isThinking && (
        <div className="flex items-center gap-2 mt-2 ml-1">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Agent is thinking...</span>
        </div>
      )}
    </div>
  );
}
