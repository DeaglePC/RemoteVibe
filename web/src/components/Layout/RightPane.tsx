import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useChatStore } from '../../stores/chatStore';
import FileTreeBrowser from '../FileBrowser/FileTreeBrowser';
import FileViewer from '../FileBrowser/FileViewer';

interface Props {
  /** 外部透传的 WebSocket send，传给 FileTreeBrowser 的文件操作 */
  onSendWS: (msg: { type: string; payload: unknown }) => void;
}

/**
 * 桌面端右侧 Pane（方案 §4.4 / Q3.6=A）。
 *
 * 承载：
 *  - 文件树（默认）
 *  - 文件预览（点击文件树中的文件后展开）
 *  - 工具调用详情（P3-step 4 / P5 再补）
 *
 * 开关由 `uiStore.rightPaneOpen` 控制；内容主题由 `rightPaneContent` 控制。
 * 和聊天区通过 Allotment 分割，本组件自身只关心内容渲染。
 */
export default function RightPane({ onSendWS }: Props) {
  const open = useUIStore((s) => s.rightPaneOpen);
  const content = useUIStore((s) => s.rightPaneContent);
  const setOpen = useUIStore((s) => s.setRightPaneOpen);

  const activeWorkDir = useChatStore((s) => s.activeWorkDir);
  const viewingFile = useChatStore((s) => s.viewingFile);

  const handleClose = useCallback(() => {
    setOpen(false);
    useChatStore.getState().setViewingFile(null);
  }, [setOpen]);

  const handleFileOpen = useCallback((filePath: string, fileName: string) => {
    useChatStore.getState().setViewingFile({ path: filePath, name: fileName });
  }, []);

  const handleCloseViewer = useCallback(() => {
    useChatStore.getState().setViewingFile(null);
  }, []);

  if (!open) return null;

  return (
    <aside
      aria-label="Right Pane"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-surface-0)',
        borderLeft: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}
    >
      {content === 'files' && (
        <>
          {viewingFile ? (
            <FileViewer
              filePath={viewingFile.path}
              fileName={viewingFile.name}
              onClose={handleCloseViewer}
            />
          ) : activeWorkDir ? (
            <FileTreeBrowser
              rootPath={activeWorkDir}
              onClose={handleClose}
              onFileOpen={handleFileOpen}
              onSendWS={onSendWS}
            />
          ) : (
            <div
              style={{
                padding: 24,
                fontSize: 12,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                lineHeight: 1.7,
              }}
            >
              当前没有活跃项目
              <br />
              选择左侧会话或启动 Agent 以查看项目文件。
            </div>
          )}
        </>
      )}
      {content === 'tool-detail' && (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-muted)' }}>
          工具调用详情（待 P5 实现）
        </div>
      )}
    </aside>
  );
}
