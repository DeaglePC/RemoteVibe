import { create } from 'zustand';

// ==================== Types ====================

/** 单个后端配置 */
export interface BackendConfig {
  id: string;
  name: string;
  apiUrl: string;  // 例如 https://remote-server:8080
  apiKey: string;  // 认证 API Key
}

/** 后端返回的单个 Agent 信息 */
export interface AgentInfo {
  id: string;
  name: string;
  mode: string;      // 'acp' | 'cli'
  available: boolean; // 命令是否在远程 PATH 中找到
}

/** 单台后端的在线状态（P5：多机器管理优化） */
export type BackendHealthState = 'unknown' | 'checking' | 'online' | 'offline';

export interface BackendHealth {
  state: BackendHealthState;
  latencyMs?: number;
  lastCheckedAt?: number;
  message?: string;
  agents?: AgentInfo[]; // 该后端上的可用 agent 列表
}

interface BackendState {
  /** 所有已配置的后端列表 */
  backends: BackendConfig[];
  /** 当前选中的后端 ID */
  activeBackendId: string | null;
  /** 每台机器的在线状态（内存态，不持久化） */
  statusMap: Record<string, BackendHealth>;

  /** 获取当前活跃后端 */
  getActiveBackend: () => BackendConfig | null;

  /** 添加新后端 */
  addBackend: (backend: Omit<BackendConfig, 'id'>) => string;
  /** 更新后端配置 */
  updateBackend: (id: string, updates: Partial<Omit<BackendConfig, 'id'>>) => void;
  /** 删除后端 */
  removeBackend: (id: string) => void;
  /** 切换当前后端 */
  setActiveBackend: (id: string) => void;

  /** 更新某台机器的健康状态（由 pingBackend 调用） */
  setBackendStatus: (id: string, status: BackendHealth) => void;

  /** 显示设置弹窗 */
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

// ==================== Persistence ====================

const STORAGE_KEY = 'remotevibe_backends';

interface PersistedBackendData {
  backends: BackendConfig[];
  activeBackendId: string | null;
  version: number;
}

const STORAGE_VERSION = 1;

/** 从 localStorage 加载后端配置（后端配置是客户端本地的，不存服务端） */
function loadBackends(): { backends: BackendConfig[]; activeBackendId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { backends: [], activeBackendId: null };
    }
    const data: PersistedBackendData = JSON.parse(raw);
    if (data.version !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return { backends: [], activeBackendId: null };
    }
    return {
      backends: data.backends || [],
      activeBackendId: data.activeBackendId,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { backends: [], activeBackendId: null };
  }
}

/** 保存后端配置到 localStorage */
function persistBackends(backends: BackendConfig[], activeBackendId: string | null): void {
  try {
    const data: PersistedBackendData = {
      backends,
      activeBackendId,
      version: STORAGE_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.warn('Failed to persist backend configs');
  }
}

// ==================== ID Generator ====================

let backendIdCounter = 0;
function genBackendId(): string {
  return `backend_${Date.now()}_${++backendIdCounter}`;
}

// ==================== Store ====================

const { backends: initialBackends, activeBackendId: initialActiveId } = loadBackends();

export const useBackendStore = create<BackendState>((set, get) => ({
  backends: initialBackends,
  activeBackendId: initialActiveId,
  statusMap: {},
  showSettings: false,

  getActiveBackend: () => {
    const { backends, activeBackendId } = get();
    if (!activeBackendId) return null;
    return backends.find((b) => b.id === activeBackendId) || null;
  },

  addBackend: (config) => {
    const id = genBackendId();
    const newBackend: BackendConfig = { ...config, id };
    const backends = [...get().backends, newBackend];
    const activeBackendId = get().activeBackendId || id; // 第一个自动设为活跃
    set({ backends, activeBackendId });
    persistBackends(backends, activeBackendId);
    return id;
  },

  updateBackend: (id, updates) => {
    const backends = get().backends.map((b) =>
      b.id === id ? { ...b, ...updates } : b
    );
    set({ backends });
    persistBackends(backends, get().activeBackendId);
  },

  removeBackend: (id) => {
    const state = get();
    const backends = state.backends.filter((b) => b.id !== id);
    let activeBackendId = state.activeBackendId;
    if (activeBackendId === id) {
      activeBackendId = backends[0]?.id || null;
    }
    // 清理该机器的状态，避免 statusMap 长期残留
    const statusMap = { ...state.statusMap };
    delete statusMap[id];
    set({ backends, activeBackendId, statusMap });
    persistBackends(backends, activeBackendId);
  },

  setActiveBackend: (id) => {
    set({ activeBackendId: id });
    persistBackends(get().backends, id);
  },

  setBackendStatus: (id, status) => {
    set((state) => ({ statusMap: { ...state.statusMap, [id]: status } }));
  },

  setShowSettings: (show) => set({ showSettings: show }),
}));

// ==================== Helper Functions ====================

/**
 * 获取当前后端的 API 基础 URL。
 * 如果没有配置后端，回退到当前页面的 origin（兼容旧行为）。
 */
export function getApiBaseUrl(): string {
  const store = useBackendStore.getState();
  const active = store.getActiveBackend();
  if (active?.apiUrl) {
    // 移除末尾斜杠
    return active.apiUrl.replace(/\/+$/, '');
  }
  return window.location.origin;
}

/**
 * 获取当前后端的认证 headers。
 * 优先使用后端配置的 apiKey，兼容旧的 bmh_token。
 */
export function getAuthHeaders(): HeadersInit {
  const store = useBackendStore.getState();
  const active = store.getActiveBackend();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (active?.apiKey) {
    headers['Authorization'] = `Bearer ${active.apiKey}`;
  } else {
    // 兼容旧的 token
    const token = localStorage.getItem('bmh_token') || '';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * 获取当前后端的 WebSocket URL。
 */
export function getWsUrl(): string {
  const store = useBackendStore.getState();
  const active = store.getActiveBackend();

  if (active?.apiUrl) {
    const url = new URL(active.apiUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = active.apiKey || '';
    return `${protocol}//${url.host}/ws${token ? `?token=${token}` : ''}`;
  }

  // 回退到当前页面地址
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const token = localStorage.getItem('bmh_token') || '';
  return `${protocol}//${host}/ws${token ? `?token=${token}` : ''}`;
}

// ==================== Health Ping ====================

/**
 * 对指定后端发起一次健康检测（/api/health）。
 * 会同步更新 store 中的 statusMap：先置 checking，再置 online/offline。
 * 成功返回 true，失败返回 false；不抛异常。
 */
export async function pingBackend(id: string, timeoutMs = 5000): Promise<boolean> {
  const store = useBackendStore.getState();
  const backend = store.backends.find((b) => b.id === id);
  if (!backend) return false;

  store.setBackendStatus(id, { state: 'checking', lastCheckedAt: Date.now() });

  const trimmedUrl = backend.apiUrl.replace(/\/+$/, '');
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (backend.apiKey) {
    headers['Authorization'] = `Bearer ${backend.apiKey}`;
  }

  const startedAt = Date.now();
  try {
    const resp = await fetch(`${trimmedUrl}/api/health`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    if (resp.ok) {
      // 解析 agents 列表（新版后端在 health 响应里带上）
      let agents: AgentInfo[] | undefined;
      try {
        const data = await resp.json();
        if (Array.isArray(data.agents)) {
          agents = data.agents as AgentInfo[];
        }
      } catch {
        // 旧版后端不带 agents，忽略解析错误
      }
      useBackendStore.getState().setBackendStatus(id, {
        state: 'online',
        latencyMs,
        lastCheckedAt: Date.now(),
        agents,
      });
      return true;
    }
    useBackendStore.getState().setBackendStatus(id, {
      state: 'offline',
      latencyMs,
      lastCheckedAt: Date.now(),
      message: `HTTP ${resp.status}`,
    });
    return false;
  } catch (err) {
    useBackendStore.getState().setBackendStatus(id, {
      state: 'offline',
      latencyMs: Date.now() - startedAt,
      lastCheckedAt: Date.now(),
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * 对所有已配置后端并发发起健康检测，结果通过 statusMap 回灌 UI。
 * 常见触发时机：App 启动后、设置页打开、手动点击"刷新"。
 */
export async function pingAllBackends(timeoutMs = 5000): Promise<void> {
  const { backends } = useBackendStore.getState();
  await Promise.all(backends.map((b) => pingBackend(b.id, timeoutMs)));
}

/**
 * 动态获取后端指定的 Agent 可用模型。
 * 针对 OpenCode 等支持 CLI 查询模型列表的 agent。
 */
export async function fetchDynamicModels(agentId: string): Promise<string[]> {
  try {
    const baseUrl = getApiBaseUrl();
    const headers = getAuthHeaders();
    const resp = await fetch(`${baseUrl}/api/agent-models?id=${encodeURIComponent(agentId)}`, {
      method: 'GET',
      headers,
    });
    if (!resp.ok) {
      console.warn(`Failed to fetch dynamic models for ${agentId}: HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch (err) {
    console.warn(`Error fetching dynamic models for ${agentId}:`, err);
    return [];
  }
}

