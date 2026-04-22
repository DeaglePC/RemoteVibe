import { useState } from 'react';
import type { ToolActivityItem } from './toolActivityModel';
import DiffViewerCard from '../Cards/DiffViewerCard';

interface Props {
  item: ToolActivityItem;
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

/**
 * InlineToolCall 渲染嵌入在 Agent 气泡之后的单条工具调用。
 * 类 Cursor 的紧凑单行展示：icon + 标题 + 状态，点击可展开详细内容。
 */
export default function InlineToolCall({ item }: Props) {
  const tone = getStatusTone(item.status);
  const isActive = item.status === 'pending' || item.status === 'in_progress';
  const hasPermission = item.pendingPermissionCount > 0;

  const textEntries = (item.content || []).filter((content) => content.type === 'text' && content.text);
  const terminalEntries = (item.content || []).filter((content) => content.type === 'terminal' && content.text);
  const diffEntries = (item.content || []).filter((content) => content.type === 'diff');
  const locations = item.locations || [];
  const hasBody = textEntries.length > 0 || terminalEntries.length > 0 || locations.length > 0 || diffEntries.length > 0;

  // 初始展开策略：活跃中 / 失败 / 待授权 自动展开，其余折叠
  const [expanded, setExpanded] = useState(isActive || hasPermission || item.status === 'failed');

  return (
    <div
      className="animate-fade-in-up rounded-lg overflow-hidden my-1"
      style={{
        background: 'var(--color-surface-0)',
        border: `1px solid ${tone.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => hasBody && setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5"
        style={{
          borderLeft: `3px solid ${tone.accent}`,
          cursor: hasBody ? 'pointer' : 'default',
          textAlign: 'left',
          background: 'transparent',
        }}
        aria-expanded={expanded}
      >
        <span className="text-[0.85rem] flex-shrink-0" aria-hidden="true">
          {kindIcons[item.kind] || kindIcons.other}
        </span>
        <span
          className="text-[0.78rem] font-medium truncate min-w-0 flex-1"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {item.title}
        </span>

        {isActive && (
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
            style={{ background: tone.accent }}
            aria-hidden="true"
          />
        )}

        <span
          className="text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{
            background: tone.badgeBg,
            color: tone.badgeColor,
            border: `1px solid ${tone.badgeBorder}`,
          }}
        >
          {formatStatus(item.status)}
        </span>

        {hasPermission && (
          <span
            className="text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{
              background: 'oklch(0.80 0.16 80 / 0.14)',
              color: 'var(--color-warning)',
              border: '1px solid oklch(0.80 0.16 80 / 0.30)',
            }}
            title={`${item.pendingPermissionCount} approval pending`}
          >
            ⏳ {item.pendingPermissionCount}
          </span>
        )}

        {hasBody && (
          <span
            className="text-[0.65rem] flex-shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            aria-hidden="true"
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>

      {expanded && hasBody && (
        <div className="px-2.5 pb-2">
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {locations.map((location, index) => (
                <span
                  key={`${location.path}-${location.line || index}`}
                  className="text-[0.65rem] px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--color-surface-1)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  title={`${location.path}${location.line ? `:${location.line}` : ''}`}
                >
                  {location.path}
                  {location.line ? `:${location.line}` : ''}
                </span>
              ))}
            </div>
          )}

          {textEntries.length > 0 && (
            <div className="space-y-1">
              {textEntries.slice(0, 3).map((entry, index) => (
                <PreviewBlock
                  key={`text-${item.toolCallId}-${index}`}
                  value={entry.text || ''}
                />
              ))}
            </div>
          )}

          {terminalEntries.length > 0 && (
            <div className="space-y-1 mt-1">
              {terminalEntries.slice(0, 3).map((entry, index) => (
                <PreviewBlock
                  key={`terminal-${item.toolCallId}-${index}`}
                  value={entry.text || ''}
                  tone="terminal"
                />
              ))}
            </div>
          )}

          {diffEntries.length > 0 && (
            <div className="mt-1.5">
              {diffEntries.map((entry, index) => (
                <DiffViewerCard key={`${item.toolCallId}-diff-${index}`} content={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ value, tone = 'text' }: { value: string; tone?: 'text' | 'terminal' }) {
  const isTerminal = tone === 'terminal';
  return (
    <pre
      className="text-[0.7rem] rounded-md px-2 py-1.5 m-0 whitespace-pre-wrap break-all"
      style={{
        background: isTerminal ? 'oklch(0.20 0.02 255 / 0.92)' : 'var(--color-surface-1)',
        color: isTerminal ? 'oklch(0.92 0.02 255)' : 'var(--color-text-secondary)',
        border: `1px solid ${isTerminal ? 'oklch(0.55 0.15 255 / 0.35)' : 'var(--color-border)'}`,
        fontFamily: 'var(--font-mono)',
        maxHeight: '12rem',
        overflowY: 'auto',
      }}
    >
      {value}
    </pre>
  );
}

function formatStatus(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

interface StatusTone {
  accent: string;
  border: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
}

function getStatusTone(status: string): StatusTone {
  switch (status) {
    case 'in_progress':
      return {
        accent: 'var(--color-accent-500)',
        border: 'oklch(0.70 0.16 260 / 0.28)',
        badgeBg: 'oklch(0.70 0.16 260 / 0.12)',
        badgeColor: 'var(--color-accent-400)',
        badgeBorder: 'oklch(0.70 0.16 260 / 0.28)',
      };
    case 'completed':
      return {
        accent: 'var(--color-success)',
        border: 'oklch(0.72 0.18 155 / 0.24)',
        badgeBg: 'oklch(0.72 0.18 155 / 0.10)',
        badgeColor: 'var(--color-success)',
        badgeBorder: 'oklch(0.72 0.18 155 / 0.26)',
      };
    case 'failed':
      return {
        accent: 'var(--color-danger)',
        border: 'oklch(0.65 0.20 25 / 0.30)',
        badgeBg: 'oklch(0.65 0.20 25 / 0.10)',
        badgeColor: 'var(--color-danger)',
        badgeBorder: 'oklch(0.65 0.20 25 / 0.26)',
      };
    default:
      return {
        accent: 'var(--color-warning)',
        border: 'oklch(0.80 0.16 80 / 0.28)',
        badgeBg: 'oklch(0.80 0.16 80 / 0.14)',
        badgeColor: 'var(--color-warning)',
        badgeBorder: 'oklch(0.80 0.16 80 / 0.30)',
      };
  }
}
