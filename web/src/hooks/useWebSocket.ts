import { useEffect, useRef, useCallback } from 'react';
import { useChatStore, genMessageId } from '../stores/chatStore';
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
} from '../types/protocol';
import { MSG } from '../types/protocol';

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(WS_RECONNECT_DELAY);

  const store = useChatStore;

  const connect = useCallback(() => {
    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = localStorage.getItem('bmh_token') || '';
    const url = `${protocol}//${host}/ws${token ? `?token=${token}` : ''}`;

    store.getState().setWsStatus('connecting');

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
      scheduleReconnect();
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
        }
        break;
      }

      case MSG.MESSAGE_CHUNK: {
        const p = msg.payload as MessageChunkPayload;
        s.setIsAgentThinking(true);
        s.appendToLastAgentMessage(p.text);
        break;
      }

      case MSG.TOOL_CALL: {
        const p = msg.payload as ToolCallPayload;
        s.addToolCall(p);
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
        s.setIsAgentThinking(false);
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
    }
  };

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { send };
}
