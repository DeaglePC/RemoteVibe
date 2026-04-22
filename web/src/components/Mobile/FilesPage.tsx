import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import FileTreeBrowser from '../FileBrowser/FileTreeBrowser';
import FileViewer from '../FileBrowser/FileViewer';

/**
 * 手机端 L3 文件树 / 文件查看器页面（方案 §5.3 / §5.1）。
 *
 * - FilesTreePage：文件树，点击文件则 push 到文件查看器
 * - FileViewerPage：文件查看器，点击左上角关闭 pop 回文件树
 *
 * 这两个页面复用现有 `FileTreeBrowser` / `FileViewer`，
 * 它们自带内部 header，所以本文件不再结合 MobilePageHeader。
 * FileTreeBrowser 的 onClose 和 FileViewer 的 onClose 都转发到 popMobilePage。
 */
interface FilesTreePageProps {
  rootPath: string;
  onSendWS: (msg: { type: string; payload: unknown }) => void;
}

export function FilesTreePage({ rootPath, onSendWS }: FilesTreePageProps) {
  const popMobilePage = useUIStore((s) => s.popMobilePage);
  const pushMobilePage = useUIStore((s) => s.pushMobilePage);

  const handleClose = useCallback(() => {
    popMobilePage();
  }, [popMobilePage]);

  const handleFileOpen = useCallback(
    (filePath: string, fileName: string) => {
      pushMobilePage({ type: 'file-viewer', path: filePath, name: fileName });
    },
    [pushMobilePage],
  );

  return (
    <FileTreeBrowser
      rootPath={rootPath}
      onClose={handleClose}
      onFileOpen={handleFileOpen}
      onSendWS={onSendWS}
    />
  );
}

interface FileViewerPageProps {
  path: string;
  name: string;
}

export function FileViewerPage({ path, name }: FileViewerPageProps) {
  const popMobilePage = useUIStore((s) => s.popMobilePage);

  const handleClose = useCallback(() => {
    popMobilePage();
  }, [popMobilePage]);

  return <FileViewer filePath={path} fileName={name} onClose={handleClose} isMobile />;
}
