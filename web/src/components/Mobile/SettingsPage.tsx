import MobilePageHeader from '../Layout/MobilePageHeader';
import SettingsRoot from '../Settings/SettingsRoot';

/**
 * 手机端 L1 设置首页（方案 §5.4）。
 *
 * - 复用 `SettingsRoot`，双端同构。
 * - SettingsRoot 自带内部子页切换逻辑；此处只加一层顶部 header 显示"设置"标题。
 */
export default function SettingsPage() {
  return (
    <>
      <MobilePageHeader title="设置" />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SettingsRoot />
      </div>
    </>
  );
}
