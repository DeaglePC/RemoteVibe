import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatMessage } from '../../stores/chatStore';

interface Props {
  message: ChatMessage;
  index: number;
}

const EMOJI_REGEX = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\s+)(.*)$/u;

/**
 * 从系统消息内容中提取前置 emoji 图标和剩余文本。
 */
function parseSystemContent(content: string): { icon: string | null; text: string } {
  const match = EMOJI_REGEX.exec(content);
  if (match) {
    return { icon: match[1], text: match[3] || '' };
  }
  return { icon: null, text: content };
}

export default function MessageBubble({ message, index }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    const { icon, text } = parseSystemContent(message.content);
    return (
      <div
        className="animate-fade-in-up flex justify-center py-2"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <div
          className="inline-flex items-center gap-1.5 text-[0.72rem] px-3 py-1.5 rounded-lg max-w-[85%]"
          style={{
            background: 'var(--color-surface-1)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          {icon && <span className="text-xs flex-shrink-0">{icon}</span>}
          <span className="truncate">{text}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`animate-fade-in-up flex ${isUser ? 'justify-end' : 'justify-start'} py-1`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div
        className={`max-w-[92%] sm:max-w-[85%] ${isUser ? 'rounded-2xl rounded-br-sm px-4 py-2' : 'px-1 py-1'}`}
        style={{
          background: isUser ? 'var(--color-surface-3)' : 'transparent',
          color: 'var(--color-text-primary)',
        }}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="markdown-body text-[0.9375rem] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: '0.75em 0',
                          borderRadius: '0.75rem',
                          fontSize: '0.82em',
                        }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        <div
          className="text-right mt-1 opacity-0 hover:opacity-100 transition-opacity duration-200"
          style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
