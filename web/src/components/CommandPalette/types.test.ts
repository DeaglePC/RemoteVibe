import { describe, expect, it } from 'vitest';
import type { CommandDef } from './types';
import { scoreCommand } from './types';

const cmd = (over: Partial<CommandDef>): CommandDef => ({
  id: 'x',
  title: 'Toggle Sidebar',
  keywords: 'layout panel',
  run: () => {},
  ...over,
});

describe('scoreCommand', () => {
  it('returns 1 for empty query (keeps all)', () => {
    expect(scoreCommand(cmd({}), '')).toBe(1);
  });

  it('gives substring match a solid score', () => {
    expect(scoreCommand(cmd({}), 'sidebar')).toBeGreaterThanOrEqual(10);
  });

  it('gives a bonus when title starts with the query', () => {
    const plain = scoreCommand(cmd({ title: 'Open Settings' }), 'settings');
    const prefix = scoreCommand(cmd({ title: 'Settings' }), 'settings');
    expect(prefix).toBeGreaterThan(plain);
  });

  it('returns low but positive score for char-by-char subsequence', () => {
    expect(scoreCommand(cmd({ title: 'Toggle Sidebar' }), 'tgsb')).toBeGreaterThan(0);
  });

  it('returns 0 when no character can match', () => {
    expect(scoreCommand(cmd({ title: 'abc', keywords: '' }), 'xyz')).toBe(0);
  });

  it('matches against keywords too', () => {
    expect(scoreCommand(cmd({ keywords: 'layout panel' }), 'layout')).toBeGreaterThanOrEqual(10);
  });
});
