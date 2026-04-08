import { create } from 'zustand';

// ==================== Types ====================

/** 单个后端配置 */
export interface BackendConfig {
  id: string;
  name: string;
  apiUrl: string;  // 例如 https://remote-server:8080
  apiKey: string;  // 认证 API Key
}

interface BackendState {
  /** 所有已配置的后端列表 */
  backends: BackendConfig[];
  /** 当前选中的后端 ID */
  activeBackendId: string | null;

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
    set({ backends, activeBackendId });
    persistBackends(backends, activeBackendId);
  },

  setActiveBackend: (id) => {
    set({ activeBackendId: id });
    persistBackends(get().backends, id);
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
