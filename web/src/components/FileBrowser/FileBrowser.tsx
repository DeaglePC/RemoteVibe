import { useState, useEffect, useCallback } from 'react';
import type { FileEntry, FilesResult } from '../../types/protocol';
import { getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import { 
  Folder, File as FileIcon, FileCode, FileImage, FileText, Database,
  Terminal, Lock, EyeOff, LayoutTemplate, 
  X, Home, ArrowUp, ArrowDown, Eye, EyeOff as EyeOffToggle
} from 'lucide-react';

import { isTextFile } from './FileViewer';

type SortKey = 'name' | 'size' | 'modTime';
type SortDir = 'asc' | 'desc';

interface Props {
  rootPath: string;
  onClose: () => void;
  /** 点击可预览的文件时触发 */
  onFileOpen?: (filePath: string, fileName: string, fileSize?: number) => void;
}

export default function FileBrowser({ rootPath, onClose, onFileOpen }: Props) {
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
    // Directories always come first
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
    if (entry.isDir) {
      const newPath = currentPath.endsWith('/')
        ? `${currentPath}${entry.name}`
        : `${currentPath}/${entry.name}`;
      fetchFiles(newPath);
      return;
    }
    // 点击文件触发预览（二进制 / 大文件由 FileViewer 统一展示提示）
    if (onFileOpen) {
      const filePath = currentPath.endsWith('/')
        ? `${currentPath}${entry.name}`
        : `${currentPath}/${entry.name}`;
      onFileOpen(filePath, entry.name, entry.size);
    }
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
    if (bytes === 0) return '--';
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

  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return <Folder size={18} className="text-blue-400 group-hover:text-blue-300 transition-colors" fill="currentColor" fillOpacity={0.2} />;
    
    const ext = name.split('.').pop()?.toLowerCase() || '';
    
    const colors = {
      blue: "text-blue-400",
      yellow: "text-yellow-400",
      green: "text-green-400",
      emerald: "text-emerald-400",
      red: "text-red-400",
      slate: "text-slate-400",
      zinc: "text-zinc-400",
    };

    switch (ext) {
      case 'ts':
      case 'tsx':
        return <FileCode size={18} className={colors.blue} />;
      case 'js':
      case 'jsx':
        return <FileCode size={18} className={colors.yellow} />;
      case 'go':
      case 'py':
      case 'rs':
      case 'rb':
        return <Terminal size={18} className={colors.emerald} />;
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
        return <Database size={18} className={colors.green} />;
      case 'md':
      case 'txt':
        return <FileText size={18} className={colors.slate} />;
      case 'html':
      case 'css':
        return <LayoutTemplate size={18} className={colors.blue} />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
      case 'gif':
        return <FileImage size={18} className={colors.yellow} />;
      case 'sh':
      case 'bash':
      case 'zsh':
        return <Terminal size={18} className={colors.red} />;
      case 'lock':
        return <Lock size={18} className={colors.zinc} />;
      case 'gitignore':
        return <EyeOff size={18} className={colors.zinc} />;
      default:
        return <FileIcon size={18} className={colors.zinc} />;
    }
  };

  const SortButton = ({ sortKey: key, label }: { sortKey: SortKey, label: string }) => {
    const active = sortKey === key;
    return (
      <button
        onClick={() => toggleSort(key)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer ${
          active 
            ? 'bg-[var(--color-surface-3)] text-[var(--color-accent-400)]' 
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <span>{label}</span>
        {active && (
          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        )}
      </button>
    );
  };

  const relativePath = currentPath.startsWith(rootPath)
    ? currentPath.slice(rootPath.length) || '/'
    : currentPath;

  const pathParts = relativePath.split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-0)] select-none">
      {/* Header Area */}
      <div className="flex flex-col flex-shrink-0 pt-safe bg-[var(--color-surface-1)] border-b border-[var(--color-border)]">
        
        {/* Top Navbar */}
        <div className="flex items-center gap-2 px-4 py-3 sm:py-2.5">
          <Folder size={18} className="text-blue-400" fill="currentColor" fillOpacity={0.2} />
          <span className="text-sm font-semibold flex-1 truncate tracking-wide text-[var(--color-text-primary)]">
            File Browser
          </span>
          <button
            onClick={handleGoRoot}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
            title="Go to root"
          >
            <Home size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
            title="Close file browser"
          >
            <X size={16} />
          </button>
        </div>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 px-4 pb-3 sm:pb-2.5">
          <button
            onClick={handleGoUp}
            className="p-1 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer flex-shrink-0"
            title="Go up one folder"
          >
            <ArrowUp size={16} className="-rotate-45" />
          </button>
          <div className="flex bg-[var(--color-surface-2)] rounded-md px-3 py-1.5 flex-1 overflow-x-auto no-scrollbar items-center border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)] font-mono whitespace-nowrap">
              root
            </span>
            {pathParts.map((part, i) => (
              <div key={i} className="flex items-center whitespace-nowrap">
                <span className="text-[var(--color-text-muted)] mx-1 text-xs">/</span>
                <span className="text-xs text-[var(--color-text-primary)] font-mono">{part}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 flex-shrink-0 bg-[var(--color-surface-1)] border-b border-[var(--color-border-strong)]">
        <SortButton sortKey="name" label="Name" />
        <SortButton sortKey="size" label="Size" />
        <SortButton sortKey="modTime" label="Date" />
        <div className="flex-1" />
        <button
          onClick={() => setShowHidden(!showHidden)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer ${
            showHidden 
              ? 'bg-[var(--color-surface-3)] text-blue-400' 
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'
          }`}
          title="Toggle hidden files"
        >
          {showHidden ? <Eye size={14} /> : <EyeOffToggle size={14} />}
          <span className="hidden sm:inline">Hidden</span>
        </button>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 no-scrollbar bg-[var(--color-surface-0)] relative">
        {loading && (
          <div className="flex flex-col gap-1.5 animate-pulse-glow">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                <div className="w-5 h-5 rounded bg-[var(--color-surface-3)]" />
                <div className="h-4 rounded flex-1 bg-[var(--color-surface-3)] max-w-[150px]" />
                <div className="h-3 w-12 rounded hidden sm:block bg-[var(--color-surface-3)] ml-auto" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="m-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center flex flex-col items-center gap-2">
            <X size={24} className="text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3">
            <div className="p-4 rounded-full bg-[var(--color-surface-2)]">
              <Folder size={32} className="opacity-50" />
            </div>
            <span className="text-sm">Empty directory</span>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-0.5">
            {sortedEntries.map((entry) => {
              const canOpen = !entry.isDir && isTextFile(entry.name);
              return (
                <button
                  key={entry.name}
                  onClick={() => handleNavigate(entry)}
                  className={`group w-full flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg text-left transition-all duration-150 border border-transparent cursor-pointer ${
                    entry.isDir || canOpen
                      ? 'hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border)]'
                      : 'opacity-60 cursor-default'
                  }`}
                >
                  {/* Icon Area */}
                  <div className="flex-shrink-0 flex items-center justify-center">
                    {getFileIcon(entry.name, entry.isDir)}
                  </div>

                  {/* Filename */}
                  <span 
                    className="text-sm truncate flex-1 font-mono tracking-tight" 
                    style={{ 
                      color: entry.isDir ? 'var(--color-text-primary)' : canOpen ? 'var(--color-text-secondary)' : 'var(--color-text-muted)'
                    }}
                  >
                    {entry.name}
                  </span>

                  {/* Metadata Area (hidden on very small screens) */}
                  <div className="hidden sm:flex items-center gap-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    {!entry.isDir && (
                      <span className="text-xs text-[var(--color-text-muted)] font-mono w-16 text-right">
                        {formatSize(entry.size)}
                      </span>
                    )}
                    {entry.isDir && <span className="w-16" />} {/* Placeholder to align dates */}
                    
                    <span className="text-xs text-[var(--color-text-muted)] w-24 text-right">
                      {formatDate(entry.modTime)}
                    </span>
                  </div>
                  
                  {/* Chevron indicator for mobile: folders & text files */}
                  {(entry.isDir || canOpen) && (
                    <div className="sm:hidden text-[var(--color-text-muted)] opacity-50">
                      <ArrowDown size={14} className="-rotate-90" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
