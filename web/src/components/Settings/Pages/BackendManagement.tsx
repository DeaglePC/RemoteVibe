import { useCallback, useEffect, useState } from 'react';
import {
  useBackendStore,
  pingAllBackends,
  pingBackend,
  type BackendConfig,
  type BackendHealthState,
} from '../../../stores/backendStore';

/**
 * 后端机器管理页（P5：多机器管理优化，Q1=A + Q2=A + Q3=A）。
 *
 * 特性：
 *  - 嵌入式列表（不再唤起 Modal），每台机器卡片化展示
 *  - 状态点：🟢 online · 🔴 offline · ⏳ checking · ⚪ unknown
 *  - 点击卡片左侧圆圈切换 active
 *  - 悬浮/常驻按钮：编辑 / 删除
 *  - 顶部"＋ 添加"按钮，右上角"🔄 刷新状态"按钮
 *  - 新增/编辑表单内嵌在同一页（无 Modal）
 */

interface FormState {
  name: string;
  apiUrl: string;
  apiKey: string;
}

const emptyForm: FormState = { name: '', apiUrl: '', apiKey: '' };

function getStatusColor(state: BackendHealthState | undefined): string {
  switch (state) {
    case 'online':
      return 'var(--color-success, #2ecc71)';
    case 'offline':
      return 'var(--color-danger, #e74c3c)';
    case 'checking':
      return 'var(--color-warning, #f1c40f)';
    default:
      return 'var(--color-text-muted, #888)';
  }
}

function getStatusLabel(state: BackendHealthState | undefined, latencyMs?: number): string {
  switch (state) {
    case 'online':
      return typeof latencyMs === 'number' ? `🟢 在线 · ${latencyMs}ms` : '🟢 在线';
    case 'offline':
      return '🔴 离线';
    case 'checking':
      return '⏳ 检测中…';
    default:
      return '⚪ 未检测';
  }
}

export default function BackendManagement() {
  const backends = useBackendStore((s) => s.backends);
  const activeBackendId = useBackendStore((s) => s.activeBackendId);
  const statusMap = useBackendStore((s) => s.statusMap);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // 进入页面时 ping 一次所有机器
  useEffect(() => {
    void pingAllBackends();
  }, []);

  const handleAddNew = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setTestResult(null);
  }, []);

  const handleEdit = useCallback((backend: BackendConfig) => {
    setEditingId(backend.id);
    setForm({ name: backend.name, apiUrl: backend.apiUrl, apiKey: backend.apiKey });
    setShowForm(true);
    setTestResult(null);
  }, []);

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedUrl = form.apiUrl.trim().replace(/\/+$/, '');
    const trimmedName = form.name.trim();
    if (!trimmedName || !trimmedUrl) return;

    const store = useBackendStore.getState();
    let savedId: string;
    if (editingId) {
      store.updateBackend(editingId, {
        name: trimmedName,
        apiUrl: trimmedUrl,
        apiKey: form.apiKey.trim(),
      });
      savedId = editingId;
    } else {
      savedId = store.addBackend({
        name: trimmedName,
        apiUrl: trimmedUrl,
        apiKey: form.apiKey.trim(),
      });
    }

    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);
    setTestResult(null);

    // 保存后 ping 一次该机器刷新状态
    void pingBackend(savedId);
  }, [editingId, form]);

  const handleDelete = useCallback((id: string) => {
    const backend = useBackendStore.getState().backends.find((b) => b.id === id);
    if (!backend) return;
    const ok = window.confirm(`确定要删除后端机器「${backend.name}」吗？`);
    if (!ok) return;
    useBackendStore.getState().removeBackend(id);
  }, []);

  const handleSwitch = useCallback((id: string) => {
    const store = useBackendStore.getState();
    if (store.activeBackendId === id) return;
    store.setActiveBackend(id);
    void pingBackend(id);
  }, []);

  const handleTestForm = useCallback(async () => {
    const trimmedUrl = form.apiUrl.trim().replace(/\/+$/, '');
    if (!trimmedUrl) {
      setTestResult({ ok: false, message: '请先填写 API URL' });
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
        setTestResult({ ok: true, message: '✅ 连接成功' });
      } else {
        setTestResult({ ok: false, message: `❌ HTTP ${resp.status}: ${resp.statusText}` });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: `❌ 连接失败：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  }, [form]);

  const handleRefreshAll = useCallback(() => {
    void pingAllBackends();
  }, []);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 顶栏：标题 + 刷新 + 新增 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          后端机器（{backends.length}）
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={handleRefreshAll}
            title="刷新所有机器的在线状态"
            style={{
              appearance: 'none',
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-1)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
            }}
          >
            🔄 刷新
          </button>
          <button
            type="button"
            onClick={handleAddNew}
            style={{
              appearance: 'none',
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--color-accent-500)',
              background: 'var(--color-accent-500)',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            ＋ 添加
          </button>
        </div>
      </div>

      {/* 机器列表 */}
      {backends.length === 0 && !showForm && (
        <div
          style={{
            padding: '24px 10px',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-text-muted)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md, 8px)',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🌐</div>
          尚未配置任何后端机器
          <br />
          点击右上角"＋ 添加"创建第一台
        </div>
      )}

      {backends.map((b) => {
        const isActive = b.id === activeBackendId;
        const status = statusMap[b.id];
        const color = getStatusColor(status?.state);
        const label = getStatusLabel(status?.state, status?.latencyMs);
        return (
          <div
            key={b.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: isActive ? 'var(--color-surface-2)' : 'var(--color-surface-1)',
              border: `1px solid ${isActive ? 'var(--color-accent-500)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            {/* 切换 active 的圆圈 */}
            <button
              type="button"
              onClick={() => handleSwitch(b.id)}
              title={isActive ? '当前激活' : '切换到此机器'}
              style={{
                appearance: 'none',
                width: 20,
                height: 20,
                flexShrink: 0,
                padding: 0,
                borderRadius: '50%',
                background: isActive ? 'var(--color-accent-500)' : 'transparent',
                border: isActive ? '2px solid var(--color-accent-500)' : '2px solid var(--color-text-muted)',
                cursor: isActive ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isActive && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'white',
                  }}
                />
              )}
            </button>

            {/* 机器信息 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                    animation: status?.state === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.name}
                </span>
                {isActive && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 999,
                      background: 'var(--color-accent-500)',
                      color: 'white',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-all',
                  marginTop: 2,
                }}
              >
                {b.apiUrl}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {label}
                {b.apiKey ? ' · 🔑 已配置 Key' : ' · 🔓 无 Key'}
              </div>
              {status?.agents && status.agents.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {status.agents.map(ag => (
                    <span 
                      key={ag.id} 
                      style={{ 
                        fontSize: 10, 
                        background: 'var(--color-surface-3)', 
                        padding: '2px 6px', 
                        borderRadius: 4,
                        color: ag.available ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        border: `1px solid ${ag.available ? 'var(--color-border)' : 'transparent'}`
                      }}
                      title={ag.available ? `可用 (${ag.mode} 模式)` : '未安装'}
                    >
                      🤖 {ag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => void pingBackend(b.id)}
                title="重新检测"
                style={{
                  appearance: 'none',
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                检测
              </button>
              <button
                type="button"
                onClick={() => handleEdit(b)}
                title="编辑"
                style={{
                  appearance: 'none',
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => handleDelete(b.id)}
                title="删除"
                style={{
                  appearance: 'none',
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-danger, #e74c3c)',
                  cursor: 'pointer',
                }}
              >
                删除
              </button>
            </div>
          </div>
        );
      })}

      {/* 新增 / 编辑表单 */}
      {showForm && (
        <div
          style={{
            padding: 12,
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md, 8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {editingId ? '编辑机器' : '新增机器'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：生产服务器"
              style={{
                padding: '6px 8px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-0)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>API URL</label>
            <input
              type="text"
              value={form.apiUrl}
              onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
              placeholder="https://remote-server.example.com:8080"
              style={{
                padding: '6px 8px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-0)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              API Key（可选）
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="Bearer token"
              style={{
                padding: '6px 8px',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-0)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {testResult && (
            <div
              style={{
                padding: '6px 8px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm, 6px)',
                background: testResult.ok
                  ? 'oklch(0.72 0.18 155 / 0.1)'
                  : 'oklch(0.65 0.20 25 / 0.1)',
                color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
                border: `1px solid ${testResult.ok ? 'var(--color-success)' : 'var(--color-danger)'}33`,
              }}
            >
              {testResult.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={handleTestForm}
              disabled={testing || !form.apiUrl.trim()}
              style={{
                appearance: 'none',
                padding: '6px 10px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-accent-400)',
                cursor: testing || !form.apiUrl.trim() ? 'not-allowed' : 'pointer',
                opacity: testing || !form.apiUrl.trim() ? 0.5 : 1,
              }}
            >
              {testing ? '检测中…' : '🔌 测试连接'}
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleCancelForm}
                style={{
                  appearance: 'none',
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.name.trim() || !form.apiUrl.trim()}
                style={{
                  appearance: 'none',
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--color-accent-500)',
                  background: 'var(--color-accent-500)',
                  color: 'white',
                  cursor: !form.name.trim() || !form.apiUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: !form.name.trim() || !form.apiUrl.trim() ? 0.5 : 1,
                }}
              >
                {editingId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
