import { describe, expect, it } from 'vitest';
import { extractThoughtSegments } from './thoughtExtractor';

describe('extractThoughtSegments', () => {
  it('returns original content as answer when no markers are present', () => {
    const result = extractThoughtSegments('Hello, this is a plain answer.');
    expect(result.thoughts).toEqual([]);
    expect(result.answer).toBe('Hello, this is a plain answer.');
  });

  it('treats content between a pair of markers as a single thought (option B)', () => {
    const input = '[Thought: true]Reasoning step here.[Thought: false]Final answer here.';
    const result = extractThoughtSegments(input);
    // [true]...[false] 之间是一段 thought；最后一个标记之后的文本是 answer
    expect(result.thoughts).toEqual(['Reasoning step here.']);
    expect(result.answer).toBe('Final answer here.');
  });

  it('splits every segment between markers into its own thought', () => {
    // 模拟截图中的真实场景：头部无正文，中间多段思考，尾部才是真正的回答
    const input =
      '[Thought: true]Verifying Final Implementation ... confident.[Thought: false]Completing the WeChat feature ... to the user.[Thought: true]我已成功为工具栏添加了"复制到微信"功能，可以交付使用。';
    const result = extractThoughtSegments(input);
    expect(result.thoughts).toEqual([
      'Verifying Final Implementation ... confident.',
      'Completing the WeChat feature ... to the user.',
    ]);
    expect(result.answer).toBe('我已成功为工具栏添加了"复制到微信"功能，可以交付使用。');
  });

  it('keeps leading text before the first marker as part of the answer', () => {
    const input = 'Intro paragraph.[Thought: true]Thinking A[Thought: false]Answer tail.';
    const result = extractThoughtSegments(input);
    expect(result.thoughts).toEqual(['Thinking A']);
    expect(result.answer).toBe('Intro paragraph.\n\nAnswer tail.');
  });

  it('handles case-insensitive markers with optional spaces', () => {
    const input = '[ thought : TRUE ]inner thought[ Thought:false ]visible answer';
    const result = extractThoughtSegments(input);
    expect(result.thoughts).toEqual(['inner thought']);
    expect(result.answer).toBe('visible answer');
  });

  it('returns empty structure for empty input', () => {
    const result = extractThoughtSegments('');
    expect(result.thoughts).toEqual([]);
    expect(result.answer).toBe('');
  });

  it('drops empty segments after trimming', () => {
    const input = '[Thought: true]   [Thought: false]Only answer.';
    const result = extractThoughtSegments(input);
    expect(result.thoughts).toEqual([]);
    expect(result.answer).toBe('Only answer.');
  });

  it('treats a lone trailing marker as ending the thought with empty answer tail', () => {
    // 只有一个标记时，前面是 answer，后面是 answer，中间没有成对的 thought 段
    const input = 'Pre text.[Thought: true]Tail text.';
    const result = extractThoughtSegments(input);
    expect(result.thoughts).toEqual([]);
    expect(result.answer).toBe('Pre text.\n\nTail text.');
  });
});
