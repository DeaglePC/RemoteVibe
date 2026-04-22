import type { Session } from './chatStore';

/**
 * 项目 = workDir（Q3.1=A 拍板）。
 *
 * 项目的 key 是工作目录绝对路径，显示名取路径尾段（最后一级目录名），
 * 如 `/Users/xxx/github/RemoteVibe` 展示为 `RemoteVibe`，全路径作 tooltip 用。
 */
export interface Project {
  /** 工作目录绝对路径，稳定唯一 key */
  workDir: string;
  /** 人类可读的短名称（workDir 的尾段目录名） */
  displayName: string;
  /** 该项目下的所有会话，按 createdAt 降序（最新在前） */
  sessions: Session[];
  /** 该项目下最近一次会话活动时间（取 sessions 中最大的 createdAt） */
  lastActivityAt: number;
}

/**
 * 从一个 workDir 解析出可读的短名称。
 * 移除尾部斜杠，取最后一级目录名；若为空则回退到原路径。
 */
export function deriveProjectName(workDir: string): string {
  if (!workDir) return '(无目录)';
  const trimmed = workDir.replace(/\/+$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : workDir;
}

/**
 * 按 workDir 将会话列表分组为项目数组。
 *
 * @param sessions 原始会话列表
 * @returns 按 `lastActivityAt` 降序排列的项目列表；每个项目下的会话也按创建时间降序
 */
export function selectProjects(sessions: Session[]): Project[] {
  const byWorkDir = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = session.workDir || '';
    const bucket = byWorkDir.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      byWorkDir.set(key, [session]);
    }
  }

  const projects: Project[] = [];
  for (const [workDir, groupSessions] of byWorkDir) {
    const sorted = [...groupSessions].sort((a, b) => b.createdAt - a.createdAt);
    const lastActivityAt = sorted.length > 0 ? sorted[0].createdAt : 0;
    projects.push({
      workDir,
      displayName: deriveProjectName(workDir),
      sessions: sorted,
      lastActivityAt,
    });
  }

  projects.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return projects;
}

/**
 * 根据 sessionId 找到它所属的项目 workDir。
 * 找不到时返回 `null`。
 */
export function findProjectOfSession(sessions: Session[], sessionId: string | null): string | null {
  if (!sessionId) return null;
  const session = sessions.find((s) => s.id === sessionId);
  return session ? session.workDir : null;
}
