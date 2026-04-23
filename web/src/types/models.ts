import type { AgentKind } from './protocol';

/**
 * ModelOption 描述一个可选模型在 UI 中的展示与实际传给 CLI 的 id。
 * - id: 传给后端 start_agent 的 model 参数值，空字符串表示"使用 CLI 默认"
 * - label: 面板中显示的简短名称
 * - desc: 二级说明，可选
 */
export interface ModelOption {
  id: string;
  label: string;
  desc?: string;
}

/**
 * Gemini CLI 可用模型。
 * 来源：与项目既有列表保持一致（gemini-2.5 系列）。
 */
const GEMINI_MODELS: ModelOption[] = [
  { id: '', label: 'Default', desc: 'Use CLI default model' },
  { id: 'gemini-2.5-pro', label: '2.5 Pro', desc: 'Most capable' },
  { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'Fast & balanced' },
  { id: 'gemini-2.5-flash-lite', label: '2.5 Flash Lite', desc: 'Fastest & cheapest' },
];

/**
 * Claude Code 可用模型。
 * 来源：`claude --help` 中 --model 选项文档说明：
 *   "Provide an alias for the latest model (e.g. 'sonnet' or 'opus')
 *    or a model's full name (e.g. 'claude-sonnet-4-6')."
 * alias 更稳妥（官方会自动指到最新版本），以 alias 为主。
 */
const CLAUDE_MODELS: ModelOption[] = [
  { id: '', label: 'Default', desc: 'Use CLI default model' },
  { id: 'opus', label: 'Opus', desc: 'Most capable alias' },
  { id: 'sonnet', label: 'Sonnet', desc: 'Balanced alias' },
  { id: 'haiku', label: 'Haiku', desc: 'Fastest alias' },
];

/**
 * OpenAI Codex CLI 可用模型。
 * 来源：Codex CLI 官方文档公开的模型族；
 * 注意：Codex CLI 升级频繁，具体白名单以 `codex --help` 为准。
 * 这里只保留社区常用的几个；更多模型请按需扩展。
 */
const CODEX_MODELS: ModelOption[] = [
  { id: '', label: 'Default', desc: 'Use CLI default model' },
  { id: 'gpt-5-codex', label: 'GPT-5 Codex', desc: 'Coding-optimized' },
  { id: 'gpt-5', label: 'GPT-5', desc: 'General purpose' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', desc: 'Fast & cheap' },
  { id: 'o3', label: 'o3', desc: 'Reasoning' },
  { id: 'o4-mini', label: 'o4-mini', desc: 'Reasoning, fast' },
];

/**
 * OpenCode 可用模型。
 * OpenCode 的 --model 格式为 "provider/model"；实际可用模型由用户本地 auth 的 provider 决定。
 * 完整清单请运行 `opencode models`。这里选几个跨 provider 的标杆作为默认建议。
 */
const OPENCODE_MODELS: ModelOption[] = [
  { id: '', label: 'Default', desc: 'Use CLI default model' },
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { id: 'openai/gpt-5', label: 'GPT-5' },
  { id: 'openai/gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'opencode/gpt-5-nano', label: 'GPT-5 Nano', desc: 'Free via opencode.ai' },
];

const MODELS_BY_KIND: Record<AgentKind, ModelOption[]> = {
  gemini: GEMINI_MODELS,
  claude: CLAUDE_MODELS,
  codex: CODEX_MODELS,
  opencode: OPENCODE_MODELS,
};

/**
 * 根据 agent kind 返回可选模型列表；当 kind 为空时返回空数组（表示当前 agent 无可选模型）。
 */
export function getModelsForKind(kind?: AgentKind | null): ModelOption[] {
  if (!kind) {
    return [];
  }
  return MODELS_BY_KIND[kind];
}
