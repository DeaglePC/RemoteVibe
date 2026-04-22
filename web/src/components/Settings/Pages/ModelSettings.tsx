/**
 * 模型设置（占位）。
 *
 * 现阶段模型选择在 Launch 弹窗里完成（TopBar 内部），这里暂做只读展示。
 * 完整的模型管理在 P5 打磨阶段补齐。
 */
import { useChatStore } from '../../../stores/chatStore';

export default function ModelSettings() {
  const activeModel = useChatStore((s) => s.activeModel);
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md, 8px)',
          fontSize: 13,
        }}
      >
        <span style={{ color: 'var(--color-text-secondary)' }}>当前模型</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
          {activeModel || '未选择'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, padding: '0 2px' }}>
        通过左上角 <b>＋ 新建会话</b> 启动 Agent 时可指定模型。
      </div>
    </div>
  );
}
