import { useUIStore } from '../../../stores/uiStore';

/**
 * 行为设置。
 *
 * 当前只放一个开关：
 *  - 打开会话时自动恢复 Agent（autoReconnectOnOpen）
 */
export default function BehaviorSettings() {
  const autoReconnectOnOpen = useUIStore((s) => s.autoReconnectOnOpen);
  const setAutoReconnectOnOpen = useUIStore((s) => s.setAutoReconnectOnOpen);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ToggleRow
        title="打开会话时自动恢复 Agent"
        description="进入聊天页时，若有可恢复的会话，会自动拉起 Agent 进程；关闭后需手动点击左上角状态灯恢复。"
        value={autoReconnectOnOpen}
        onChange={setAutoReconnectOnOpen}
      />
    </div>
  );
}

interface ToggleRowProps {
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ title, description, value, onChange }: ToggleRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md, 8px)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {title}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          appearance: 'none',
          position: 'relative',
          width: 40,
          height: 22,
          padding: 0,
          borderRadius: 999,
          border: 0,
          background: value ? 'var(--color-success)' : 'var(--color-surface-3)',
          cursor: 'pointer',
          transition: 'background 120ms ease',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--color-surface-0)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: 'left 140ms ease',
          }}
        />
      </button>
    </div>
  );
}
