import { useChatStore } from '../../stores/chatStore';

/**
 * TurnStatsBar 在 Agent turn 结束后展示统计信息。
 * 包括 token 用量、耗时、模型名等，以紧凑的指标条形式展现。
 */
export default function TurnStatsBar() {
  const stats = useChatStore((s) => s.lastTurnStats);

  if (!stats) {
    return null;
  }

  const durationSec = stats.durationMs ? (stats.durationMs / 1000).toFixed(1) : null;

  return (
    <div
      className="animate-fade-in-up flex justify-center py-1.5"
    >
      <div
        className="flex items-center gap-3 px-4 py-1.5 rounded-full text-xs"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
        }}
      >
        {/* 模型名 */}
        {stats.model && (
          <span
            className="font-medium"
            style={{ color: 'var(--color-accent-400)' }}
            title="Model"
          >
            {stats.model}
          </span>
        )}

        {/* 分隔符 */}
        {stats.model && <Dot />}

        {/* Token 用量 */}
        {stats.totalTokens !== undefined && stats.totalTokens > 0 && (
          <span title={`Input: ${formatNum(stats.inputTokens)} · Output: ${formatNum(stats.outputTokens)}${stats.cachedTokens ? ` · Cached: ${formatNum(stats.cachedTokens)}` : ''}`}>
            <TokenIcon />
            {' '}
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {formatNum(stats.totalTokens)}
            </span>
            <span style={{ color: 'var(--color-text-muted)', marginLeft: '2px' }}>
              ({formatNum(stats.inputTokens)}↓ {formatNum(stats.outputTokens)}↑)
            </span>
          </span>
        )}

        {/* 耗时 */}
        {durationSec && (
          <>
            <Dot />
            <span title="Duration">
              <ClockIcon />
              {' '}
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {durationSec}s
              </span>
            </span>
          </>
        )}

        {/* 工具调用次数 */}
        {stats.toolCalls !== undefined && stats.toolCalls > 0 && (
          <>
            <Dot />
            <span title="Tool calls">
              <ToolIcon />
              {' '}
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {stats.toolCalls}
              </span>
            </span>
          </>
        )}

        {/* Cached tokens */}
        {stats.cachedTokens !== undefined && stats.cachedTokens > 0 && (
          <>
            <Dot />
            <span
              title="Cached tokens"
              style={{ color: 'var(--color-success)' }}
            >
              ⚡ {formatNum(stats.cachedTokens)} cached
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** 格式化数字：1234 -> 1.2k */
function formatNum(n?: number): string {
  if (n === undefined || n === null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 分隔点 */
function Dot() {
  return (
    <span
      style={{
        width: '3px',
        height: '3px',
        borderRadius: '50%',
        background: 'var(--color-text-muted)',
        opacity: 0.4,
        flexShrink: 0,
      }}
    />
  );
}

/** Token 图标 (mini) */
function TokenIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline', verticalAlign: '-1px' }}>
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7.25 5v2.25H5v1.5h2.25V11h1.5V8.75H11v-1.5H8.75V5h-1.5z" />
    </svg>
  );
}

/** 时钟图标 (mini) */
function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'inline', verticalAlign: '-1px' }}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4v4l2.5 1.5" strokeLinecap="round" />
    </svg>
  );
}

/** 工具图标 (mini) */
function ToolIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'inline', verticalAlign: '-1px' }}>
      <path d="M14.7 3.3a1 1 0 00-1.4 0L10 6.6 9.4 6l3.3-3.3a1 1 0 00-1.4-1.4L8 4.6l-.6-.6a2 2 0 00-2.8 0L2 6.6 9.4 14l2.6-2.6a2 2 0 000-2.8l-.6-.6 3.3-3.3a1 1 0 000-1.4z" />
    </svg>
  );
}
