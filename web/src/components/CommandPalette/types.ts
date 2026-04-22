/**
 * Command Palette 命令定义。
 *
 * P3 阶段 MVP：只列出内置命令（会话切换、新建、Sidebar/Pane 折叠、主题切换等），
 * 不做通用命令注册中心，P5 再重构成 registry。
 */
export interface CommandDef {
  /** 稳定唯一 id */
  id: string;
  /** 展示标题 */
  title: string;
  /** 次要描述（可选） */
  subtitle?: string;
  /** 搜索关键字（除了 title 外，这些词也会被用于模糊匹配；用空格分隔） */
  keywords?: string;
  /** 前缀图标（emoji 或单字符） */
  icon?: string;
  /** 显示在右侧的快捷键提示，例如 "⌘B" */
  shortcut?: string;
  /** 执行动作 */
  run: () => void;
}

/** 对命令做模糊匹配评分（越高越匹配）。0 表示不匹配 */
export function scoreCommand(cmd: CommandDef, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1; // 空查询时全部保留
  const haystack = `${cmd.title} ${cmd.subtitle || ''} ${cmd.keywords || ''}`.toLowerCase();
  if (haystack.includes(q)) return 10 + (cmd.title.toLowerCase().startsWith(q) ? 5 : 0);

  // 简单的连续字符包含检测：q 的每个字符依次出现在 haystack 中
  let i = 0;
  for (const ch of q) {
    const idx = haystack.indexOf(ch, i);
    if (idx < 0) return 0;
    i = idx + 1;
  }
  return 1;
}
