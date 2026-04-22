// BaoMiHua Agent Gateway Service Worker
// 三层策略：
//   - navigation / index.html : network-first（3s 超时）降级 cache
//   - 带 hash 的静态资源（/assets/*）: cache-first，永久缓存
//   - 字体、图标、manifest: stale-while-revalidate
//   - /api/*, /ws : 跳过，不缓存
// 版本化：CACHE_VERSION 在构建期由 vite 的 define 注入替换；
//   SKIP_WAITING 消息可让前端强制激活新版本。

/* eslint-disable no-restricted-globals */

const CACHE_VERSION = '__BUILD_ID__';
const PRECACHE = `baomihua-precache-${CACHE_VERSION}`;
const RUNTIME = `baomihua-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// 预缓存：壳资源 + 离线兜底页 + 核心字体（仅最常用的子集与字重）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  // 英文 UI 最核心的 4 个字体子集（latin 400/500/600 + JetBrains Mono 400）
  // 其余字重/子集首次使用时由 SWR 策略按需缓存，避免首屏大包
  '/fonts/inter-400-latin.woff2',
  '/fonts/inter-500-latin.woff2',
  '/fonts/inter-600-latin.woff2',
  '/fonts/jetbrains-mono-400-latin.woff2',
];

// 网络优先超时（毫秒）
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== PRECACHE && name !== RUNTIME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// 允许前端主动触发 skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * 判断是否为 HTML 导航请求
 * @param {Request} request
 */
function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
}

/**
 * 判断是否为带 hash 的静态资源（Vite 产物默认形如 /assets/xxxx-abcd1234.js）
 * @param {URL} url
 */
function isHashedAsset(url) {
  return /\/assets\/.+\.[0-9a-f]{6,}\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp)$/i.test(url.pathname);
}

/**
 * 判断是否为字体、图标、manifest 这类适合 SWR 的长期资源
 * @param {URL} url
 */
function isSwrAsset(url) {
  return (
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.svg' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/')
  );
}

/**
 * network-first 策略（带超时）
 * @param {Request} request
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT_MS);
    });
    const response = await Promise.race([networkPromise, timeoutPromise]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const precache = await caches.open(PRECACHE);
    const fallback = (await precache.match(request)) || (await precache.match('/index.html'));
    if (fallback) return fallback;
    const offline = await precache.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/**
 * cache-first 策略（用于内容寻址的静态资源）
 * @param {Request} request
 */
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

/**
 * stale-while-revalidate 策略
 * @param {Request} request
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || networkPromise || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 跨源：放行
  if (url.origin !== self.location.origin) return;

  // API / WebSocket：不缓存、不拦截
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  // Chrome 扩展等特殊 scheme：跳过
  if (!url.protocol.startsWith('http')) return;

  // 调试旁路：带 ?nosw 的请求直接走网络
  if (url.searchParams.has('nosw')) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isSwrAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 其他 GET 资源：默认 SWR 兜底
  event.respondWith(staleWhileRevalidate(request));
});
