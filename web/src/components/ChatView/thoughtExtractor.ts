/**
 * thoughtExtractor
 *
 * 某些 Agent（例如 Gemini CLI 恢复历史会话时）会把「思考内容」与「正式回答」
 * 混合在同一条 agent_message_chunk 中，并用 `[Thought: true]` / `[Thought: false]`
 * 这样的纯文本标记做分隔。此文件提供把它们分离开的工具函数，以便 UI 能单独
 * 渲染 thought 段（并支持默认折叠）与 answer 段。
 *
 * 语义约定（选项 B）：
 * - `[Thought: true]` 和 `[Thought: false]` 两类标记都属于「内部思考」的阶段分隔符，
 *   Gemini 会用它们把不同子阶段的思考内容串起来；因此**任何被标记包围的段落**都算
 *   一段 thought。
 * - 只有位于**所有标记之外**的内容（即消息开头第一个标记之前的段落，以及最后一个
 *   标记之后的段落）才是对用户的正式回答。
 * - 每遇到一个标记就结束当前 thought 段、开启下一段，便于 UI 以 `Thought #N` 形式
 *   逐段折叠展示。
 */

/** 抽取后的消息结构：包含若干 thought 段和最终拼接的正式回答 */
export interface ExtractedThoughts {
  /** 折叠后单独展示的 thought 段落，按顺序排列 */
  thoughts: string[];
  /** 从原始内容中剔除 thought 后的正式回答文本 */
  answer: string;
}

/** 匹配形如 `[Thought: true]` / `[Thought: false]` 的分隔标记（大小写不敏感，允许可选空格） */
const THOUGHT_MARKER_REGEX = /\[\s*Thought\s*:\s*(?:true|false)\s*\]/gi;

/**
 * extractThoughtSegments 将包含 `[Thought: true]` / `[Thought: false]` 标记的
 * 消息内容拆分成 thought 段与正式回答段。
 *
 * 规则：
 * - 没有任何标记时，thoughts 为空，answer 为原文
 * - 第一个标记**之前**的文本 → answer
 * - 最后一个标记**之后**的文本 → answer
 * - 任意相邻两个标记**之间**的文本 → 一段独立的 thought
 * - 所有段落都会 trim 掉前后空白，空段会被丢弃
 *
 * @param content 原始消息内容
 * @returns 拆分结果
 */
export function extractThoughtSegments(content: string): ExtractedThoughts {
  if (!content) {
    return { thoughts: [], answer: '' };
  }

  // 收集所有标记在字符串中的位置
  THOUGHT_MARKER_REGEX.lastIndex = 0;
  const markers: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = THOUGHT_MARKER_REGEX.exec(content)) !== null) {
    markers.push({ start: match.index, end: match.index + match[0].length });
  }

  // 未出现任何标记：快路径返回
  if (markers.length === 0) {
    return { thoughts: [], answer: content };
  }

  const thoughts: string[] = [];
  const answerParts: string[] = [];

  // 1) 第一个标记之前的内容 → answer
  const head = content.slice(0, markers[0].start);
  if (head.trim().length > 0) {
    answerParts.push(head.trim());
  }

  // 2) 相邻标记之间的内容 → 每段一个 thought
  for (let i = 0; i < markers.length - 1; i += 1) {
    const segment = content.slice(markers[i].end, markers[i + 1].start).trim();
    if (segment.length > 0) {
      thoughts.push(segment);
    }
  }

  // 3) 最后一个标记之后的内容 → answer
  const tail = content.slice(markers[markers.length - 1].end);
  if (tail.trim().length > 0) {
    answerParts.push(tail.trim());
  }

  return {
    thoughts,
    answer: answerParts.join('\n\n'),
  };
}
