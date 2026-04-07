import type { PermissionRequestPayload } from '../../types/protocol';
import { useChatStore } from '../../stores/chatStore';

interface Props {
  request: PermissionRequestPayload;
  onRespond: (requestId: unknown, optionId: string) => void;
}

export default function CommandConfirmCard({ request, onRespond }: Props) {
  // Try to find the tool call for context
  const toolCalls = useChatStore((s) => s.toolCalls);
  const toolCall = toolCalls.get(request.toolCallId);

  const allowOption = request.options.find((o) => o.kind.startsWith('allow'));
  const rejectOption = request.options.find((o) => o.kind.startsWith('reject'));

  return (
    <div
      className="animate-fade-in-up rounded-xl overflow-hidden my-3"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-warning)',
        boxShadow: '0 0 20px oklch(0.80 0.16 80 / 0.15)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          background: 'linear-gradient(135deg, oklch(0.80 0.16 80 / 0.15), oklch(0.65 0.20 25 / 0.1))',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span className="text-lg">🔐</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>
          Authorization Required
        </span>
      </div>

      {/* Context */}
      {toolCall && (
        <div className="px-4 py-3">
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Tool: {toolCall.title}
          </div>
          {toolCall.content && toolCall.content.map((item, i) => {
            if (item.type === 'text' && item.text) {
              return (
                <div key={i} className="rounded-lg p-3 mt-2 text-sm"
                  style={{
                    background: 'var(--color-surface-0)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-accent-400)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                  {item.text}
                </div>
              );
            }
            if (item.type === 'diff') {
              return (
                <div key={i} className="rounded-lg p-3 mt-2 text-xs"
                  style={{
                    background: 'var(--color-surface-0)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                  <div style={{ color: 'var(--color-text-muted)' }}>📄 {item.path}</div>
                  {item.oldText && (
                    <div className="mt-1" style={{ color: 'var(--color-danger)' }}>
                      {item.oldText.split('\n').map((line, j) => (
                        <div key={j}>- {line}</div>
                      ))}
                    </div>
                  )}
                  {item.newText && (
                    <div className="mt-1" style={{ color: 'var(--color-success)' }}>
                      {item.newText.split('\n').map((line, j) => (
                        <div key={j}>+ {line}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* Actions */}
      <div
        className="flex gap-3 px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        {rejectOption && (
          <button
            onClick={() => onRespond(request.requestId, rejectOption.optionId)}
            className="flex-1 text-sm font-medium py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            style={{
              background: 'var(--color-surface-3)',
              color: 'var(--color-danger)',
              border: '1px solid var(--color-danger)',
            }}
          >
            ✕ Reject
          </button>
        )}
        {allowOption && (
          <button
            onClick={() => onRespond(request.requestId, allowOption.optionId)}
            className="flex-1 text-sm font-medium py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--color-success), oklch(0.60 0.16 155))',
              color: 'white',
              border: 'none',
            }}
          >
            ✓ Approve
          </button>
        )}
      </div>
    </div>
  );
}
