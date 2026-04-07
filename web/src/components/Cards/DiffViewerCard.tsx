import { useMemo } from 'react';
import { diffLines, type Change } from 'diff';
import type { ToolCallContent } from '../../types/protocol';

interface Props {
  content: ToolCallContent;
}

export default function DiffViewerCard({ content }: Props) {
  const changes = useMemo(() => {
    if (!content.oldText && !content.newText) return [];
    return diffLines(content.oldText || '', content.newText || '');
  }, [content.oldText, content.newText]);

  const stats = useMemo(() => {
    let added = 0, removed = 0;
    changes.forEach((c) => {
      const lines = c.value.split('\n').filter(Boolean).length;
      if (c.added) added += lines;
      if (c.removed) removed += lines;
    });
    return { added, removed };
  }, [changes]);

  return (
    <div
      className="animate-fade-in-up rounded-xl overflow-hidden my-3"
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          background: 'var(--color-surface-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📝</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
            {content.path || 'unknown file'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {stats.added > 0 && (
            <span style={{ color: 'var(--color-success)' }}>+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span style={{ color: 'var(--color-danger)' }}>-{stats.removed}</span>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto">
        <pre className="text-xs leading-relaxed m-0 p-0" style={{ fontFamily: 'var(--font-mono)' }}>
          {changes.map((change, i) => (
            <DiffBlock key={i} change={change} />
          ))}
        </pre>
      </div>
    </div>
  );
}

function DiffBlock({ change }: { change: Change }) {
  const lines = change.value.split('\n');
  // Remove trailing empty line from split
  if (lines[lines.length - 1] === '') lines.pop();

  const bg = change.added
    ? 'oklch(0.72 0.18 155 / 0.08)'
    : change.removed
      ? 'oklch(0.65 0.20 25 / 0.08)'
      : 'transparent';

  const borderColor = change.added
    ? 'var(--color-success)'
    : change.removed
      ? 'var(--color-danger)'
      : 'transparent';

  const textColor = change.added
    ? 'var(--color-success)'
    : change.removed
      ? 'var(--color-danger)'
      : 'var(--color-text-secondary)';

  const prefix = change.added ? '+' : change.removed ? '-' : ' ';

  return (
    <>
      {lines.map((line, j) => (
        <div
          key={j}
          className="px-4 py-0.5"
          style={{
            background: bg,
            borderLeft: `3px solid ${borderColor}`,
            color: textColor,
          }}
        >
          <span style={{ color: 'var(--color-text-muted)', userSelect: 'none', marginRight: '0.75em' }}>
            {prefix}
          </span>
          {line || '\u00A0'}
        </div>
      ))}
    </>
  );
}
