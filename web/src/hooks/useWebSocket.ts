import { useEffect, useRef, useCallback } from 'react';
import { useChatStore, genMessageId } from '../stores/chatStore';
import { useBackendStore, getWsUrl } from '../stores/backendStore';
import type {
  ServerMessage,
  AgentStatusPayload,
  AgentListPayload,
  MessageChunkPayload,
  ToolCallPayload,
  ToolCallUpdatePayload,
  PermissionRequestPayload,
  PlanUpdatePayload,
  ErrorPayload,
  ClientMessage,
  FileChangePayload,
  TurnCompletePayload,
  ACPLogPayload,
  GeminiSessionsPayload,
  FSEventPayload,
} from '../types/protocol';
import { MSG } from '../types/protocol';

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(WS_RECONNECT_DELAY);
  // 标记是否为主动关闭（切换后端/组件卸载），主动关闭时不触发自动重连
  const intentionalClose = useRef(false);

  // 订阅后端切换，触发重连
  const activeBackendId = useBackendStore((s) => s.activeBackendId);

  const store = useChatStore;

  const connect = useCallback(() => {
    // 使用 backendStore 构建 WebSocket URL
    const url = getWsUrl();

    store.getState().setWsStatus('connecting');
    intentionalClose.current = false;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      store.getState().setWsStatus('connected');
      reconnectDelay.current = WS_RECONNECT_DELAY;
    };

    ws.onclose = (e) => {
      console.log('[WS] Disconnected:', e.code, e.reason);
      store.getState().setWsStatus('disconnected');
      wsRef.current = null;
      // 主动关闭时不自动重连，避免切换后端时产生多余连接
      if (!intentionalClose.current) {
        scheduleReconnect();
      }
    };

    ws.onerror = (e) => {
      console.error('[WS] Error:', e);
    };

    ws.onmessage = (e) => {
      try {
        const msg: ServerMessage = JSON.parse(e.data);
        handleMessage(msg);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      console.log(`[WS] Reconnecting in ${reconnectDelay.current}ms...`);
      connect();
      reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, WS_MAX_RECONNECT_DELAY);
    }, reconnectDelay.current);
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Not connected, cannot send:', msg);
    }
  }, []);

  // ==================== Message Handlers ====================

  const handleMessage = (msg: ServerMessage) => {
    const s = store.getState();

    switch (msg.type) {
      case MSG.AGENT_LIST: {
        const p = msg.payload as AgentListPayload;
        s.setAgents(p.agents);
        break;
      }

      case MSG.AGENT_STATUS: {
        const p = msg.payload as AgentStatusPayload;
        s.setAgentStatus(p.status);
        if (p.agentId) s.setActiveAgentId(p.agentId);
        if (p.error) s.setLastError(p.error);
        if (p.status === 'running') {
          // Agent 就绪时重置 thinking 状态，避免恢复会话期间
          // 收到的 session/update 通知把 isAgentThinking 置为 true 后无法恢复
          s.setIsAgentThinking(false);
          s.clearThinkingContent();
          s.setAgentActivity('idle');
          s.addMessage({
            id: genMessageId(),
            role: 'system',
            content: `✅ Agent connected and ready.`,
            timestamp: Date.now(),
          });
        } else if (p.status === 'error') {
          s.addMessage({
            id: genMessageId(),
            role: 'system',
            content: `❌ Agent error: ${p.error}`,
            timestamp: Date.now(),
          });
        } else if (p.status === 'stopped' || p.status === 'disconnected') {
          s.setShowFileBrowser(false);
          // Agent 停止或断开时，确保退出 thinking 状态
          s.setIsAgentThinking(false);
          s.clearThinkingContent();
          s.setAgentActivity('idle');
          s.addMessage({
            id: genMessageId(),
            role: 'system',
            content: `⏹️ Agent ${p.status}.`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case MSG.MESSAGE_CHUNK: {
        const p = msg.payload as MessageChunkPayload;
        // 注意：不在这里设 setIsAgentThinking(true)
        // thinking 状态由发送 prompt（App.tsx handleSendPrompt）和 THOUGHT_CHUNK 触发，
        // 避免恢复会话时 Gemini CLI 的历史摘要 notification 误触发 thinking 状态
        s.appendToLastAgentMessage(p.text);
        // 更新活动类型为 streaming（正在输出回复）
        s.setAgentActivity('streaming');
        break;
      }

      case MSG.THOUGHT_CHUNK: {
        const p = msg.payload as MessageChunkPayload;
        s.setIsAgentThinking(true);
        s.appendThinkingContent(p.text);
        // setIsAgentThinking 已经会设置 agentActivity = 'thinking'
        break;
      }

      case MSG.TOOL_CALL: {
        const p = msg.payload as ToolCallPayload;
        s.addToolCall(p);
        s.setAgentActivity('tool_calling');
        break;
      }

      case MSG.TOOL_CALL_UPDATE: {
        const p = msg.payload as ToolCallUpdatePayload;
        s.updateToolCall(p.toolCallId, p.status, p.content);
        break;
      }

      case MSG.PERMISSION_REQUEST: {
        const p = msg.payload as PermissionRequestPayload;
        s.addPermissionRequest(p);
        break;
      }

      case MSG.TURN_COMPLETE: {
        const p = msg.payload as TurnCompletePayload;
        s.setIsAgentThinking(false);
        s.clearThinkingContent();
        s.setAgentActivity('idle');
        // 将所有残留的 pending/in_progress 工具调用标记为 completed
        s.completeAllToolCalls();
        // 保存统计信息（来自 Gemini CLI result 事件的 stats）
        s.setLastTurnStats(p.stats || null);
        // 当 stopReason 为 error 时，显示详细错误信息
        if (p.stopReason === 'error' && p.errorMessage) {
          s.setLastError(p.errorMessage);
          s.addMessage({
            id: genMessageId(),
            role: 'system',
            content: `❌ ${p.errorMessage}`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case MSG.PLAN_UPDATE: {
        const p = msg.payload as PlanUpdatePayload;
        s.setPlanEntries(p.entries);
        break;
      }

      case MSG.ERROR: {
        const p = msg.payload as ErrorPayload;
        s.setLastError(p.message);
        s.addMessage({
          id: genMessageId(),
          role: 'system',
          content: `⚠️ ${p.message}`,
          timestamp: Date.now(),
        });
        break;
      }

      case MSG.GEMINI_SESSIONS: {
        const p = msg.payload as GeminiSessionsPayload;
        s.setGeminiSessions(p.sessions || []);
        break;
      }

      case MSG.FILE_CHANGE: {
        const p = msg.payload as FileChangePayload;
        s.addFileChange(p);
        break;
      }

      case MSG.FS_EVENT: {
        const p = msg.payload as FSEventPayload;
        s.emitFSEvent(p);
        break;
      }

      case MSG.ACP_LOG: {
        const p = msg.payload as ACPLogPayload;
        s.addACPLog(p);
        break;
      }
    }
  };

  // 安全关闭当前连接
  const closeCurrentConnection = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      intentionalClose.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Connect on mount, and reconnect when backend changes
  useEffect(() => {
    closeCurrentConnection();
    reconnectDelay.current = WS_RECONNECT_DELAY;
    connect();

    return () => {
      closeCurrentConnection();
    };
  }, [connect, closeCurrentConnection, activeBackendId]); // activeBackendId 变化时重连

  return { send };
}
