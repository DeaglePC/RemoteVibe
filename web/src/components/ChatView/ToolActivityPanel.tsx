import { useMemo, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import DiffViewerCard from '../Cards/DiffViewerCard';
import {
  buildToolActivityViewModel,
  type ToolActivityItem,
  type ToolActivityViewModel,
} from './toolActivityModel';

interface ToolActivityPanelContentProps {
  viewModel: ToolActivityViewModel;
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
 * ToolActivityPanel 将所有工具调用统一展示为独立 activity 面板。
 */
export default function ToolActivityPanel() {
  const toolCalls = useChatStore((state) => state.toolCalls);
  const pendingPermissions = useChatStore((state) => state.pendingPermissions);

  const viewModel = useMemo(() => {
    return buildToolActivityViewModel(toolCalls, pendingPermissions);
  }, [pendingPermissions, toolCalls]);

  if (viewModel.items.length === 0 && viewModel.summary.permissionCount === 0) {
    return null;
  }

  return <ToolActivityPanelContent viewModel={viewModel} />;
}

export function ToolActivityPanelContent({ viewModel }: ToolActivityPanelContentProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section
      aria-label="Tool activity"
      className="animate-fade-in-up mt-2"
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'color-mix(in srgb, var(--color-surface-0) 92%, var(--color-surface-1))',
          border: '1px solid color-mix(in srgb, var(--color-border) 72%, transparent)',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full px-3 py-2 flex flex-wrap items-center gap-2 justify-between cursor-pointer"
          style={{
            background: 'color-mix(in srgb, var(--color-surface-1) 86%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-border) 65%, transparent)',
            textAlign: 'left',
          }}
          aria-expanded={!collapsed}
        >
          <h3
            className="text-[0.72rem] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Tool activity
          </h3>

          <div className="flex items-center gap-1.5">
            <div className="flex flex-wrap gap-1.5 text-[0.65rem]">
              <SummaryBadge label={`${viewModel.summary.totalCount} total`} />
              {viewModel.summary.activeCount > 0 && (
                <SummaryBadge label={`${viewModel.summary.activeCount} active`} tone="active" />
              )}
              {viewModel.summary.completedCount > 0 && (
                <SummaryBadge label={`${viewModel.summary.completedCount} completed`} tone="success" />
              )}
              {viewModel.summary.failedCount > 0 && (
                <SummaryBadge label={`${viewModel.summary.failedCount} failed`} tone="danger" />
              )}
              {viewModel.summary.permissionCount > 0 && (
                <SummaryBadge label={`${viewModel.summary.permissionCount} approvals pending`} tone="warning" />
              )}
            </div>
            <span
              className="text-[0.65rem] ml-1"
              style={{ color: 'var(--color-text-muted)' }}
              aria-hidden="true"
            >
              {collapsed ? '▸' : '▾'}
            </span>
          </div>
        </button>

        {!collapsed && (
          <div className="px-2 py-2 space-y-1.5" style={{ maxHeight: '22rem', overflowY: 'auto' }}>
            {viewModel.items.map((item) => (
              <ToolActivityCard key={item.toolCallId} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ToolActivityCard({ item }: { item: ToolActivityItem }) {
  const [expanded, setExpanded] = useState(
    item.status === 'in_progress' || item.status === 'pending' || item.pendingPermissionCount > 0,
  );
  const tone = getStatusTone(item.status);
  const textEntries = (item.content || []).filter((content) => content.type === 'text' && content.text);
  const terminalEntries = (item.content || []).filter((content) => content.type === 'terminal' && content.text);
  const diffEntries = (item.content || []).filter((content) => content.type === 'diff');
  const locations = item.locations || [];
  const hasBody = textEntries.length > 0 || terminalEntries.length > 0 || locations.length > 0 || diffEntries.length > 0;

  return (
    <article
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--color-surface-0)',
        border: `1px solid ${tone.border}`,
        boxShadow: `inset 0 1px 0 ${tone.glow}`,
      }}
    >
      <button
        type="button"
        onClick={() => hasBody && setExpanded((v) => !v)}
        className="w-full px-3 py-1.5 flex items-center gap-2"
        style={{
          borderLeft: `3px solid ${tone.accent}`,
          cursor: hasBody ? 'pointer' : 'default',
          textAlign: 'left',
        }}
        aria-expanded={expanded}
      >
        <span className="text-sm" aria-hidden="true">{kindIcons[item.kind] || kindIcons.other}</span>
        <h4 className="text-[0.78rem] font-semibold truncate min-w-0 flex-1" style={{ color: 'var(--color-text-primary)' }}>
          {item.title}
        </h4>
        <Pill label={item.kind} tone="neutral" />
        <Pill label={formatStatus(item.status)} tone={tone.pillTone} />
        {item.pendingPermissionCount > 0 && (
          <Pill label={`${item.pendingPermissionCount}`} tone="warning" />
        )}
        {hasBody && (
          <span className="text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }} aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>

      {expanded && hasBody && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {item.hasDiff && <MetaChip label={`${diffEntries.length} diff`} />}
            {item.hasTerminal && <MetaChip label={`${terminalEntries.length} terminal`} />}
            {item.hasText && <MetaChip label={`${textEntries.length} note`} />}
            {locations.length > 0 && <MetaChip label={`${locations.length} location`} />}
          </div>

          {textEntries.length > 0 && (
            <div className="space-y-1.5">
              {textEntries.slice(0, 2).map((entry, index) => (
                <PreviewBlock
                  key={`text-${item.toolCallId}-${index}`}
                  label="Text"
                  value={entry.text || ''}
                />
              ))}
            </div>
          )}

          {terminalEntries.length > 0 && (
            <div className="space-y-1.5">
              {terminalEntries.slice(0, 2).map((entry, index) => (
                <PreviewBlock
                  key={`terminal-${item.toolCallId}-${index}`}
                  label="Terminal"
                  value={entry.text || ''}
                  tone="terminal"
                />
              ))}
            </div>
          )}

          {locations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {locations.map((location, index) => (
                <span
                  key={`${location.path}-${location.line || index}`}
                  className="text-[0.65rem] px-1.5 py-0.5 rounded-full"
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

          {diffEntries.length > 0 && (
            <div className="mt-1.5">
              {diffEntries.map((entry, index) => (
                <DiffViewerCard key={`${item.toolCallId}-diff-${index}`} content={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function SummaryBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'active' | 'success' | 'danger' | 'warning' }) {
  const palette = getBadgePalette(tone);
  return (
    <span
      className="text-[0.62rem] px-2 py-0.5 rounded-full font-medium"
      style={{
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      }}
    >
      {label}
    </span>
  );
}

function Pill({ label, tone }: { label: string; tone: 'neutral' | 'active' | 'success' | 'danger' | 'warning' }) {
  const palette = getBadgePalette(tone);
  return (
    <span
      className="text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium"
      style={{
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      }}
    >
      {label}
    </span>
  );
}

function MetaChip({ label }: { label: string }) {
  return (
    <span
      className="text-[0.6rem] px-1.5 py-0.5 rounded-full"
      style={{
        background: 'var(--color-surface-1)',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
      }}
    >
      {label}
    </span>
  );
}

function PreviewBlock({
  label,
  value,
  tone = 'text',
}: {
  label: string;
  value: string;
  tone?: 'text' | 'terminal';
}) {
  const isTerminal = tone === 'terminal';
  return (
    <div
      className="rounded-lg px-2.5 py-1.5"
      style={{
        background: isTerminal ? 'oklch(0.20 0.02 255 / 0.92)' : 'var(--color-surface-1)',
        border: `1px solid ${isTerminal ? 'oklch(0.55 0.15 255 / 0.35)' : 'var(--color-border)'}`,
      }}
    >
      <div
        className="text-[0.6rem] font-semibold uppercase tracking-[0.12em]"
        style={{ color: isTerminal ? 'oklch(0.82 0.08 255)' : 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <pre
        className="mt-0.5 text-[0.7rem] whitespace-pre-wrap break-all"
        style={{
          margin: 0,
          color: isTerminal ? 'oklch(0.92 0.02 255)' : 'var(--color-text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function formatStatus(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

function getStatusTone(status: string): {
  accent: string;
  border: string;
  glow: string;
  pillTone: 'active' | 'success' | 'danger' | 'warning';
} {
  switch (status) {
    case 'in_progress':
      return {
        accent: 'var(--color-accent-500)',
        border: 'oklch(0.70 0.16 260 / 0.35)',
        glow: 'oklch(0.70 0.16 260 / 0.10)',
        pillTone: 'active',
      };
    case 'completed':
      return {
        accent: 'var(--color-success)',
        border: 'oklch(0.72 0.18 155 / 0.30)',
        glow: 'oklch(0.72 0.18 155 / 0.08)',
        pillTone: 'success',
      };
    case 'failed':
      return {
        accent: 'var(--color-danger)',
        border: 'oklch(0.65 0.20 25 / 0.32)',
        glow: 'oklch(0.65 0.20 25 / 0.08)',
        pillTone: 'danger',
      };
    default:
      return {
        accent: 'var(--color-warning)',
        border: 'oklch(0.80 0.16 80 / 0.32)',
        glow: 'oklch(0.80 0.16 80 / 0.08)',
        pillTone: 'warning',
      };
  }
}

function getBadgePalette(tone: 'neutral' | 'active' | 'success' | 'danger' | 'warning') {
  switch (tone) {
    case 'active':
      return {
        background: 'oklch(0.70 0.16 260 / 0.12)',
        color: 'var(--color-accent-400)',
        border: 'oklch(0.70 0.16 260 / 0.28)',
      };
    case 'success':
      return {
        background: 'oklch(0.72 0.18 155 / 0.10)',
        color: 'var(--color-success)',
        border: 'oklch(0.72 0.18 155 / 0.26)',
      };
    case 'danger':
      return {
        background: 'oklch(0.65 0.20 25 / 0.10)',
        color: 'var(--color-danger)',
        border: 'oklch(0.65 0.20 25 / 0.26)',
      };
    case 'warning':
      return {
        background: 'oklch(0.80 0.16 80 / 0.14)',
        color: 'var(--color-warning)',
        border: 'oklch(0.80 0.16 80 / 0.30)',
      };
    default:
      return {
        background: 'var(--color-surface-1)',
        color: 'var(--color-text-secondary)',
        border: 'var(--color-border)',
      };
  }
}
