// useInstallPrompt.ts
// 捕获浏览器的 beforeinstallprompt 事件（Chrome/Edge/Samsung Internet 等），
// 暴露 canInstall + promptInstall 接口。iOS Safari 无此事件，需要引导用户手动"添加到主屏幕"。

import { useCallback, useEffect, useState } from 'react';

/**
 * BeforeInstallPromptEvent 尚未被 lib.dom 收录，这里补一份最小类型
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface UseInstallPromptResult {
  /** 是否已捕获到可用的安装事件（当前浏览器支持且满足 PWA 安装条件） */
  canInstall: boolean;
  /** 当前应用是否已以 standalone 模式运行（即已安装） */
  isInstalled: boolean;
  /** 弹出安装提示；调用后无论结果如何，canInstall 都会被置 false（事件只能用一次） */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
}

/**
 * 检测当前页面是否在"已安装"模式下运行
 */
function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari 私有 API
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * PWA 安装提示 Hook
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(detectInstalled);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    if (!deferredPrompt) return 'unsupported';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return outcome;
    } catch {
      setDeferredPrompt(null);
      return 'dismissed';
    }
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
