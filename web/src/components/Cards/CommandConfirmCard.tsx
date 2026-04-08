import type { PermissionRequestPayload, PermissionOption } from '../../types/protocol';
import { useChatStore } from '../../stores/chatStore';

interface Props {
  request: PermissionRequestPayload;
  onRespond: (requestId: unknown, optionId: string) => void;
}

/** 根据 option kind 返回对应的样式和图标 */
function getOptionStyle(option: PermissionOption): {
  icon: string;
  bg: string;
  color: string;
  border: string;
  hoverBg: string;
} {
  const { kind } = option;
  if (kind === 'allow_always') {
    return {
      icon: '✓✓',
      bg: 'linear-gradient(135deg, var(--color-success), oklch(0.55 0.18 155))',
      color: 'white',
      border: 'none',
      hoverBg: '',
    };
  }
  if (kind.startsWith('allow')) {
    return {
      icon: '✓',
      bg: 'var(--color-surface-3)',
      color: 'var(--color-success)',
      border: '1px solid var(--color-success)',
      hoverBg: 'oklch(0.72 0.18 155 / 0.1)',
    };
  }
  if (kind === 'reject_always') {
    return {
      icon: '✕✕',
      bg: 'var(--color-surface-3)',
      color: 'var(--color-danger)',
      border: '1px solid var(--color-danger)',
      hoverBg: 'oklch(0.65 0.20 25 / 0.1)',
    };
  }
  // reject_once 或其他 reject
  return {
    icon: '✕',
    bg: 'var(--color-surface-3)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    hoverBg: 'var(--color-surface-2)',
  };
}

/** 获取 kind 的中文/可读描述 */
function getKindDescription(kind: string): string {
  switch (kind) {
    case 'allow_once': return 'Allow this time';
    case 'allow_always': return 'Always allow';
    case 'reject_once': return 'Reject this time';
    case 'reject_always': return 'Always reject';
    default: return kind;
  }
}

export default function CommandConfirmCard({ request, onRespond }: Props) {
  // 尝试查找关联的 tool call 来获取操作上下文
  const toolCalls = useChatStore((s) => s.toolCalls);
  const toolCall = toolCalls.get(request.toolCallId);

  // 按 allow（绿色区域）和 reject（灰色/红色区域）分组
  const allowOptions = request.options.filter((o) => o.kind.startsWith('allow'));
  const rejectOptions = request.options.filter((o) => o.kind.startsWith('reject'));

  // 构建操作描述
  const actionDescription = toolCall
    ? `Agent wants to use tool: ${toolCall.title}`
    : 'Agent is requesting permission to perform an action';

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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-warning)' }}>
            Authorization Required
          </span>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            {actionDescription}
          </p>
        </div>
      </div>

      {/* Tool call 上下文详情 */}
      {toolCall && (
        <div className="px-4 py-3">
          {/* 工具类型标签 */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: 'var(--color-surface-3)',
                color: 'var(--color-accent-400)',
                border: '1px solid var(--color-border)',
              }}
            >
              {toolCall.kind || 'tool'}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {toolCall.title}
            </span>
          </div>

          {/* 工具内容（命令文本、代码变更等） */}
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
                    maxHeight: '200px',
                    overflow: 'auto',
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
                    maxHeight: '200px',
                    overflow: 'auto',
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

      {/* 没有 toolCall 上下文时，显示说明性文字 */}
      {!toolCall && (
        <div className="px-4 py-3">
          <div
            className="rounded-lg px-3 py-2.5 text-xs"
            style={{
              background: 'var(--color-surface-0)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span>ℹ️</span>
              <span className="font-medium">Pending action</span>
            </div>
            <p>
              The agent is requesting permission to proceed with an operation.
              Review the options below before responding.
            </p>
            {request.options.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="font-medium">Available options:</span>
                <ul className="mt-1 space-y-0.5">
                  {request.options.map((opt) => (
                    <li key={opt.optionId} className="flex items-center gap-1.5">
                      <span style={{ color: opt.kind.startsWith('allow') ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                        {opt.kind.startsWith('allow') ? '●' : '○'}
                      </span>
                      <span>{opt.name}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
                        ({getKindDescription(opt.kind)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions - 显示所有可用选项 */}
      <div
        className="px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        {/* Allow 选项组 */}
        {allowOptions.length > 0 && (
          <div className="flex gap-2 mb-2">
            {allowOptions.map((option) => {
              const style = getOptionStyle(option);
              return (
                <button
                  key={option.optionId}
                  onClick={() => onRespond(request.requestId, option.optionId)}
                  className="flex-1 text-sm font-medium py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  style={{
                    background: style.bg,
                    color: style.color,
                    border: style.border,
                  }}
                  title={getKindDescription(option.kind)}
                >
                  {style.icon} {option.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Reject 选项组 */}
        {rejectOptions.length > 0 && (
          <div className="flex gap-2">
            {rejectOptions.map((option) => {
              const style = getOptionStyle(option);
              return (
                <button
                  key={option.optionId}
                  onClick={() => onRespond(request.requestId, option.optionId)}
                  className="flex-1 text-xs font-medium py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  style={{
                    background: style.bg,
                    color: style.color,
                    border: style.border,
                  }}
                  title={getKindDescription(option.kind)}
                >
                  {style.icon} {option.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 如果 options 为空的兜底 */}
        {request.options.length === 0 && (
          <p className="text-xs text-center py-2" style={{ color: 'var(--color-text-muted)' }}>
            No actions available for this request.
          </p>
        )}
      </div>
    </div>
  );
}
