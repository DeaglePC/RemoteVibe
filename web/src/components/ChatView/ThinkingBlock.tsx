import { useState, useRef, useEffect } from 'react';

interface Props {
  content: string;
  isActive: boolean; // 是否正在思考中（用于动画效果）
}

/**
 * ThinkingBlock 展示 Agent 的实时思考/推理过程。
 * 思考中时自动展开并滚动到底部，完成后可折叠。
 */
export default function ThinkingBlock({ content, isActive }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // 思考中时自动滚动到最新内容
  useEffect(() => {
    if (isActive && isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isActive, isExpanded]);

  if (!content) {
    return null;
  }

  return (
    <div
      className="animate-fade-in-up flex justify-start py-1"
    >
      <div
        className="max-w-[92%] sm:max-w-[85%] rounded-2xl overflow-hidden"
        style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-1)',
        }}
      >
        {/* Header — 可点击展开/折叠 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors duration-150"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted)',
          }}
        >
          {/* 思考动画指示器 */}
          {isActive ? (
            <div className="flex gap-0.5 flex-shrink-0">
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'oklch(0.75 0.15 270)', animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'oklch(0.75 0.15 270)', animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'oklch(0.75 0.15 270)', animationDelay: '300ms' }} />
            </div>
          ) : (
            <span style={{ color: 'oklch(0.75 0.15 270)', fontSize: '0.75rem' }}>💭</span>
          )}

          <span className="text-xs font-medium" style={{ color: 'oklch(0.75 0.15 270)' }}>
            {isActive ? 'Thinking...' : 'Thought process'}
          </span>

          {/* 展开/折叠箭头 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="ml-auto transition-transform duration-200"
            style={{
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              opacity: 0.5,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Content — 可折叠区域 */}
        {isExpanded && (
          <div
            ref={contentRef}
            className="px-3 pb-2.5 overflow-y-auto"
            style={{
              maxHeight: '200px',
              fontSize: '0.75rem',
              lineHeight: '1.5',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              borderTop: '1px solid var(--color-border)',
              paddingTop: '0.5rem',
            }}
          >
            {content}
            {isActive && (
              <span
                className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse"
                style={{
                  background: 'oklch(0.75 0.15 270)',
                  verticalAlign: 'text-bottom',
                  borderRadius: '1px',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
