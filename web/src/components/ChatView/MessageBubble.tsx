import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ReactNode } from 'react';
import type { ChatMessage, ToolCallState } from '../../stores/chatStore';
import type { PermissionRequestPayload } from '../../types/protocol';
import InlineToolCall from './InlineToolCall';
import CollapsibleThought from './CollapsibleThought';
import { buildToolActivityItem } from './toolActivityModel';
import { extractThoughtSegments } from './thoughtExtractor';

interface Props {
  message: ChatMessage;
  index: number;
  /** 归属于该消息之后的工具调用（仅 Agent 气泡有效） */
  toolCalls?: ToolCallState[];
  /** 当前待处理的权限请求，用于给对应工具调用标记 badge */
  pendingPermissions?: PermissionRequestPayload[];
}

const EMOJI_REGEX = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\s+)(.*)$/us;

/**
 * 从系统消息内容中提取前置 emoji 图标和剩余文本。
 * 注意：使用 `s` flag 让 `.` 匹配换行，否则多行系统消息的图标解析会失败。
 */
function parseSystemContent(content: string): { icon: string | null; text: string } {
  const match = EMOJI_REGEX.exec(content);
  if (match) {
    return { icon: match[1], text: match[3] || '' };
  }
  return { icon: null, text: content };
}

/**
 * 判断系统消息是否需要"长内容卡片"样式。
 *
 * 仅在真正需要 Markdown 结构化渲染时才使用大卡片：
 * - 多行（含换行）
 * - 极长（> 160）
 * - 明确的 Markdown 结构（代码围栏 ``` / 列表项 / 粗体）
 *
 * 单个反引号包裹的 inline code（如 session id）不算富内容，
 * 继续走紧凑的 chip 样式，仅对反引号部分做轻量 code 渲染。
 */
function isRichSystemContent(text: string): boolean {
  if (text.includes('\n')) return true;
  if (text.length > 160) return true;
  if (text.includes('```')) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/^\s*[-*]\s+/m.test(text)) return true;
  return false;
}

/**
 * 把形如 `code` 的 inline code 片段渲染为带背景的 <code>，其它按纯文本输出。
 * 仅用于 chip 样式下，避免引入完整的 Markdown 渲染开销。
 */
function renderChipText(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1 py-[1px] rounded text-[0.68rem] font-mono"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MessageBubble({ message, index, toolCalls = [], pendingPermissions = [] }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    const { icon, text } = parseSystemContent(message.content);
    const isRich = isRichSystemContent(text);

    if (isRich) {
      // 长/多行/含 Markdown 的系统消息：用卡片 + Markdown 渲染，避免被 ellipsis 截断
      return (
        <div
          className="animate-fade-in-up flex justify-center py-2 px-2"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <div
            className="w-full max-w-[92%] sm:max-w-[85%] rounded-lg px-3.5 py-2.5"
            style={{
              background: 'var(--color-surface-1)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-start gap-2">
              {icon && (
                <span
                  aria-hidden
                  className="flex-shrink-0 leading-none"
                  style={{ fontSize: '1rem', marginTop: '0.15rem' }}
                >
                  {icon}
                </span>
              )}
              <div className="markdown-body text-[0.8125rem] leading-relaxed flex-1 min-w-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
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
                              borderRadius: '0.5rem',
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
                  {text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 短提示：紧凑 chip 样式（自适应宽度，支持 inline code）
    return (
      <div
        className="animate-fade-in-up flex justify-center py-0.5"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <div
          className="inline-flex items-center gap-1 text-[0.7rem] px-2 py-0.5 rounded-md max-w-[90%] leading-snug"
          style={{
            background: 'var(--color-surface-1)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}
        >
          {icon && <span className="text-[0.72rem] flex-shrink-0 leading-none">{icon}</span>}
          <span className="min-w-0 break-words">{renderChipText(text)}</span>
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
          <AgentMessageContent content={message.content} />
        )}

        {/* Agent 气泡下内嵌的工具调用列表（按时间顺序） */}
        {!isUser && toolCalls.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {toolCalls.map((toolCall) => (
              <InlineToolCall
                key={toolCall.toolCallId}
                item={buildToolActivityItem(toolCall, pendingPermissions)}
              />
            ))}
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

/**
 * AgentMessageContent 负责把 Agent 的 markdown 正文渲染出来，
 * 并自动把内容里形如 `[Thought: true]...[Thought: false]...` 的思考段落
 * 抽取成独立的、默认折叠的 Thought 卡片。
 */
function AgentMessageContent({ content }: { content: string }) {
  const { thoughts, answer } = extractThoughtSegments(content);

  return (
    <div className="markdown-body text-[0.9375rem] leading-relaxed">
      {thoughts.map((thought, idx) => (
        <CollapsibleThought
          key={`thought-${idx}`}
          content={thought}
          index={idx}
          total={thoughts.length}
        />
      ))}

      {answer && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
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
          {answer}
        </ReactMarkdown>
      )}
    </div>
  );
}
