import { lazy, Suspense, useEffect, useRef } from 'react';
import { Allotment, type AllotmentHandle } from 'allotment';
import 'allotment/dist/style.css';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useAutoReconnect } from '../../hooks/useAutoReconnect';
import ChatView from '../ChatView/ChatView';
import InputBar from '../ChatView/InputBar';
import TerminalView from '../ChatView/TerminalView';
import { ActivityBadge } from '../ChatView/ChatRuntimeStrip';
import TopBar from './TopBar';
import SlimActivityBar from './SlimActivityBar';
import DesktopSidebar from './DesktopSidebar';
import RightPane from './RightPane';
import MainHeader from './MainHeader';

// 懒加载：仅当 showACPLogs=true 时才用到，避免调试面板进入首屏 bundle
const ACPLogPanel = lazy(() => import('../Debug/ACPLogPanel'));

// 文件面板默认宽度（仅文件树）
const FILE_PANE_DEFAULT_WIDTH = 420;
// 文件面板在打开预览时的期望宽度（文件树 + 预览）
const FILE_PANE_WITH_PREVIEW_WIDTH = 720;

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
  onOpenModelSheet?: () => void;
  onCancel: () => void;
  onReconnectSession: () => void;
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
  /** 透传给 RightPane 文件操作 */
  onSendWS: (msg: { type: string; payload: unknown }) => void;
  /** 外部控制的 TopBar launchTrigger（来自 App），数字递增即触发 Launch 弹窗 */
  launchTrigger: number;
  /**
   * 触发「新建会话 / 打开工作区」弹窗的回调。
   * 由 App 层透传，调用后会递增 launchTrigger，由 TopBar 响应弹出 WorkspacePicker。
   * Sidebar 里的 ProjectAccordion 顶部 ＋ 按钮以及项目下的「＋ 新建会话」都最终触发此回调。
   */
  onLaunch: () => void;
}

/**
 * 桌面端整体布局壳（方案 §4.1）：
 *
 * ┌──┬─────────────┬────────────┬──────────────┐
 * │Ac│             │            │              │
 * │ti│  Sidebar    │ File Pane  │     Main     │
 * │vi│  (220px)    │  (420px)   │   (flex-1)   │
 * │ty│             │            │              │
 * └──┴─────────────┴────────────┴──────────────┘
 *
 * 关键点：
 *  - ActivityBar / Sidebar 不走 Allotment，是独立 flex 子元素（方案 §10 风险提示）
 *  - Allotment 只管 FilePane + Main 的水平分割（文件面板位于聊天窗口左侧）
 *  - Main 内再用竖向 Allotment 管 Chat 和 ACPLog 的可选分割
 */
export default function DesktopShell({
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
  const isThinking = useChatStore((s) => s.isAgentThinking);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const showACPLogs = useChatStore((s) => s.showACPLogs);
  const viewingFile = useChatStore((s) => s.viewingFile);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);

  const rightPaneOpen = useUIStore((s) => s.rightPaneOpen);
  const terminalMode = useUIStore((s) => s.terminalMode);

  const isAgentRunning = agentStatus === 'running';

  // PC 端进入聊天主壳时，按用户偏好自动恢复 Agent 会话（每 session 仅一次）
  useAutoReconnect(onReconnectSession);

  // 外层（FilePane + Main）水平 Allotment 的 handle：用于在打开/关闭文件预览时主动调整文件面板宽度
  const outerAllotmentRef = useRef<AllotmentHandle>(null);

  // 当 viewingFile 从无到有：扩宽文件面板；从有到无：恢复默认宽度（仅当文件面板本身开启时）
  useEffect(() => {
    if (!rightPaneOpen) {
      return;
    }
    const container = outerAllotmentRef.current;
    if (!container) {
      return;
    }
    const targetFilePaneWidth = viewingFile
      ? FILE_PANE_WITH_PREVIEW_WIDTH
      : FILE_PANE_DEFAULT_WIDTH;
    // Main 区域用较大的 sentinel 值，Allotment 会按 minSize/maxSize 自行裁剪并把剩余空间分给它
    container.resize([targetFilePaneWidth, Number.MAX_SAFE_INTEGER]);
  }, [viewingFile, rightPaneOpen]);

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

      {/* 主体：ActivityBar + Sidebar + (FilePane | Main) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SlimActivityBar />
        <DesktopSidebar onNewSession={() => onLaunch()} />

        {/* 文件 Pane + 主区：用 Allotment 可拖分割（文件 Pane 置于聊天窗口左侧） */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Allotment ref={outerAllotmentRef} proportionalLayout={false}>
            {/* 文件 Pane（位于聊天区左侧） */}
            {rightPaneOpen && (
              <Allotment.Pane
                minSize={280}
                preferredSize={FILE_PANE_DEFAULT_WIDTH}
                maxSize={1000}
              >
                <RightPane onSendWS={onSendWS} />
              </Allotment.Pane>
            )}

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
                <MainHeader onReconnectSession={onReconnectSession} />

                {/* 聊天 + ACPLog 竖向分割 */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Allotment vertical proportionalLayout={false}>
                    <Allotment.Pane minSize={200}>
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                        {terminalMode ? (
                          <TerminalView cwd={activeWorkDir} />
                        ) : (
                          <>
                            <ChatView onPermissionRespond={onPermissionRespond} />
                            {/* 输入框左上方的 Activity 徽标（Thinking / Using tools…），仅忙碌时占位 */}
                            <div
                              style={{
                                flexShrink: 0,
                                minHeight: 18,
                                padding: '2px 14px 0',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <ActivityBadge />
                            </div>
                            <InputBar
                              onSend={onSendPrompt}
                              onSlashCommand={onSlashCommand}
                              onOpenModelSheet={onOpenModelSheet}
                              disabled={!isAgentRunning}
                              isThinking={isThinking}
                              onCancel={onCancel}
                            />
                          </>
                        )}
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
          </Allotment>
        </div>
      </div>
    </div>
  );
}
