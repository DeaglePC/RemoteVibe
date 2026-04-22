import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Props {
  /** thought 段的纯文本内容（可能含 Markdown） */
  content: string;
  /** 同一条消息中 thought 段的序号，用于展示 `Thought #N` 标题 */
  index?: number;
  /** 同一条消息中 thought 段的总数，仅用于决定是否展示序号 */
  total?: number;
}

/**
 * CollapsibleThought 用于在 Agent 消息气泡中展示「已完成」的思考段落。
 *
 * 区别于 ThinkingBlock（实时 streaming 思考流）：
 * - 默认折叠（符合 Cursor / Claude 的通用约定，减少视觉干扰）
 * - 支持多段显示（一条消息里可能穿插多个 thought 片段）
 * - 内容按 Markdown 渲染
 */
export default function CollapsibleThought({ content, index, total }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) {
    return null;
  }

  const showIndex = typeof index === 'number' && typeof total === 'number' && total > 1;
  const title = showIndex ? `Thought #${index! + 1}` : 'Thought';

  return (
    <div
      className="my-1 rounded-2xl overflow-hidden"
      style={{
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
      }}
    >
      {/* 头部 —— 可点击展开/折叠 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors duration-150"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted)',
        }}
      >
        <span style={{ color: 'oklch(0.75 0.15 270)', fontSize: '0.75rem' }}>💭</span>
        <span className="text-xs font-medium" style={{ color: 'oklch(0.75 0.15 270)' }}>
          {title}
        </span>
        <span
          className="text-[0.65rem]"
          style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}
        >
          {isExpanded ? 'Click to collapse' : 'Click to expand'}
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

      {/* 内容 —— 可折叠区域 */}
      {isExpanded && (
        <div
          className="markdown-body px-3 pb-2.5 overflow-y-auto"
          style={{
            maxHeight: '320px',
            fontSize: '0.8125rem',
            lineHeight: '1.55',
            color: 'var(--color-text-secondary)',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '0.5rem',
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
