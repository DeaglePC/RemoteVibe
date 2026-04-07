import type { ToolCallPayload } from '../../types/protocol';

interface Props {
  toolCall: ToolCallPayload;
}

const kindIcons: Record<string, string> = {
  read: '📖',
  edit: '✏️',
  delete: '🗑️',
  execute: '⚡',
  search: '🔍',
  think: '🧠',
  fetch: '🌐',
  move: '📦',
  other: '🔧',
};

const statusColors: Record<string, string> = {
  pending: 'var(--color-warning)',
  in_progress: 'var(--color-accent-500)',
  completed: 'var(--color-success)',
  failed: 'var(--color-danger)',
};

export default function ToolCallCard({ toolCall }: Props) {
  const icon = kindIcons[toolCall.kind] || kindIcons.other;
  const statusColor = statusColors[toolCall.status] || 'var(--color-text-muted)';
  const isActive = toolCall.status === 'pending' || toolCall.status === 'in_progress';

  return (
    <div
      className={`animate-fade-in-up rounded-xl p-3 my-2 ${isActive ? 'animate-pulse-glow' : ''}`}
      style={{
        background: 'var(--color-surface-1)',
        border: `1px solid ${statusColor}33`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text-primary)' }}>
          {toolCall.title}
        </span>
        <div className="flex items-center gap-1.5">
          {isActive && (
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
          )}
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              background: `${statusColor}1a`,
              color: statusColor,
              border: `1px solid ${statusColor}33`,
            }}>
            {toolCall.status}
          </span>
        </div>
      </div>

      {/* Content */}
      {toolCall.content && toolCall.content.length > 0 && (
        <div className="mt-2 space-y-1">
          {toolCall.content.map((item, i) => {
            if (item.type === 'text' && item.text) {
              return (
                <div key={i} className="text-xs rounded-lg p-2"
                  style={{
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                  {item.text}
                </div>
              );
            }
            if (item.type === 'diff') {
              return (
                <div key={i} className="text-xs rounded-lg p-2"
                  style={{ background: 'var(--color-surface-2)', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ color: 'var(--color-text-muted)' }}>📄 {item.path}</div>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
