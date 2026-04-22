import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { useAutoReconnect } from '../../hooks/useAutoReconnect';
import ChatView from '../ChatView/ChatView';
import InputBar from '../ChatView/InputBar';
import { ActivityBadge, ConnectivityBadge } from '../ChatView/ChatRuntimeStrip';
import MobilePageHeader from '../Layout/MobilePageHeader';
import HeaderMetrics from '../Layout/HeaderMetrics';

/**
 * 手机端 L2 聊天页（方案 §5.3）。
 *
 * - 左上角返回按钮 ← pop 回首页（首页 TabBar 自动重新显示）
 * - 右上角 📂 文件按钮 push 到文件树页（L3）
 * - 页面内部布局：ChatView（flex:1） + Activity 徽标 + InputBar
 *
 * 小细节：
 *  - Header 带 safe-area-inset-top；底部不加 safe-area，由 InputBar 自己负责内边距
 *  - 禁用运行中的会话输入由 isAgentRunning 控制
 *  - Model、Context 等运行态指标在 PageHeader 右侧展示（HeaderMetrics）
 *  - 连接状态（就绪 / 点击恢复 / 离线…）通过 ConnectivityBadge 嵌在 Header 副标题
 *  - Agent Activity（Thinking / Using tools…）通过 ActivityBadge 展示在输入框左上方
 */
interface Props {
  onSendPrompt: (text: string) => void;
  onSlashCommand: (commandId: string) => void;
  onCancel: () => void;
  onReconnectSession: () => void;
  onPermissionRespond: (requestId: unknown, optionId: string) => void;
}

export default function ChatPage({
  onSendPrompt,
  onSlashCommand,
  onCancel,
  onReconnectSession,
  onPermissionRespond,
}: Props) {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const session = sessions.find((s) => s.id === activeSessionId) || null;

  const isThinking = useChatStore((s) => s.isAgentThinking);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);

  const popMobilePage = useUIStore((s) => s.popMobilePage);
  const pushMobilePage = useUIStore((s) => s.pushMobilePage);

  const isAgentRunning = agentStatus === 'running';

  // 软键盘弹起时把 InputBar / ChatStatusBar 顶起，避免被键盘遮挡
  const keyboardInset = useKeyboardInset();

  // 进入聊天页时，根据用户偏好自动恢复 Agent 会话（仅触发一次 / 每 session）
  useAutoReconnect(onReconnectSession);

  const handleBack = useCallback(() => {
    popMobilePage();
  }, [popMobilePage]);

  const handleOpenFiles = useCallback(() => {
    if (!activeWorkDir) return;
    pushMobilePage({ type: 'files', rootPath: activeWorkDir });
  }, [activeWorkDir, pushMobilePage]);

  return (
    <>
      <MobilePageHeader
        title={session?.name || '聊天'}
        subtitle={<ConnectivityBadge onReconnectSession={onReconnectSession} />}
        onBack={handleBack}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Model 指标（紧凑模式）*/}
            <HeaderMetrics compact />
            <button
              type="button"
              onClick={handleOpenFiles}
              aria-label="文件"
              disabled={!activeWorkDir}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                padding: '8px 6px',
                fontSize: 18,
                cursor: activeWorkDir ? 'pointer' : 'not-allowed',
                opacity: activeWorkDir ? 1 : 0.4,
                color: 'var(--color-text-primary)',
              }}
            >
              📂
            </button>
          </div>
        }
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          // 键盘弹起时预留底部空间；支持平滑过渡
          paddingBottom: keyboardInset,
          transition: 'padding-bottom var(--duration-fast, 120ms) var(--ease-out, ease-out)',
        }}
      >
        <ChatView onPermissionRespond={onPermissionRespond} />
        {/* 输入框左上方：Agent 当前活动徽标（Thinking / Using tools / Responding…） */}
        <div
          style={{
            flexShrink: 0,
            padding: '2px 16px 0',
            minHeight: 18,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ActivityBadge />
        </div>
        <InputBar
          onSend={onSendPrompt}
          onSlashCommand={onSlashCommand}
          disabled={!isAgentRunning}
          isThinking={isThinking}
          onCancel={onCancel}
        />
      </div>
    </>
  );
}
