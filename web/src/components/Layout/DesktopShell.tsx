import { lazy, Suspense } from 'react';
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useAutoReconnect } from '../../hooks/useAutoReconnect';
import ChatView from '../ChatView/ChatView';
import InputBar from '../ChatView/InputBar';
import ChatRuntimeStrip from '../ChatView/ChatRuntimeStrip';
import TopBar from './TopBar';
import SlimActivityBar from './SlimActivityBar';
import DesktopSidebar from './DesktopSidebar';
import RightPane from './RightPane';
import MainHeader from './MainHeader';

// 懒加载：仅当 showACPLogs=true 时才用到，避免调试面板进入首屏 bundle
const ACPLogPanel = lazy(() => import('../Debug/ACPLogPanel'));

interface Props {
  /** 由 App 层透传的回调：启动 Agent（点击 Sidebar 新建会话时调用） */
  onStartAgent: (
    agentId: string,
    workDir: string,
    opts?: { geminiSessionId?: string; model?: string },
  ) => void;
  onStopAgent: (agentId: string) => void;
  onSendPrompt: (text: string) => void;
  onSlashCommand: (commandId: string) => void;
  onCancel: () => void;
  onReconnectSession: () => void;
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
  /** 透传给 RightPane 文件操作 */
  onSendWS: (msg: { type: string; payload: unknown }) => void;
  /** 外部控制的 TopBar launchTrigger（来自 App），数字递增即触发 Launch 弹窗 */
  launchTrigger: number;
}

/**
 * 桌面端整体布局壳（方案 §4.1）：
 *
 * ┌──┬─────────────┬──────────────┬────────────┐
 * │Ac│             │              │            │
 * │ti│  Sidebar    │     Main     │ Right Pane │
 * │vi│  (220px)    │   (flex-1)   │  (380px)   │
 * │ty│             │              │            │
 * └──┴─────────────┴──────────────┴────────────┘
 *
 * 关键点：
 *  - ActivityBar / Sidebar 不走 Allotment，是独立 flex 子元素（方案 §10 风险提示）
 *  - Allotment 只管 Main + RightPane 的水平分割（Q2=A：保留可拖）
 *  - Main 内再用竖向 Allotment 管 Chat 和 ACPLog 的可选分割
 */
export default function DesktopShell({
  onStartAgent,
  onStopAgent,
  onSendPrompt,
  onSlashCommand,
  onCancel,
  onReconnectSession,
  onPermissionRespond,
  onSendWS,
  launchTrigger,
}: Props) {
  const isThinking = useChatStore((s) => s.isAgentThinking);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const showACPLogs = useChatStore((s) => s.showACPLogs);

  const rightPaneOpen = useUIStore((s) => s.rightPaneOpen);

  const isAgentRunning = agentStatus === 'running';

  // PC 端进入聊天主壳时，按用户偏好自动恢复 Agent 会话（每 session 仅一次）
  useAutoReconnect(onReconnectSession);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--color-surface-0)',
      }}
    >
      {/*
        TopBar 以 hideHeader 模式挂载：
        不显示任何 UI，但保留 launchTrigger 驱动的 workspace picker / Gemini session picker 逻辑；
        等 P4/P5 再把这些 picker 拆出来，目前 P3 阶段复用。
      */}
      <TopBar
        onStartAgent={onStartAgent}
        onStopAgent={onStopAgent}
        launchTrigger={launchTrigger}
        hideHeader
      />

      {/* 主体：ActivityBar + Sidebar + (Main | RightPane) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SlimActivityBar />
        <DesktopSidebar onNewSession={() => { /* 由 SlimActivityBar + ProjectAccordion 触发，此处占位 */ }} />

        {/* 主区 + 右侧 Pane：用 Allotment 可拖分割 */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Allotment proportionalLayout={false}>
            {/* 主区 */}
            <Allotment.Pane minSize={360}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                }}
              >
                <MainHeader />

                {/* 聊天 + ACPLog 竖向分割 */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Allotment vertical proportionalLayout={false}>
                    <Allotment.Pane minSize={200}>
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        <ChatRuntimeStrip onReconnectSession={onReconnectSession} />
                        <ChatView onPermissionRespond={onPermissionRespond} />
                        <InputBar
                          onSend={onSendPrompt}
                          onSlashCommand={onSlashCommand}
                          disabled={!isAgentRunning}
                          isThinking={isThinking}
                          onCancel={onCancel}
                        />
                      </div>
                    </Allotment.Pane>
                    {showACPLogs && (
                      <Allotment.Pane minSize={120} preferredSize={250} maxSize={500}>
                        <Suspense fallback={null}>
                          <ACPLogPanel />
                        </Suspense>
                      </Allotment.Pane>
                    )}
                  </Allotment>
                </div>
              </div>
            </Allotment.Pane>

            {/* 右侧 Pane */}
            {rightPaneOpen && (
              <Allotment.Pane minSize={280} preferredSize={380} maxSize={640}>
                <RightPane onSendWS={onSendWS} />
              </Allotment.Pane>
            )}
          </Allotment>
        </div>
      </div>
    </div>
  );
}
