import { useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import TopBar from './TopBar';
import MobileTabBar from './MobileTabBar';
import MobilePage from './MobilePage';
import HomePage from '../Mobile/HomePage';
import SettingsPage from '../Mobile/SettingsPage';
import ChatPage from '../Mobile/ChatPage';
import { FilesTreePage, FileViewerPage } from '../Mobile/FilesPage';

/**
 * 手机端整体壳（方案 §5）。
 *
 * 负责：
 *  - L1 首页（Home / Settings）根据 `uiStore.mobileTab` 切换
 *  - 根据 `uiStore.mobileNavStack` 叠加 L2/L3 页面，顶层显示
 *  - 底部 TabBar 仅在栈为空时显示（Q3.3=A）
 *  - 复用现有 `TopBar`（hideHeader=true）承担 launch 弹窗、agent 选择、
 *    模型选择、Gemini session 恢复等业务逻辑（P3 后续抽 hook，这里暂复用）
 *
 * 浏览器后退：监听 popstate 事件，如果栈非空则 pop，而不让浏览器退出页面。
 * 这对 PWA 安装后的原生返回手势、Android 硬件返回键、iOS 边缘手势都能单点覆盖。
 */
interface Props {
  onStartAgent: (
    agentId: string,
    workDir: string,
    opts?: { geminiSessionId?: string; model?: string },
  ) => void;
  onStopAgent: (agentId: string) => void;
  onSendPrompt: (text: string) => void;
  onSlashCommand: (commandId: string) => void;
  onOpenModelSheet?: () => void;
  onCancel: () => void;
  onReconnectSession: () => void;
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
  onSendWS: (msg: { type: string; payload: unknown }) => void;
  /** 外部控制的 TopBar launchTrigger，数字递增即触发 Launch 弹窗 */
  launchTrigger: number;
  /** 打开 Launch 弹窗（等价于递增 launchTrigger） */
  onLaunch: () => void;
}

export default function MobileShell({
  onStartAgent,
  onStopAgent,
  onSendPrompt,
  onSlashCommand,
  onOpenModelSheet,
  onCancel,
  onReconnectSession,
  onPermissionRespond,
  onSendWS,
  launchTrigger,
  onLaunch,
}: Props) {
  const mobileTab = useUIStore((s) => s.mobileTab);
  const stack = useUIStore((s) => s.mobileNavStack);
  const popMobilePage = useUIStore((s) => s.popMobilePage);

  // 监听浏览器 back：栈非空时优先 pop 内部栈，而不让页面硬性回退。
  // 思路：每次 push 时同步 history.pushState，浏览器 back 时触发 popstate → pop 栈。
  useEffect(() => {
    if (stack.length === 0) return;
    // 为该栈帧压一个 history 条目；后退时 popstate 被触发
    window.history.pushState({ mobileStackDepth: stack.length }, '');
    const handler = () => {
      popMobilePage();
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
    };
  }, [stack.length, popMobilePage]);

  const tabBarVisible = stack.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--color-surface-0)',
        position: 'relative',
      }}
    >
      {/* TopBar 仅保留 launchTrigger 弹窗机制，header 隐藏（L1/L2 自己有 header） */}
      <TopBar
        onStartAgent={onStartAgent}
        onStopAgent={onStopAgent}
        launchTrigger={launchTrigger}
        hideHeader
      />

      {/* L1 页面层（始终渲染，栈非空时被上面的 MobilePage 覆盖） */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mobileTab === 'sessions' ? <HomePage onNewSession={onLaunch} /> : <SettingsPage />}
      </div>

      {/*
        栈中的页面全部保留在 DOM，按 zIndex 叠放：栈顶在最上层、下层被遮挡。
        这样 pop 时顶层页卸载，下层页（如 ChatPage）状态完整保留，立即可见，
        避免了"仅渲染栈顶"方案下 ChatPage 反复挂载导致的卡顿（消息列表重建 ~2s）。
      */}
      {stack.map((page, idx) => (
        <MobilePage key={`${page.type}-${idx}`} depth={idx + 1}>
          {renderPage(page, {
            onSendPrompt,
            onSlashCommand,
            onOpenModelSheet,
            onCancel,
            onReconnectSession,
            onPermissionRespond,
            onSendWS,
          })}
        </MobilePage>
      ))}

      {/* TabBar 仅 L1 显示 */}
      {tabBarVisible && <MobileTabBar />}
    </div>
  );
}

/** 根据栈帧类型渲染对应页面 */
function renderPage(
  page: NonNullable<ReturnType<typeof useUIStore.getState>['mobileNavStack'][number]>,
  handlers: {
    onSendPrompt: (text: string) => void;
    onSlashCommand: (commandId: string) => void;
    onOpenModelSheet?: () => void;
    onCancel: () => void;
    onReconnectSession: () => void;
    onPermissionRespond: (requestId: unknown, optionId: string) => void;
    onSendWS: (msg: { type: string; payload: unknown }) => void;
  },
) {
  switch (page.type) {
    case 'chat':
      return (
        <ChatPage
          onSendPrompt={handlers.onSendPrompt}
          onSlashCommand={handlers.onSlashCommand}
          onOpenModelSheet={handlers.onOpenModelSheet}
          onCancel={handlers.onCancel}
          onReconnectSession={handlers.onReconnectSession}
          onPermissionRespond={handlers.onPermissionRespond}
        />
      );
    case 'files':
      return <FilesTreePage rootPath={page.rootPath} onSendWS={handlers.onSendWS} />;
    case 'file-viewer':
      return <FileViewerPage path={page.path} name={page.name} size={page.size} />;
    case 'settings-detail':
      // P4 MVP 暂不使用这个栈帧（SettingsRoot 自己管子页）
      // 保留类型定义供后续扩展
      return null;
    default:
      return null;
  }
}
