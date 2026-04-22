/**
 * 关于页（占位）。
 * 展示基础信息 + 仓库链接。P5 打磨阶段补齐版本号动态注入（BUILD_ID）。
 */
export default function AboutPage() {
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          BaoMiHua Agent Gateway
        </div>
        <div style={{ color: 'var(--color-text-muted)' }}>Mobile control hub for AI Coding Agents</div>
      </div>
      <div
        style={{
          marginTop: 4,
          padding: '8px 10px',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md, 8px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
        }}
      >
        <div>版本：v0.1.0</div>
        <div>
          仓库：
          <a
            href="https://github.com/DeaglePC/RemoteVibe"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent-500)', textDecoration: 'none' }}
          >
            DeaglePC/RemoteVibe
          </a>
        </div>
      </div>
    </div>
  );
}
