import { useState, useEffect, useCallback } from 'react';
import type { FileEntry, FilesResult } from '../../types/protocol';
import { getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';

type SortKey = 'name' | 'size' | 'modTime';
type SortDir = 'asc' | 'desc';

interface Props {
  rootPath: string;
  onClose: () => void;
}

/**
 * FileBrowser 是连接后的文件浏览面板。
 * 展示 Agent 工作目录的文件和子目录，支持排序和浏览。
 */
export default function FileBrowser({ rootPath, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showHidden, setShowHidden] = useState(false);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ path });
      if (showHidden) params.set('showHidden', 'true');
      const resp = await fetch(`${getApiBaseUrl()}/api/files?${params}`, {
        headers: getAuthHeaders(),
      });
      const data: FilesResult = await resp.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.isDir) {
        setCurrentPath(data.path);
        setEntries(data.entries || []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPath(rootPath);
    fetchFiles(rootPath);
  }, [rootPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEntries = [...entries].sort((a, b) => {
    // 目录始终排在文件前面
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;

    let cmp = 0;
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === 'size') {
      cmp = a.size - b.size;
    } else if (sortKey === 'modTime') {
      cmp = a.modTime - b.modTime;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleNavigate = (entry: FileEntry) => {
    if (!entry.isDir) return;
    const newPath = currentPath.endsWith('/')
      ? `${currentPath}${entry.name}`
      : `${currentPath}/${entry.name}`;
    fetchFiles(newPath);
  };

  const handleGoUp = () => {
    const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    fetchFiles(parentPath);
  };

  const handleGoRoot = () => {
    fetchFiles(rootPath);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDate = (ms: number): string => {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileIcon = (name: string, isDir: boolean): string => {
    if (isDir) return '📂';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, string> = {
      ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
      go: '🐹', py: '🐍', rs: '🦀', rb: '💎',
      json: '📋', yaml: '📋', yml: '📋', toml: '📋',
      md: '📝', txt: '📄', html: '🌐', css: '🎨',
      png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
      sh: '⚡', bash: '⚡', zsh: '⚡',
      lock: '🔒', gitignore: '🙈',
    };
    return iconMap[ext] || '📄';
  };

  // 计算相对路径
  const relativePath = currentPath.startsWith(rootPath)
    ? currentPath.slice(rootPath.length) || '/'
    : currentPath;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--color-surface-1)',
        borderLeft: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 sm:py-2 flex-shrink-0 safe-top"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-sm">📂</span>
        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>
          Files
        </span>
        <button
          onClick={handleGoRoot}
          className="p-1.5 sm:p-1 rounded transition-opacity hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          title="Go to root"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-1.5 sm:p-1 rounded transition-opacity hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          title="Close file browser"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleGoUp}
          className="p-0.5 rounded hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
          style={{ color: 'var(--color-text-secondary)', background: 'transparent', border: 'none' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          {relativePath}
        </span>
      </div>

      {/* Sort toolbar */}
      <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(['name', 'size', 'modTime'] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className="text-xs px-1.5 py-0.5 rounded transition-all cursor-pointer"
            style={{
              background: sortKey === key ? 'var(--color-surface-3)' : 'transparent',
              color: sortKey === key ? 'var(--color-accent-400)' : 'var(--color-text-muted)',
              border: 'none',
            }}
          >
            {key === 'name' ? 'Name' : key === 'size' ? 'Size' : 'Date'}
            {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowHidden(!showHidden)}
          className="text-xs px-1.5 py-0.5 rounded transition-all cursor-pointer"
          style={{
            background: showHidden ? 'var(--color-surface-3)' : 'transparent',
            color: showHidden ? 'var(--color-accent-400)' : 'var(--color-text-muted)',
            border: 'none',
          }}
        >
          .*
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs py-4 px-3 text-center" style={{ color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
            Empty directory
          </div>
        )}

        {!loading && !error && sortedEntries.map((entry) => (
          <button
            key={entry.name}
            onClick={() => handleNavigate(entry)}
            className="w-full flex items-center gap-2 px-3 py-2.5 sm:py-1.5 text-left transition-all duration-100 group"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-primary)',
              cursor: entry.isDir ? 'pointer' : 'default',
              opacity: entry.isDir ? 1 : 0.7,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className="text-xs flex-shrink-0">{getFileIcon(entry.name, entry.isDir)}</span>
            <span className="text-xs truncate flex-1" style={{ fontFamily: 'var(--font-mono)' }}>
              {entry.name}
            </span>
            <span className="text-xs flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
              {entry.isDir ? '' : formatSize(entry.size)}
            </span>
            <span className="text-xs flex-shrink-0 hidden sm:hidden sm:group-hover:inline"
              style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>
              {formatDate(entry.modTime)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
