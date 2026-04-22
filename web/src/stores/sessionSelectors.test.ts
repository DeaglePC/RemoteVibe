import { describe, expect, it } from 'vitest';
import type { Session } from './chatStore';
import { deriveProjectName, findProjectOfSession, selectProjects } from './sessionSelectors';

/** 构造测试用的最小 Session */
function mkSession(overrides: Partial<Session>): Session {
  return {
    id: 'sid',
    name: 'name',
    agentId: 'gemini',
    workDir: '/tmp/a',
    activeModel: null,
    messages: [],
    toolCalls: new Map(),
    pendingPermissions: [],
    planEntries: [],
    isAgentThinking: false,
    agentStatus: 'idle',
    lastTurnStats: null,
    createdAt: 0,
    ...overrides,
  };
}

describe('deriveProjectName', () => {
  it('takes the last path segment', () => {
    expect(deriveProjectName('/Users/abc/github/RemoteVibe')).toBe('RemoteVibe');
  });
  it('handles trailing slashes', () => {
    expect(deriveProjectName('/Users/abc/my-app/')).toBe('my-app');
  });
  it('falls back to input for empty/root path', () => {
    expect(deriveProjectName('/')).toBe('/');
    expect(deriveProjectName('')).toBe('(无目录)');
  });
});

describe('selectProjects', () => {
  it('returns empty array for empty sessions', () => {
    expect(selectProjects([])).toEqual([]);
  });

  it('groups sessions by workDir and sorts by lastActivity desc', () => {
    const sessions: Session[] = [
      mkSession({ id: 's1', workDir: '/proj/a', createdAt: 100 }),
      mkSession({ id: 's2', workDir: '/proj/b', createdAt: 300 }),
      mkSession({ id: 's3', workDir: '/proj/a', createdAt: 500 }),
      mkSession({ id: 's4', workDir: '/proj/a', createdAt: 200 }),
    ];
    const projects = selectProjects(sessions);

    // 项目排序：a 的最大 createdAt=500 > b 的 300，a 在前
    expect(projects.map((p) => p.workDir)).toEqual(['/proj/a', '/proj/b']);
    // a 下会话按 createdAt 降序
    expect(projects[0].sessions.map((s) => s.id)).toEqual(['s3', 's4', 's1']);
    expect(projects[0].lastActivityAt).toBe(500);
    expect(projects[0].displayName).toBe('a');
    expect(projects[1].sessions.map((s) => s.id)).toEqual(['s2']);
  });

  it('treats empty workDir as its own bucket', () => {
    const sessions: Session[] = [
      mkSession({ id: 's1', workDir: '', createdAt: 100 }),
      mkSession({ id: 's2', workDir: '/proj/a', createdAt: 50 }),
    ];
    const projects = selectProjects(sessions);
    expect(projects).toHaveLength(2);
    expect(projects[0].workDir).toBe('');
    expect(projects[0].displayName).toBe('(无目录)');
  });
});

describe('findProjectOfSession', () => {
  const sessions: Session[] = [
    mkSession({ id: 's1', workDir: '/proj/a' }),
    mkSession({ id: 's2', workDir: '/proj/b' }),
  ];

  it('returns the workDir of the given session', () => {
    expect(findProjectOfSession(sessions, 's2')).toBe('/proj/b');
  });

  it('returns null for unknown session id', () => {
    expect(findProjectOfSession(sessions, 'nope')).toBeNull();
  });

  it('returns null for null session id', () => {
    expect(findProjectOfSession(sessions, null)).toBeNull();
  });
});
