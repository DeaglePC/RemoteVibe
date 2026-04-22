// useAutoReconnect.ts
// 自动恢复 Agent 会话：当满足以下条件时，静默触发一次 Reconnect。
//   1. 用户在设置里开启了 "autoReconnectOnOpen"（默认开启）
//   2. 当前聊天上下文可恢复（activeSessionId + activeAgentId + activeWorkDir）
//   3. Agent 未在运行/启动中
//   4. WebSocket 已连接
// 同一个 sessionId 只会自动触发一次，避免 WS 抖动导致反复拉起进程。

import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';

/**
 * useAutoReconnect 挂载到承载聊天主区的页面（ChatPage/DesktopShell/App），
 * 根据当前 chatStore 状态与 uiStore 偏好决定是否自动触发 onReconnect。
 *
 * @param onReconnect - 用户的 Reconnect 处理函数（通常来自 App.handleReconnectSession）
 */
export function useAutoReconnect(onReconnect: () => void): void {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const autoReconnectOnOpen = useUIStore((s) => s.autoReconnectOnOpen);

  // 记录已对哪个 sessionId 自动触发过，防止重复拉起
  const triggeredRef = useRef<string | null>(null);

  // 切换会话时重置触发记录
  useEffect(() => {
    triggeredRef.current = null;
  }, [activeSessionId]);

  useEffect(() => {
    if (!autoReconnectOnOpen) return;
    if (!activeSessionId || !activeAgentId || !activeWorkDir) return;
    if (wsStatus !== 'connected') return;
    if (agentStatus === 'running' || agentStatus === 'starting') return;
    if (triggeredRef.current === activeSessionId) return;

    triggeredRef.current = activeSessionId;
    onReconnect();
  }, [
    autoReconnectOnOpen,
    activeSessionId,
    activeAgentId,
    activeWorkDir,
    agentStatus,
    wsStatus,
    onReconnect,
  ]);
}
