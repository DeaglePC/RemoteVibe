import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatMessage } from '../../stores/chatStore';

interface Props {
  message: ChatMessage;
  index: number;
}

export default function MessageBubble({ message, index }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div
        className="animate-fade-in-up flex justify-center py-2"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <div
          className="text-xs px-4 py-2 rounded-full max-w-[85%]"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`animate-fade-in-up flex ${isUser ? 'justify-end' : 'justify-start'} py-1.5`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div
        className={`max-w-[95%] sm:max-w-[88%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`}
        style={{
          background: isUser
            ? 'linear-gradient(135deg, var(--color-brand-600), var(--color-brand-500))'
            : 'var(--color-surface-2)',
          color: 'var(--color-text-primary)',
          border: isUser ? 'none' : '1px solid var(--color-border)',
        }}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="markdown-body text-sm">
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
                          margin: '0.5em 0',
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
          className="text-right mt-1"
          style={{ fontSize: '0.65rem', color: isUser ? 'rgba(255,255,255,0.5)' : 'var(--color-text-muted)' }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
