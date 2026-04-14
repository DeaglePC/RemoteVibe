import { useRef, useEffect, useState, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';

/**
 * ACPLogPanel 展示 ACP 协议的原始 JSON-RPC 通信日志。
 * 帮助用户了解 Gemini CLI 与 Gateway 之间的所有交互。
 */
export default function ACPLogPanel() {
  const acpLogs = useChatStore((s) => s.acpLogs);
  const clearACPLogs = useChatStore((s) => s.clearACPLogs);
  const setShowACPLogs = useChatStore((s) => s.setShowACPLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'tx' | 'rx'>('all');
  const [searchText, setSearchText] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [acpLogs, autoScroll]);

  const filteredLogs = useMemo(() => {
    return acpLogs.filter((log) => {
      if (filter !== 'all' && log.direction !== filter) return false;
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [acpLogs, filter, searchText]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-surface-0)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}
      >
        <span className="text-sm">📡</span>
        <span className="text-xs font-semibold flex-1" style={{ color: 'var(--color-text-primary)' }}>
          ACP Protocol Log
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {filteredLogs.length}/{acpLogs.length}
        </span>

        {/* Filter buttons */}
        <div className="flex gap-0.5 ml-2">
          {(['all', 'tx', 'rx'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2 py-0.5 rounded cursor-pointer transition-colors"
              style={{
                background: filter === f ? 'var(--color-accent-500)' : 'var(--color-surface-3)',
                color: filter === f ? 'white' : 'var(--color-text-secondary)',
                border: 'none',
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className="text-xs px-2 py-0.5 rounded cursor-pointer"
          style={{
            background: autoScroll ? 'var(--color-success)' : 'var(--color-surface-3)',
            color: autoScroll ? 'white' : 'var(--color-text-muted)',
            border: 'none',
          }}
          title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        >
          ⬇
        </button>

        {/* Clear */}
        <button
          onClick={clearACPLogs}
          className="text-xs px-2 py-0.5 rounded cursor-pointer"
          style={{
            background: 'var(--color-surface-3)',
            color: 'var(--color-text-muted)',
            border: 'none',
          }}
          title="Clear logs"
        >
          🗑
        </button>

        {/* Close */}
        <button
          onClick={() => setShowACPLogs(false)}
          className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
          style={{
            background: 'var(--color-surface-3)',
            color: 'var(--color-text-muted)',
            border: 'none',
          }}
          title="Close log panel"
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search logs..."
          className="w-full text-xs px-2 py-1 rounded"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
          }}
        />
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2">📡</div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {acpLogs.length === 0 ? 'No ACP messages yet.' : 'No matching logs.'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Start an agent to see protocol communication.
              </p>
            </div>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isTx = log.direction === 'tx';
            const time = new Date(log.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const isExpanded = expandedIdx === i;

            // 尝试解析 JSON 提取 method 和关键信息
            let summary = '';
            try {
              const parsed = JSON.parse(log.message);
              if (parsed.method) {
                summary = parsed.method;
              } else if (parsed.result !== undefined) {
                summary = 'response';
              } else if (parsed.error) {
                summary = `error: ${parsed.error.message || 'unknown'}`;
              }
            } catch {
              summary = log.message.slice(0, 60);
            }

            return (
              <div
                key={`${log.timestamp}-${i}`}
                className="px-3 py-1"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  borderLeft: `3px solid ${isTx ? 'var(--color-accent-500)' : 'var(--color-success)'}`,
                  background: isExpanded ? 'var(--color-surface-1)' : 'transparent',
                }}
              >
                {/* Summary line — 仅此行可点击展开/折叠 */}
                <div
                  className="flex items-center gap-2 cursor-pointer transition-colors hover:opacity-80"
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                >
                  <span
                    className="text-xs font-bold flex-shrink-0"
                    style={{
                      color: isTx ? 'var(--color-accent-400)' : 'var(--color-success)',
                      fontFamily: 'var(--font-mono)',
                      width: '1.5rem',
                    }}
                  >
                    {isTx ? 'TX' : 'RX'}
                  </span>
                  <span
                    className="text-xs flex-shrink-0"
                    style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                  >
                    {time}
                  </span>
                  <span
                    className="text-xs flex-1 truncate"
                    style={{
                      color: summary.startsWith('error') ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {summary}
                  </span>
                  <span
                    className="text-xs flex-shrink-0"
                    style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>

                {/* Expanded JSON content */}
                {isExpanded && (
                  <pre
                    className="mt-1 p-2 rounded text-xs overflow-x-auto"
                    style={{
                      background: 'var(--color-surface-0)',
                      color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      lineHeight: '1.4',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: '300px',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {formatJSON(log.message)}
                  </pre>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** 尝试格式化 JSON 字符串，失败则返回原字符串 */
function formatJSON(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
