// useSwUpdate.ts
// 监听 Service Worker 的 `waiting` 状态，向调用方暴露"有新版可更新"事件，
// 以及触发 SKIP_WAITING + 页面重载的 applyUpdate 动作。

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSwUpdateResult {
  /** 是否存在等待激活的新版本 */
  updateAvailable: boolean;
  /** 触发新版本激活（postMessage SKIP_WAITING），激活后当前页会自动 reload */
  applyUpdate: () => void;
}

/**
 * 监听 SW 更新的 React Hook。
 * - 仅在生产部署且浏览器支持 SW 时生效；开发环境或不支持 SW 时始终返回 false。
 * - 激活新版本后自动 reload 当前页面一次，避免用户手动刷新。
 */
export function useSwUpdate(): UseSwUpdateResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;

    const watchWaiting = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      const handleFound = () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = installing;
            setUpdateAvailable(true);
          }
        });
      };
      registration.addEventListener('updatefound', handleFound);
    };

    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;
        watchWaiting(registration);
        // 启动时主动拉一次更新检查
        registration.update().catch(() => {});
      })
      .catch(() => {});

    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current;
    if (!worker) {
      window.location.reload();
      return;
    }
    worker.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange 事件会触发 reload
  }, []);

  return { updateAvailable, applyUpdate };
}
