import { useState } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';

/**
 * TerminalQuickKeys 是移动端终端的快捷按键栏。
 *
 * 功能：
 *  - 提供 Ctrl / Esc / Tab / 方向键 / PageUp PageDown / ~ & $ * | > 等常用按键
 *  - Ctrl 是粘滞修饰键（sticky modifier）：
 *      1) 点一次：下一次按键作为 Ctrl+X 发送，然后自动解除
 *      2) 长按（500ms）：锁定 Ctrl，所有后续按键都作为 Ctrl+X，再点一次 Ctrl 解锁
 *  - 所有按钮点击时把对应字节通过 terminalStore.sendInput 发给 PTY
 *
 * 触摸友好尺寸：按钮 minHeight 36，字号 13，横向可滚动。
 */

/** 单个按键的定义 */
interface QuickKey {
  /** 显示的标签 */
  label: string;
  /** 发送到 PTY 的原始字节（字符串或 Uint8Array） */
  bytes: string | Uint8Array;
  /** 可选的提示文字 */
  title?: string;
  /** 是否为宽按钮（Tab、Esc 这种） */
  wide?: boolean;
}

/** 按 Ctrl+字母 生成控制字符字节，例如 Ctrl+C -> 0x03 */
function ctrlByte(ch: string): string {
  const c = ch.toUpperCase().charCodeAt(0);
  // A=65 -> 1, B=66 -> 2 ... Z=90 -> 26；空格(32)→0；[->27 \->28 ]->29 ^->30 _->31
  if (c >= 0x40 && c <= 0x5f) {
    return String.fromCharCode(c - 0x40);
  }
  // 不在 Ctrl 可识别范围内则直接发送原字符
  return ch;
}

/** 第 1 行：功能键（修饰键 + 方向/导航 + 常用控制） */
const ROW1: QuickKey[] = [
  // Ctrl / Esc / Tab 在组件里特殊处理渲染，这里只留占位
  { label: 'Esc', bytes: '\x1b', title: 'Escape', wide: true },
  { label: 'Tab', bytes: '\t', title: 'Tab', wide: true },
  { label: '↑', bytes: '\x1b[A', title: '上箭头' },
  { label: '↓', bytes: '\x1b[B', title: '下箭头' },
  { label: '←', bytes: '\x1b[D', title: '左箭头' },
  { label: '→', bytes: '\x1b[C', title: '右箭头' },
  { label: 'Home', bytes: '\x1b[H', title: 'Home', wide: true },
  { label: 'End', bytes: '\x1b[F', title: 'End', wide: true },
  { label: 'PgUp', bytes: '\x1b[5~', title: 'Page Up', wide: true },
  { label: 'PgDn', bytes: '\x1b[6~', title: 'Page Down', wide: true },
];

/** 第 2 行：终端常用符号（手机软键盘上难输入的） */
const ROW2: QuickKey[] = [
  { label: '~', bytes: '~' },
  { label: '/', bytes: '/' },
  { label: '\\', bytes: '\\' },
  { label: '|', bytes: '|' },
  { label: '-', bytes: '-' },
  { label: '_', bytes: '_' },
  { label: '&', bytes: '&' },
  { label: '$', bytes: '$' },
  { label: '*', bytes: '*' },
  { label: '#', bytes: '#' },
  { label: '!', bytes: '!' },
  { label: '>', bytes: '>' },
  { label: '<', bytes: '<' },
  { label: '"', bytes: '"' },
  { label: "'", bytes: "'" },
  { label: '`', bytes: '`' },
];

interface Props {
  /** 当前激活会话 id；为 null 时整个栏禁用 */
  activeSessionId: string | null;
}

export default function TerminalQuickKeys({ activeSessionId }: Props) {
  const sendInput = useTerminalStore((s) => s.sendInput);

  /** Ctrl 状态：'off' | 'once'（单次）| 'lock'（锁定） */
  const [ctrlMode, setCtrlMode] = useState<'off' | 'once' | 'lock'>('off');

  const disabled = !activeSessionId;

  /** 发送某个快捷键的字节，并在 Ctrl=once 时自动解除 */
  const fire = (bytes: string | Uint8Array) => {
    if (!activeSessionId) return;
    let data = bytes;
    // 如果处于 Ctrl 修饰态，并且 bytes 是单个可打印字符，转换为控制字符
    if (
      (ctrlMode === 'once' || ctrlMode === 'lock') &&
      typeof data === 'string' &&
      data.length === 1
    ) {
      data = ctrlByte(data);
    }
    sendInput(activeSessionId, data);
    // once 模式下发完就解除
    if (ctrlMode === 'once') {
      setCtrlMode('off');
    }
  };

  /** 点击 Ctrl：off→once，once→lock，lock→off */
  const handleCtrlClick = () => {
    setCtrlMode((m) => {
      if (m === 'off') return 'once';
      if (m === 'once') return 'lock';
      return 'off';
    });
  };

  const ctrlActive = ctrlMode !== 'off';
  const ctrlLabel = ctrlMode === 'lock' ? 'Ctrl🔒' : 'Ctrl';

  // 常用 Ctrl 组合的快捷（在 Ctrl 激活时点字母即可，这里额外放几个"固定 Ctrl+X"按钮在第一行尾部，
  // 便于高频操作一键发出，不依赖 Ctrl 状态）
  const ctrlShortcuts: QuickKey[] = [
    { label: '^C', bytes: '\x03', title: 'Ctrl+C 中断' },
    { label: '^D', bytes: '\x04', title: 'Ctrl+D EOF/退出' },
    { label: '^Z', bytes: '\x1a', title: 'Ctrl+Z 挂起' },
    { label: '^L', bytes: '\x0c', title: 'Ctrl+L 清屏' },
    { label: '^R', bytes: '\x12', title: 'Ctrl+R 反向搜索历史' },
    { label: '^U', bytes: '\x15', title: 'Ctrl+U 删除到行首' },
    { label: '^K', bytes: '\x0b', title: 'Ctrl+K 删除到行尾' },
    { label: '^W', bytes: '\x17', title: 'Ctrl+W 删除前一个词' },
    { label: '^A', bytes: '\x01', title: 'Ctrl+A 到行首' },
    { label: '^E', bytes: '\x05', title: 'Ctrl+E 到行尾' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 6px 8px 6px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface-1)',
        flexShrink: 0,
        // 为 iOS home indicator 留出安全区
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      onMouseDown={(e) => {
        // 防止点击快捷键时让 xterm 失焦（失焦后再输入会失败）
        e.preventDefault();
      }}
    >
      {/* 第 1 行：Ctrl / Esc / Tab / 方向 / 导航 + 常用 Ctrl 组合 */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <QuickKeyButton
          label={ctrlLabel}
          wide
          active={ctrlActive}
          title={
            ctrlMode === 'off'
              ? '点一次：下次按键作为 Ctrl+X；再点：锁定；再点：取消'
              : ctrlMode === 'once'
              ? '下一次按键将作为 Ctrl+X 发送'
              : '已锁定 Ctrl，所有按键都作为 Ctrl+X（再点解除）'
          }
          onClick={handleCtrlClick}
        />
        {ROW1.map((k) => (
          <QuickKeyButton
            key={k.label}
            label={k.label}
            wide={k.wide}
            title={k.title}
            onClick={() => fire(k.bytes)}
          />
        ))}
        {ctrlShortcuts.map((k) => (
          <QuickKeyButton
            key={k.label}
            label={k.label}
            title={k.title}
            onClick={() => fire(k.bytes)}
          />
        ))}
      </div>

      {/* 第 2 行：常用符号 */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {ROW2.map((k) => (
          <QuickKeyButton
            key={k.label}
            label={k.label}
            title={k.title}
            onClick={() => fire(k.bytes)}
          />
        ))}
      </div>
    </div>
  );
}

/** 单个快捷键按钮 */
function QuickKeyButton(props: {
  label: string;
  title?: string;
  wide?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  const { label, title, wide, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => {
        // 阻止默认行为避免 xterm 失焦
        e.preventDefault();
      }}
      title={title ?? label}
      style={{
        minWidth: wide ? 52 : 36,
        minHeight: 36,
        padding: '0 8px',
        borderRadius: 6,
        border: active
          ? '1px solid oklch(0.7 0.18 140)'
          : '1px solid var(--color-border)',
        background: active ? 'oklch(0.7 0.18 140 / 0.15)' : 'var(--color-surface-0)',
        color: active ? 'oklch(0.85 0.18 140)' : 'var(--color-text-primary)',
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1,
        cursor: 'pointer',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}
