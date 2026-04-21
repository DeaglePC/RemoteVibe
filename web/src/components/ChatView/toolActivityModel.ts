import type { PermissionRequestPayload } from '../../types/protocol';
import type { ToolCallState } from '../../stores/chatStore';

export interface ToolActivitySummary {
  totalCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  permissionCount: number;
}

export interface ToolActivityItem extends ToolCallState {
  pendingPermissionCount: number;
  hasDiff: boolean;
  hasTerminal: boolean;
  hasText: boolean;
}

export interface ToolActivityViewModel {
  summary: ToolActivitySummary;
  items: ToolActivityItem[];
}

function normalizeCreatedAt(createdAt: number): number | null {
  return Number.isFinite(createdAt) ? createdAt : null;
}

/**
 * compareToolCallsByTimeline 按工具调用创建时间升序排序。
 *
 * 当时间戳无效时，将其放到有效时间戳之后；当时间相同或都无效时，保留原始到达顺序。
 */
function compareToolCallsByTimeline(
  left: { toolCall: ToolCallState; originalIndex: number },
  right: { toolCall: ToolCallState; originalIndex: number },
): number {
  const leftCreatedAt = normalizeCreatedAt(left.toolCall.createdAt);
  const rightCreatedAt = normalizeCreatedAt(right.toolCall.createdAt);

  if (leftCreatedAt === null && rightCreatedAt === null) {
    return left.originalIndex - right.originalIndex;
  }

  if (leftCreatedAt === null) {
    return 1;
  }

  if (rightCreatedAt === null) {
    return -1;
  }

  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.originalIndex - right.originalIndex;
}

/**
 * buildToolActivityViewModel 将所有工具调用统一整理为独立的 tool activity 面板数据。
 */
export function buildToolActivityViewModel(
  toolCalls: Map<string, ToolCallState>,
  pendingPermissions: PermissionRequestPayload[],
): ToolActivityViewModel {
  const permissionCountByToolCallId = pendingPermissions.reduce<Record<string, number>>((acc, request) => {
    const currentCount = acc[request.toolCallId] || 0;
    return {
      ...acc,
      [request.toolCallId]: currentCount + 1,
    };
  }, {});

  const items = Array.from(toolCalls.values())
    .map((toolCall, originalIndex) => ({ toolCall, originalIndex }))
    .sort(compareToolCallsByTimeline)
    .map(({ toolCall }) => ({
      ...toolCall,
      pendingPermissionCount: permissionCountByToolCallId[toolCall.toolCallId] || 0,
      hasDiff: !!toolCall.content?.some((item) => item.type === 'diff'),
      hasTerminal: !!toolCall.content?.some((item) => item.type === 'terminal'),
      hasText: !!toolCall.content?.some((item) => item.type === 'text' && item.text),
    }));

  return {
    summary: {
      totalCount: items.length,
      activeCount: items.filter((toolCall) => toolCall.status === 'pending' || toolCall.status === 'in_progress').length,
      completedCount: items.filter((toolCall) => toolCall.status === 'completed').length,
      failedCount: items.filter((toolCall) => toolCall.status === 'failed').length,
      permissionCount: pendingPermissions.length,
    },
    items,
  };
}
