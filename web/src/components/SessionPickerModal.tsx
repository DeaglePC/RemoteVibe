import type { AgentInfo } from '../types/protocol';
import { inferAgentKind } from '../types/protocol';
import { getModelsForKind } from '../types/models';
import type { ModelOption } from '../types/models';
import { fetchDynamicModels } from '../stores/backendStore';
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  workDir: string;
  agents: AgentInfo[];
  selectedAgentId: string | null;
  selectedModel: string;
  onAgentChange: (agentId: string) => void;
  onModelChange: (model: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}

/**
 * SessionPickerModal 在选择工作区后展示 Agent / 模型选择器与「新建会话」按钮。
 *
 * 历史会话恢复（Gemini CLI 原生 / 本地 UI 历史）已由外层侧边栏的项目手风琴承担，
 * 此处不再重复提供 resume 列表。
 */
export default function SessionPickerModal({
  open,
  workDir,
  agents,
  selectedAgentId,
  selectedModel,
  onAgentChange,
  onModelChange,
  onNewSession,
  onClose,
}: Props) {
  const folderName = workDir.split('/').pop() || workDir;

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const agentKind = inferAgentKind(selectedAgent?.id);

  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const staticModels = getModelsForKind(agentKind);
    if (agentKind === 'opencode' && selectedAgent?.id) {
      setLoading(true);
      fetchDynamicModels(selectedAgent.id).then((dynamicModelNames) => {
        const existingIds = new Set(staticModels.map((m) => m.id));
        const merged = [...staticModels];
        for (const name of dynamicModelNames) {
          if (!existingIds.has(name)) {
            merged.push({ id: name, label: name, desc: 'Dynamic model' });
          }
        }
        setAvailableModels(merged);
        setLoading(false);
      });
    } else {
      setAvailableModels(staticModels);
    }
  }, [open, agentKind, selectedAgent?.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full sm:max-w-md sm:mx-4 rounded-t-xl sm:rounded-xl overflow-hidden animate-fade-in-up"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px oklch(0 0 0 / 0.5)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.15), oklch(0.72 0.18 195 / 0.1))',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className="text-xl">💬</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Start Session
            </h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {folderName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-80 cursor-pointer flex-shrink-0"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto safe-bottom">
          {/* Agent Selector */}
          <div className="px-3 sm:px-4 pt-3">
            <div className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
              🤖 Select Agent
            </div>
            <div className="flex flex-col gap-1">
              {agents.map((agent) => {
                const isSelected = agent.id === selectedAgentId;
                const isAvailable = agent.available !== false; // 默认可用（兼容旧版后端）
                const modeLabel = agent.mode === 'cli' ? 'CLI' : agent.mode === 'acp' ? 'ACP' : 'ACP';
                const modeColor = agent.mode === 'cli'
                  ? { bg: 'oklch(0.55 0.15 160 / 0.2)', text: 'oklch(0.75 0.15 160)' }
                  : { bg: 'oklch(0.55 0.15 270 / 0.2)', text: 'oklch(0.75 0.15 270)' };
                return (
                  <button
                    key={agent.id}
                    onClick={() => isAvailable && onAgentChange(agent.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150"
                    style={{
                      background: isSelected
                        ? 'var(--color-surface-2)'
                        : 'transparent',
                      border: isSelected
                        ? '1px solid var(--color-accent-500)'
                        : '1px solid transparent',
                      color: 'var(--color-text-primary)',
                      opacity: isAvailable ? 1 : 0.4,
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && isAvailable) {
                        e.currentTarget.style.background = 'var(--color-surface-2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected && isAvailable) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                    title={isAvailable ? agent.name : `${agent.name} — not installed on server`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                      style={{
                        background: isSelected
                          ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))'
                          : 'var(--color-surface-3)',
                      }}
                    >
                      {isSelected ? '✓' : '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{agent.name}</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: modeColor.bg,
                            color: modeColor.text,
                            fontSize: '0.55rem',
                            fontWeight: 600,
                          }}
                        >
                          {modeLabel}
                        </span>
                        {!isAvailable && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: 'oklch(0.55 0.18 25 / 0.2)',
                              color: 'var(--color-danger)',
                              fontSize: '0.55rem',
                              fontWeight: 600,
                            }}
                          >
                            Not installed
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--color-accent-500)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Selector — 根据当前 agent 展示对应的模型列表 */}
          {availableModels.length > 0 && (
            <div className="px-3 sm:px-4 pt-1">
              <div className="px-1 pb-1 text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
                🤖 Model {loading && <span className="animate-pulse lowercase ml-2">loading...</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableModels.map((m) => {
                  const isActive = selectedModel === m.id;
                  return (
                    <button
                      key={m.id || '__default__'}
                      onClick={() => onModelChange(m.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer"
                      style={{
                        background: isActive ? 'var(--color-surface-2)' : 'transparent',
                        border: isActive
                          ? '1px solid var(--color-accent-500)'
                          : '1px solid var(--color-border)',
                        color: isActive ? 'var(--color-accent-400)' : 'var(--color-text-secondary)',
                        fontWeight: isActive ? 600 : 400,
                      }}
                      title={m.desc || m.id || 'Use CLI default model'}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="mx-4 my-2" style={{ borderTop: '1px solid var(--color-border)' }} />

          {/* New Session button */}
          <div className="px-3 sm:px-4 pb-3">
            <button
              onClick={onNewSession}
              disabled={!selectedAgentId}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                color: 'white',
                border: 'none',
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">New Session</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Start fresh with {selectedAgent?.name || 'selected agent'}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
