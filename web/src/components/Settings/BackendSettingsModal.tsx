import { useState } from 'react';
import { useBackendStore } from '../../stores/backendStore';
import type { BackendConfig } from '../../stores/backendStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 连接后端成功后的回调，用于触发工作区选择流程 */
  onConnected?: () => void;
}

/** 单个后端的编辑/新增表单 */
interface FormState {
  name: string;
  apiUrl: string;
  apiKey: string;
}

const emptyForm: FormState = { name: '', apiUrl: '', apiKey: '' };

/**
 * BackendSettingsModal 是后端连接管理弹窗。
 * 支持添加、编辑、删除、切换多个后端配置。
 */
export default function BackendSettingsModal({ open, onClose, onConnected }: Props) {
  const backends = useBackendStore((s) => s.backends);
  const activeBackendId = useBackendStore((s) => s.activeBackendId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleAddNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setTestResult(null);
  };

  const handleEdit = (backend: BackendConfig) => {
    setEditingId(backend.id);
    setForm({
      name: backend.name,
      apiUrl: backend.apiUrl,
      apiKey: backend.apiKey,
    });
    setShowForm(true);
    setTestResult(null);
  };

  const handleSave = async () => {
    const trimmedUrl = form.apiUrl.trim().replace(/\/+$/, '');
    if (!form.name.trim() || !trimmedUrl) return;

    const store = useBackendStore.getState();
    let savedId: string;
    if (editingId) {
      store.updateBackend(editingId, {
        name: form.name.trim(),
        apiUrl: trimmedUrl,
        apiKey: form.apiKey.trim(),
      });
      savedId = editingId;
    } else {
      savedId = store.addBackend({
        name: form.name.trim(),
        apiUrl: trimmedUrl,
        apiKey: form.apiKey.trim(),
      });
    }

    // 自动设为活跃后端并测试连接
    store.setActiveBackend(savedId);
    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);

    // 自动测试连接
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const apiKey = form.apiKey.trim();
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const resp = await fetch(`${trimmedUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setTestResult({ ok: true, message: `✅ Connected to ${form.name.trim()} successfully!` });
        // 延迟关闭弹窗并触发 onConnected
        setTimeout(() => {
          onClose();
          setTestResult(null);
          onConnected?.();
        }, 800);
      } else {
        setTestResult({ ok: false, message: `HTTP ${resp.status}: ${resp.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Connection test failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleDelete = (id: string) => {
    useBackendStore.getState().removeBackend(id);
    if (editingId === id) {
      setShowForm(false);
      setEditingId(null);
    }
  };

  const handleSwitch = async (id: string) => {
    const store = useBackendStore.getState();
    store.setActiveBackend(id);
    const backend = store.backends.find((b) => b.id === id);
    if (!backend) return;

    // 测试连接
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (backend.apiKey) {
        headers['Authorization'] = `Bearer ${backend.apiKey}`;
      }
      const trimmedUrl = backend.apiUrl.replace(/\/+$/, '');
      const resp = await fetch(`${trimmedUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setTestResult({ ok: true, message: `✅ Connected to ${backend.name} successfully!` });
        setTimeout(() => {
          onClose();
          setTestResult(null);
          onConnected?.();
        }, 800);
      } else {
        setTestResult({ ok: false, message: `HTTP ${resp.status}: ${resp.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleTest = async () => {
    const trimmedUrl = form.apiUrl.trim().replace(/\/+$/, '');
    if (!trimmedUrl) {
      setTestResult({ ok: false, message: 'API URL is required' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (form.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${form.apiKey.trim()}`;
      }

      const resp = await fetch(`${trimmedUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        setTestResult({ ok: true, message: 'Connection successful ✓' });
      } else {
        setTestResult({ ok: false, message: `HTTP ${resp.status}: ${resp.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showForm) {
        setShowForm(false);
      } else {
        onClose();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl overflow-hidden animate-fade-in-up"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px oklch(0 0 0 / 0.5)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.15), oklch(0.72 0.18 195 / 0.1))',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className="text-xl">🔗</span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Backend Connections
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Manage your agent gateway servers
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Backend list */}
          {!showForm && (
            <div className="px-4 py-3">
              {backends.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">🌐</div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    No backends configured yet
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Add a backend server to get started
                  </p>
                </div>
              )}

              {backends.map((backend) => {
                const isActive = backend.id === activeBackendId;
                return (
                  <div
                    key={backend.id}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg mb-2 transition-all group"
                    style={{
                      background: isActive ? 'var(--color-surface-2)' : 'transparent',
                      border: isActive ? '1px solid var(--color-accent-500)' : '1px solid var(--color-border)',
                    }}
                  >
                    {/* Active indicator */}
                    <button
                      onClick={() => handleSwitch(backend.id)}
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all"
                      style={{
                        background: isActive ? 'var(--color-accent-500)' : 'transparent',
                        border: isActive ? '2px solid var(--color-accent-500)' : '2px solid var(--color-text-muted)',
                      }}
                      title={isActive ? 'Active backend' : 'Switch to this backend'}
                    >
                      {isActive && (
                        <div className="w-2 h-2 rounded-full" style={{ background: 'white' }} />
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {backend.name}
                        </span>
                        {isActive && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{
                              background: 'var(--color-accent-500)',
                              color: 'white',
                              fontSize: '0.6rem',
                            }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {backend.apiUrl}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {backend.apiKey ? '🔑 Key configured' : '🔓 No API key'}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(backend)}
                        className="p-1.5 rounded-lg cursor-pointer transition-all hover:opacity-80"
                        style={{ background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)', border: 'none' }}
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(backend.id)}
                        className="p-1.5 rounded-lg cursor-pointer transition-all hover:opacity-80"
                        style={{ background: 'var(--color-surface-3)', color: 'var(--color-danger)', border: 'none' }}
                        title="Delete"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 连接测试结果（列表模式） */}
              {testResult && !showForm && (
                <div
                  className="text-xs mx-1 mt-2 px-3 py-2 rounded-lg"
                  style={{
                    background: testResult.ok ? 'oklch(0.72 0.18 155 / 0.1)' : 'oklch(0.65 0.20 25 / 0.1)',
                    color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
                    border: `1px solid ${testResult.ok ? 'var(--color-success)' : 'var(--color-danger)'}33`,
                  }}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <div className="px-4 py-4">
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>
                {editingId ? 'Edit Backend' : 'New Backend'}
              </div>

              {/* Name */}
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{
                    background: 'var(--color-surface-0)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                  }}
                  placeholder="My Remote Server"
                  autoFocus
                />
              </div>

              {/* API URL */}
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  API URL
                </label>
                <input
                  type="text"
                  value={form.apiUrl}
                  onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{
                    background: 'var(--color-surface-0)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  placeholder="https://remote-server.example.com:8080"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  The base URL of the Agent Gateway server
                </p>
              </div>

              {/* API Key */}
              <div className="mb-4">
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  API Key (optional)
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{
                    background: 'var(--color-surface-0)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  placeholder="Bearer token for authentication"
                />
              </div>

              {/* Test connection */}
              <div className="mb-4">
                <button
                  onClick={handleTest}
                  disabled={testing || !form.apiUrl.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--color-surface-3)',
                    color: 'var(--color-accent-400)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {testing ? '⟳ Testing...' : '🔌 Test Connection'}
                </button>
                {testResult && (
                  <div
                    className="text-xs mt-2 px-3 py-2 rounded-lg"
                    style={{
                      background: testResult.ok ? 'oklch(0.72 0.18 155 / 0.1)' : 'oklch(0.65 0.20 25 / 0.1)',
                      color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
                      border: `1px solid ${testResult.ok ? 'var(--color-success)' : 'var(--color-danger)'}33`,
                    }}
                  >
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 flex-shrink-0 safe-bottom"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {showForm ? (
            <>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-sm px-4 py-2 rounded-lg transition-all cursor-pointer hover:opacity-80"
                style={{
                  background: 'var(--color-surface-3)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.apiUrl.trim()}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                  color: 'white',
                  border: 'none',
                }}
              >
                {editingId ? 'Update' : 'Add Backend'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-lg transition-all cursor-pointer hover:opacity-80"
                style={{
                  background: 'var(--color-surface-3)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Close
              </button>
              <button
                onClick={handleAddNew}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                  color: 'white',
                  border: 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Backend
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
