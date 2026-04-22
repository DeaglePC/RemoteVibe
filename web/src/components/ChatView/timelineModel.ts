import type { ChatMessage, ToolCallState } from '../../stores/chatStore';

/** 消息时间线条目 — 消息气泡本体 */
export interface MessageTimelineEntry {
  kind: 'message';
  message: ChatMessage;
  /** 归属于该 Agent 气泡之后（同一段 Agent 产出）的工具调用列表，按时间升序 */
  toolCalls: ToolCallState[];
}

/** 消息时间线条目 — 孤立工具调用（没有紧前的 Agent 气泡，独立渲染为一行） */
export interface OrphanToolTimelineEntry {
  kind: 'orphan_tool';
  toolCall: ToolCallState;
}

export type TimelineEntry = MessageTimelineEntry | OrphanToolTimelineEntry;

/**
 * normalizeTimestamp 将 timestamp / createdAt 规范化为可比较的有限数。
 * 无效值返回 null，由调用方决定如何处置。
 */
function normalizeTimestamp(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * buildChatTimeline 将消息列表与工具调用 Map 合并为按时间顺序排列的时间线。
 *
 * 归属规则：每个工具调用被归入「时间上紧邻其前方的 Agent 气泡」，
 * 即 toolCall.createdAt 落入某条 Agent 消息之后、下一条消息（任何角色）之前的时间区间。
 * 当工具调用早于第一条消息，或紧前的消息不是 Agent 角色时，视为孤立条目（orphan）。
 *
 * 兜底：无效的 createdAt 会退化到最后一个 Agent 气泡之后（若存在），否则视为 orphan。
 */
export function buildChatTimeline(
  messages: ChatMessage[],
  toolCalls: Map<string, ToolCallState>,
): TimelineEntry[] {
  // 1. 按 createdAt 升序（无效时间戳置后），稳定排序 — 保留到达顺序
  const indexedToolCalls = Array.from(toolCalls.values()).map((toolCall, originalIndex) => ({
    toolCall,
    originalIndex,
    normalizedCreatedAt: normalizeTimestamp(toolCall.createdAt),
  }));

  indexedToolCalls.sort((left, right) => {
    if (left.normalizedCreatedAt === null && right.normalizedCreatedAt === null) {
      return left.originalIndex - right.originalIndex;
    }
    if (left.normalizedCreatedAt === null) {
      return 1;
    }
    if (right.normalizedCreatedAt === null) {
      return -1;
    }
    if (left.normalizedCreatedAt !== right.normalizedCreatedAt) {
      return left.normalizedCreatedAt - right.normalizedCreatedAt;
    }
    return left.originalIndex - right.originalIndex;
  });

  // 2. 遍历消息 & 工具调用，按时间线交叉合并
  const entries: TimelineEntry[] = [];
  // 使用 MessageTimelineEntry 作为当前"锚点"，将后续工具调用挂载到其上
  let currentAgentAnchor: MessageTimelineEntry | null = null;
  let toolCursor = 0;

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const messageTime = normalizeTimestamp(message.timestamp) ?? 0;

    // 先排出所有时间戳早于当前消息的工具调用
    while (toolCursor < indexedToolCalls.length) {
      const candidate = indexedToolCalls[toolCursor];
      if (candidate.normalizedCreatedAt === null) {
        break; // 无效时间戳统一放在最后处理
      }
      if (candidate.normalizedCreatedAt >= messageTime) {
        break;
      }

      if (currentAgentAnchor) {
        currentAgentAnchor.toolCalls.push(candidate.toolCall);
      } else {
        entries.push({ kind: 'orphan_tool', toolCall: candidate.toolCall });
      }
      toolCursor += 1;
    }

    const entry: MessageTimelineEntry = {
      kind: 'message',
      message,
      toolCalls: [],
    };
    entries.push(entry);

    if (message.role === 'agent') {
      currentAgentAnchor = entry;
    } else {
      // user / system 消息会打断 Agent 气泡锚点，之后新进的工具调用会重置归属
      currentAgentAnchor = null;
    }
  }

  // 3. 处理剩余的工具调用（时间戳晚于所有消息的 & 时间戳有效的）
  while (toolCursor < indexedToolCalls.length) {
    const candidate = indexedToolCalls[toolCursor];
    if (candidate.normalizedCreatedAt === null) {
      break;
    }
    if (currentAgentAnchor) {
      currentAgentAnchor.toolCalls.push(candidate.toolCall);
    } else {
      entries.push({ kind: 'orphan_tool', toolCall: candidate.toolCall });
    }
    toolCursor += 1;
  }

  // 4. 处理所有无效时间戳的工具调用 — 兜底策略
  //    优先挂到最后一个 Agent 气泡上；否则 orphan。
  //    注：若最后一个 Agent 气泡的 timestamp 存在，仍按挂载策略处理（保证同一轮次视觉连续）
  if (toolCursor < indexedToolCalls.length) {
    // 寻找最后一个 Agent 气泡作为兜底锚点
    let fallbackAnchor: MessageTimelineEntry | null = null;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.kind === 'message' && entry.message.role === 'agent') {
        fallbackAnchor = entry;
        break;
      }
    }

    while (toolCursor < indexedToolCalls.length) {
      const candidate = indexedToolCalls[toolCursor];
      if (fallbackAnchor) {
        fallbackAnchor.toolCalls.push(candidate.toolCall);
      } else {
        entries.push({ kind: 'orphan_tool', toolCall: candidate.toolCall });
      }
      toolCursor += 1;
    }
  }

  return entries;
}
