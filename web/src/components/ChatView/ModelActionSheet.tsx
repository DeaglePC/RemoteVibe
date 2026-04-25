import { useEffect, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { inferAgentKind } from '../../types/protocol';
import { getModelsForKind } from '../../types/models';
import type { ModelOption } from '../../types/models';
import { fetchDynamicModels } from '../../stores/backendStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
}

/**
 * ModelActionSheet 是聊天输入栏齿轮按钮打开的底部 action sheet，
 * 用于选择"下次新建会话默认使用的模型"。
 *
 * 说明：此处的选择不影响当前正在运行的 session，仅作为下次 `Launch` 的默认值。
 * 当前 agent 无可选模型时不渲染（外层应避免打开）。
 */
export default function ModelActionSheet({ open, onClose, onModelSelect }: Props) {
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const defaultModel = useChatStore((s) => s.defaultModel);
  const setDefaultModel = useChatStore((s) => s.setDefaultModel);
  const agents = useChatStore((s) => s.agents);

  const kind = inferAgentKind(activeAgentId);
  const activeAgent = agents.find((a) => a.id === activeAgentId);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const staticModels = getModelsForKind(kind);
    if (kind === 'opencode' && activeAgentId) {
      setLoading(true);
      fetchDynamicModels(activeAgentId).then((dynamicModelNames) => {
        // 去重并合并
        const existingIds = new Set(staticModels.map((m) => m.id));
        const merged = [...staticModels];
        for (const name of dynamicModelNames) {
          if (!existingIds.has(name)) {
            merged.push({ id: name, label: name, desc: 'Dynamic model' });
          }
        }
        setModels(merged);
        setLoading(false);
      });
    } else {
      setModels(staticModels);
    }
  }, [open, kind, activeAgentId]);

  // Esc 关闭
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const handleSelect = (id: string) => {
    setDefaultModel(id);
    onModelSelect?.(id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{
        // zIndex 显式设为 100，高于手机端页面栈（MobilePage 使用 50 + depth）
        // 避免在移动端聊天页（depth=1, zIndex=51）点开齿轮时被页面栈遮挡
        zIndex: 100,
        background: 'oklch(0 0 0 / 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
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
          <span className="text-xl">🤖</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Default Model
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Applies to your next session
              {activeAgent ? ` · ${activeAgent.name}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-80 cursor-pointer flex-shrink-0"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto safe-bottom">
          {loading ? (
            <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
              <div className="animate-pulse">Loading dynamic models...</div>
            </div>
          ) : models.length === 0 ? (
            <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
              No models available for this agent.
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-3 sm:px-4 py-3">
              {models.map((m) => {
                const isActive = defaultModel === m.id;
                return (
                  <button
                    key={m.id || '__default__'}
                    onClick={() => handleSelect(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer"
                    style={{
                      background: isActive ? 'var(--color-surface-2)' : 'transparent',
                      border: isActive
                        ? '1px solid var(--color-accent-500)'
                        : '1px solid transparent',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--color-surface-2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                      style={{
                        background: isActive
                          ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))'
                          : 'var(--color-surface-3)',
                      }}
                    >
                      {isActive ? '✓' : '•'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.label}</div>
                      {m.desc && (
                        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {m.desc}
                        </div>
                      )}
                      {m.id && (
                        <div
                          className="text-xs truncate"
                          style={{
                            color: 'var(--color-text-muted)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.65rem',
                            marginTop: '2px',
                          }}
                        >
                          {m.id}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
