import { useChatStore } from '../../stores/chatStore';

interface Props {
  onStartAgent: (agentId: string) => void;
  onStopAgent: (agentId: string) => void;
}

export default function TopBar({ onStartAgent, onStopAgent }: Props) {
  const agents = useChatStore((s) => s.agents);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const wsStatus = useChatStore((s) => s.wsStatus);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || agents[0];
  const isRunning = agentStatus === 'running';
  const isStarting = agentStatus === 'starting';

  return (
    <header className="glass-strong flex items-center justify-between px-4 py-3 z-10"
      style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
          style={{
            background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
          }}>
          🐾
        </div>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            BaoMiHua
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Agent Gateway
          </p>
        </div>
      </div>

      {/* Center: Agent selector */}
      <div className="flex items-center gap-3">
        {agents.length > 0 && (
          <select
            className="text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
            value={activeAgent?.id || ''}
            onChange={(e) => {
              // Just track selection, don't auto-start
              useChatStore.getState().setActiveAgentId(e.target.value);
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {!isRunning && !isStarting && activeAgent && (
          <button
            onClick={() => onStartAgent(activeAgent.id)}
            className="text-sm font-medium px-4 py-1.5 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
              color: 'white',
              border: 'none',
            }}
          >
            Launch
          </button>
        )}

        {isStarting && (
          <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-warning)' }}>
            <span className="animate-spin">⟳</span> Starting...
          </div>
        )}

        {isRunning && (
          <button
            onClick={() => activeAgent && onStopAgent(activeAgent.id)}
            className="text-sm px-3 py-1.5 rounded-lg transition-all duration-200 hover:opacity-80 cursor-pointer"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-danger)',
              border: '1px solid var(--color-danger)',
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-2">
        {/* Agent status dot */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${isRunning ? 'animate-pulse-glow' : ''}`}
            style={{
              background: isRunning
                ? 'var(--color-success)'
                : isStarting
                  ? 'var(--color-warning)'
                  : 'var(--color-text-muted)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {isRunning ? 'Connected' : isStarting ? 'Starting' : 'Offline'}
          </span>
        </div>

        {/* WebSocket status */}
        <div className="w-2 h-2 rounded-full ml-2"
          style={{
            background: wsStatus === 'connected'
              ? 'var(--color-success)'
              : wsStatus === 'connecting'
                ? 'var(--color-warning)'
                : 'var(--color-danger)',
          }}
          title={`WS: ${wsStatus}`}
        />
      </div>
    </header>
  );
}
