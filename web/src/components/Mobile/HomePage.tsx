import { useUIStore } from '../../stores/uiStore';
import { useBackendStore } from '../../stores/backendStore';
import ProjectAccordion from '../Sessions/ProjectAccordion';
import MobilePageHeader from '../Layout/MobilePageHeader';
import BackendSwitcherChip from '../Backend/BackendSwitcherChip';

/**
 * 手机端 L1 会话首页（方案 §5.2）。
 *
 * - 复用 `ProjectAccordion` 的项目手风琴（双端同构 Δ 为零改动）
 * - 点击任何会话则 push 到聊天页
 * - 点击新建则调用 onNewSession（最终由 App.tsx 的 launchTrigger 机制弹出选目录器）
 * - 右上角显示"当前机器"芯片，支持一键切换（P5 多机器管理优化）
 */
interface Props {
  /** 新建会话回调（转发给 App 层 handleLaunch） */
  onNewSession: () => void;
}

export default function HomePage({ onNewSession }: Props) {
  const pushMobilePage = useUIStore((s) => s.pushMobilePage);
  const activeBackend = useBackendStore((s) => {
    const id = s.activeBackendId;
    return id ? s.backends.find((b) => b.id === id) || null : null;
  });

  const handleSessionSelect = (sessionId: string) => {
    pushMobilePage({ type: 'chat', sessionId });
  };

  // 从 apiUrl 中抽取 host 作为副标题（如 remote-server:8080）
  let subtitle: string | undefined;
  if (activeBackend?.apiUrl) {
    try {
      subtitle = new URL(activeBackend.apiUrl).host;
    } catch {
      subtitle = activeBackend.apiUrl;
    }
  }

  return (
    <>
      {/* L1 无返回按钮；右侧挂机器切换 chip */}
      <MobilePageHeader
        title="会话"
        subtitle={subtitle}
        rightSlot={<BackendSwitcherChip compact />}
      />

      {/* 项目手风琴（移动端外层已用 MobilePageHeader 渲染标题 + 机器 chip，这里隐藏内置标题行以避免重复） */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ProjectAccordion
          onNewSession={() => onNewSession()}
          onSessionSelect={handleSessionSelect}
          hideHeader
        />
      </div>
    </>
  );
}
