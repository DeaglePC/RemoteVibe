import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileEntry, FilesResult } from '../../types/protocol';
import { getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import { useChatStore } from '../../stores/chatStore';
import {
  Folder, File as FileIcon, FileCode, FileImage, FileText, Database,
  Terminal, Lock, EyeOff, LayoutTemplate,
  ChevronRight, ChevronDown, X, RefreshCw, Eye, EyeOff as EyeOffToggle,
} from 'lucide-react';
import { isTextFile } from './FileViewer';

interface Props {
  rootPath: string;
  onClose: () => void;
  onFileOpen?: (filePath: string, fileName: string) => void;
  /** 发送 WebSocket 消息（用于 watch_dir） */
  onSendWS?: (msg: { type: string; payload: unknown }) => void;
}

/** 树节点数据 */
interface TreeNode extends FileEntry {
  /** 完整路径 */
  fullPath: string;
  /** 是否已展开 */
  expanded?: boolean;
  /** 子节点（目录展开后填充） */
  children?: TreeNode[];
  /** 是否正在加载子节点 */
  loading?: boolean;
  /** 嵌套层级 */
  depth: number;
}

/** 获取文件图标 */
function getFileIcon(name: string, isDir: boolean, expanded?: boolean) {
  if (isDir) {
    return expanded
      ? <Folder size={16} className="text-blue-400" fill="currentColor" fillOpacity={0.3} />
      : <Folder size={16} className="text-blue-400" fill="currentColor" fillOpacity={0.15} />;
  }

  const ext = name.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'ts': case 'tsx':
      return <FileCode size={16} className="text-blue-400" />;
    case 'js': case 'jsx':
      return <FileCode size={16} className="text-yellow-400" />;
    case 'go': case 'py': case 'rs': case 'rb':
      return <Terminal size={16} className="text-emerald-400" />;
    case 'json': case 'yaml': case 'yml': case 'toml':
      return <Database size={16} className="text-green-400" />;
    case 'md': case 'txt':
      return <FileText size={16} className="text-slate-400" />;
    case 'html': case 'css':
      return <LayoutTemplate size={16} className="text-blue-400" />;
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif':
      return <FileImage size={16} className="text-yellow-400" />;
    case 'sh': case 'bash': case 'zsh':
      return <Terminal size={16} className="text-red-400" />;
    case 'lock':
      return <Lock size={16} className="text-zinc-400" />;
    case 'gitignore':
      return <EyeOff size={16} className="text-zinc-400" />;
    default:
      return <FileIcon size={16} className="text-zinc-400" />;
  }
}

export default function FileTreeBrowser({ rootPath, onClose, onFileOpen, onSendWS }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // 订阅文件系统事件
  const fsEventVersion = useChatStore((s) => s.fsEventVersion);
  const lastFSEvent = useChatStore((s) => s.lastFSEvent);

  // 记录已监听的目录（避免重复发送 watch_dir）
  const watchedDirs = useRef(new Set<string>());

  /** 获取目录内容 */
  const fetchDir = useCallback(async (path: string): Promise<FileEntry[]> => {
    const params = new URLSearchParams({ path });
    if (showHidden) params.set('showHidden', 'true');
    const resp = await fetch(`${getApiBaseUrl()}/api/files?${params}`, {
      headers: getAuthHeaders(),
    });
    const data: FilesResult = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.entries || [];
  }, [showHidden]);

  /** 将 FileEntry 转为 TreeNode */
  const entriesToNodes = useCallback((entries: FileEntry[], parentPath: string, depth: number): TreeNode[] => {
    const sorted = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map((entry) => ({
      ...entry,
      fullPath: parentPath.endsWith('/')
        ? `${parentPath}${entry.name}`
        : `${parentPath}/${entry.name}`,
      expanded: false,
      children: entry.isDir ? undefined : undefined,
      loading: false,
      depth,
    }));
  }, []);

  /** 加载根目录 */
  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await fetchDir(rootPath);
      setTree(entriesToNodes(entries, rootPath, 0));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath, fetchDir, entriesToNodes]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  // 监听文件系统事件，自动刷新受影响的目录
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const fetchDirRef = useRef(fetchDir);
  fetchDirRef.current = fetchDir;
  const entriesToNodesRef = useRef(entriesToNodes);
  entriesToNodesRef.current = entriesToNodes;

  useEffect(() => {
    if (!lastFSEvent || fsEventVersion === 0) return;

    const { dir } = lastFSEvent;

    // 检查受影响的目录是否在当前树中展开
    const refreshDir = async (dirPath: string) => {
      // 如果是根目录本身
      if (dirPath === rootPath) {
        try {
          const entries = await fetchDirRef.current(rootPath);
          setTree(entriesToNodesRef.current(entries, rootPath, 0));
        } catch {
          // 刷新失败时静默忽略
        }
        return;
      }

      // 查找树中对应的展开目录节点并刷新其子节点
      const node = findNode(treeRef.current, dirPath);
      if (node && node.expanded) {
        try {
          const entries = await fetchDirRef.current(dirPath);
          const children = entriesToNodesRef.current(entries, dirPath, node.depth + 1);
          // 保留子节点中已展开的状态
          const mergedChildren = mergeChildrenState(node.children || [], children);
          setTree((prev) => updateNodeInTree(prev, dirPath, { children: mergedChildren }));
        } catch {
          // 刷新失败时静默忽略
        }
      }
    };

    refreshDir(dir);
  }, [fsEventVersion, lastFSEvent, rootPath]);

  /** 切换目录展开/折叠 */
  const toggleExpand = useCallback(async (targetPath: string) => {
    // 递归查找并更新节点
    const updateNodes = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.fullPath === targetPath) {
          if (node.expanded) {
            // 折叠
            result.push({ ...node, expanded: false });
          } else {
            // 展开 - 如果还没有子节点，先加载
            if (!node.children) {
              result.push({ ...node, loading: true, expanded: true });
              // 异步加载
              try {
                const entries = await fetchDir(node.fullPath);
                const children = entriesToNodes(entries, node.fullPath, node.depth + 1);
                // 再次更新
                setTree((prev) => updateNodeInTree(prev, targetPath, { children, loading: false }));
              } catch {
                setTree((prev) => updateNodeInTree(prev, targetPath, { children: [], loading: false }));
              }
            } else {
              result.push({ ...node, expanded: true });
            }
          }
        } else if (node.children && node.expanded) {
          result.push({ ...node, children: await updateNodes(node.children) });
        } else {
          result.push(node);
        }
      }
      return result;
    };

    setTree((prev) => {
      // 同步更新展开状态
      const updated = syncToggle(prev, targetPath);
      return updated;
    });

    // 如果需要加载子节点
    const node = findNode(tree, targetPath);
    if (node && !node.expanded && !node.children) {
      try {
        const entries = await fetchDir(node.fullPath);
        const children = entriesToNodes(entries, node.fullPath, node.depth + 1);
        setTree((prev) => updateNodeInTree(prev, targetPath, { children, loading: false, expanded: true }));
        // 告诉服务端监听这个子目录
        if (onSendWS && !watchedDirs.current.has(node.fullPath)) {
          watchedDirs.current.add(node.fullPath);
          onSendWS({ type: 'watch_dir', payload: { path: node.fullPath, action: 'watch' } });
        }
      } catch {
        setTree((prev) => updateNodeInTree(prev, targetPath, { children: [], loading: false, expanded: true }));
      }
    } else if (node && node.expanded) {
      // 折叠时不需要取消监听（保持监听以便再次展开时能感知变化）
    }
  }, [tree, fetchDir, entriesToNodes, onSendWS]);

  /** 处理节点点击 */
  const handleNodeClick = useCallback((node: TreeNode) => {
    if (node.isDir) {
      toggleExpand(node.fullPath);
    } else if (onFileOpen && isTextFile(node.name)) {
      onFileOpen(node.fullPath, node.name);
    }
  }, [toggleExpand, onFileOpen]);

  /** 获取根目录名 */
  const rootName = rootPath.split('/').filter(Boolean).pop() || rootPath;

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-0)] select-none">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest flex-1 truncate"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Explorer
        </span>
        <button
          onClick={() => setShowHidden(!showHidden)}
          className="p-1 rounded-md transition-all cursor-pointer"
          style={{
            color: showHidden ? 'var(--color-accent-400)' : 'var(--color-text-muted)',
            background: 'transparent',
            border: 'none',
          }}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {showHidden ? <Eye size={14} /> : <EyeOffToggle size={14} />}
        </button>
        <button
          onClick={loadRoot}
          className="p-1 rounded-md transition-all cursor-pointer"
          style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          title="Refresh"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-2)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-md transition-all cursor-pointer"
          style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          title="Close"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-2)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 根目录标题 */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide flex-shrink-0 cursor-default"
        style={{
          color: 'var(--color-text-secondary)',
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <Folder size={14} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
        <span className="truncate">{rootName}</span>
      </div>

      {/* 树视图 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loading && (
          <div className="flex flex-col gap-0.5 px-2 py-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded">
                <div className="w-4 h-4 rounded bg-[var(--color-surface-3)] animate-pulse" />
                <div className="h-3 rounded flex-1 bg-[var(--color-surface-3)] animate-pulse" style={{ maxWidth: `${80 + Math.random() * 60}px` }} />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="m-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        {!loading && !error && tree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
            <Folder size={24} className="opacity-40 mb-2" />
            <span className="text-xs">Empty directory</span>
          </div>
        )}

        {!loading && !error && tree.length > 0 && (
          <TreeNodeList nodes={tree} onNodeClick={handleNodeClick} />
        )}
      </div>
    </div>
  );
}

/** 递归渲染树节点列表 */
function TreeNodeList({
  nodes,
  onNodeClick,
}: {
  nodes: TreeNode[];
  onNodeClick: (node: TreeNode) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <TreeNodeItem key={node.fullPath} node={node} onNodeClick={onNodeClick} />
      ))}
    </>
  );
}

/** 单个树节点项 */
function TreeNodeItem({
  node,
  onNodeClick,
}: {
  node: TreeNode;
  onNodeClick: (node: TreeNode) => void;
}) {
  const canOpen = !node.isDir && isTextFile(node.name);
  const indent = node.depth * 16 + 8; // px

  return (
    <>
      <button
        onClick={() => onNodeClick(node)}
        className="w-full flex items-center gap-1 py-[3px] pr-2 text-left transition-colors duration-100 cursor-pointer group"
        style={{
          paddingLeft: `${indent}px`,
          background: 'transparent',
          border: 'none',
          opacity: !node.isDir && !canOpen ? 0.4 : 1,
          cursor: !node.isDir && !canOpen ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* 展开/折叠箭头（仅目录显示） */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {node.isDir && (
            node.loading
              ? <Loader2Icon />
              : node.expanded
                ? <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />
                : <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
          )}
        </span>

        {/* 文件图标 */}
        <span className="flex-shrink-0 flex items-center justify-center">
          {getFileIcon(node.name, node.isDir, node.expanded)}
        </span>

        {/* 文件名 */}
        <span
          className="text-[13px] truncate ml-0.5 font-mono"
          style={{
            color: node.isDir
              ? 'var(--color-text-primary)'
              : canOpen
                ? 'var(--color-text-secondary)'
                : 'var(--color-text-muted)',
          }}
        >
          {node.name}
        </span>
      </button>

      {/* 递归渲染子节点 */}
      {node.isDir && node.expanded && node.children && (
        <TreeNodeList nodes={node.children} onNodeClick={onNodeClick} />
      )}
    </>
  );
}

/** 简易旋转加载图标 */
function Loader2Icon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-muted)"
      strokeWidth="2"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ==================== 树操作辅助函数 ====================

/** 在树中查找指定路径的节点 */
function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.fullPath === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** 同步切换展开状态 */
function syncToggle(nodes: TreeNode[], path: string): TreeNode[] {
  return nodes.map((node) => {
    if (node.fullPath === path) {
      return { ...node, expanded: !node.expanded, loading: !node.expanded && !node.children };
    }
    if (node.children && node.expanded) {
      return { ...node, children: syncToggle(node.children, path) };
    }
    return node;
  });
}

/** 更新指定路径节点的属性 */
function updateNodeInTree(
  nodes: TreeNode[],
  path: string,
  updates: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.fullPath === path) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, path, updates) };
    }
    return node;
  });
}

/** 合并新旧子节点列表，保留已展开节点的 expanded/children 状态 */
function mergeChildrenState(oldChildren: TreeNode[], newChildren: TreeNode[]): TreeNode[] {
  const oldMap = new Map<string, TreeNode>();
  for (const child of oldChildren) {
    oldMap.set(child.fullPath, child);
  }
  return newChildren.map((newChild) => {
    const oldChild = oldMap.get(newChild.fullPath);
    if (oldChild && oldChild.isDir && oldChild.expanded && oldChild.children) {
      // 保留旧的展开状态和子节点
      return { ...newChild, expanded: true, children: oldChild.children };
    }
    return newChild;
  });
}
