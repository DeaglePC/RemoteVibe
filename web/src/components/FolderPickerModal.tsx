import { useState, useEffect, useCallback } from 'react';
import type { FileEntry, BrowseResult } from '../types/protocol';
import { getApiBaseUrl, getAuthHeaders } from '../stores/backendStore';

type SortKey = 'name' | 'modTime';
type SortDir = 'asc' | 'desc';

interface Props {
  open: boolean;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

/**
 * FolderPickerModal 是一个类似 VSCode Remote 开发的目录选择器弹窗。
 * 支持：目录浏览、排序（名称/修改时间）、创建新目录、路径输入跳转。
 */
export default function FolderPickerModal({ open, onSelect, onCancel }: Props) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState('');

  // 排序状态
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // 新建文件夹状态
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const resp = await fetch(`${getApiBaseUrl()}/api/browse${params}`, {
        headers: getAuthHeaders(),
      });
      const data: BrowseResult = await resp.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setCurrentPath(data.path);
      setInputPath(data.path);
      setEntries(data.entries || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次打开时加载 home 目录
  useEffect(() => {
    if (open) {
      browse();
      setShowNewFolder(false);
      setNewFolderName('');
    }
  }, [open, browse]);

  // 排序后的 entries
  const sortedEntries = [...entries].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === 'modTime') {
      cmp = a.modTime - b.modTime;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleNavigate = (dirName: string) => {
    const newPath = currentPath.endsWith('/')
      ? `${currentPath}${dirName}`
      : `${currentPath}/${dirName}`;
    browse(newPath);
  };

  const handleGoUp = () => {
    const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    browse(parentPath);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      browse(inputPath.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      const fullPath = currentPath.endsWith('/')
        ? `${currentPath}${trimmed}`
        : `${currentPath}/${trimmed}`;

      const resp = await fetch(`${getApiBaseUrl()}/api/mkdir`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowNewFolder(false);
        setNewFolderName('');
        // 刷新当前目录
        await browse(currentPath);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl overflow-hidden animate-fade-in-up"
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 25px 50px oklch(0 0 0 / 0.5)',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.20 270 / 0.15), oklch(0.72 0.18 195 / 0.1))',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className="text-xl">📁</span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Select Working Directory
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Choose a folder for the agent to work in
            </p>
          </div>
        </div>

        {/* Path input bar */}
        <form onSubmit={handlePathSubmit} className="px-4 pt-3 pb-2">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: 'var(--color-surface-0)',
              border: '1px solid var(--color-border)',
            }}
          >
            <button
              type="button"
              onClick={handleGoUp}
              className="p-1 rounded hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
              style={{ color: 'var(--color-text-secondary)', background: 'transparent', border: 'none' }}
              title="Go to parent directory"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              className="flex-1 text-xs outline-none"
              style={{
                background: 'transparent',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                border: 'none',
              }}
              placeholder="/path/to/directory"
            />
            <button
              type="submit"
              className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80 cursor-pointer"
              style={{
                background: 'var(--color-surface-3)',
                color: 'var(--color-text-secondary)',
                border: 'none',
              }}
            >
              Go
            </button>
          </div>
        </form>

        {/* Toolbar: Sort + New Folder */}
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleSort('name')}
              className="text-xs px-2 py-1 rounded transition-all cursor-pointer"
              style={{
                background: sortKey === 'name' ? 'var(--color-surface-3)' : 'transparent',
                color: sortKey === 'name' ? 'var(--color-accent-400)' : 'var(--color-text-muted)',
                border: 'none',
              }}
            >
              Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => toggleSort('modTime')}
              className="text-xs px-2 py-1 rounded transition-all cursor-pointer"
              style={{
                background: sortKey === 'modTime' ? 'var(--color-surface-3)' : 'transparent',
                color: sortKey === 'modTime' ? 'var(--color-accent-400)' : 'var(--color-text-muted)',
                border: 'none',
              }}
            >
              Modified {sortKey === 'modTime' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
          <button
            onClick={() => { setShowNewFolder(!showNewFolder); setNewFolderName(''); }}
            className="text-xs px-2 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
            style={{
              background: showNewFolder ? 'var(--color-surface-3)' : 'transparent',
              color: 'var(--color-accent-400)',
              border: 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Folder
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="px-4 pb-2">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                background: 'var(--color-surface-0)',
                border: '1px solid var(--color-accent-500)',
              }}
            >
              <span className="text-sm">📂</span>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateFolder();
                  }
                  if (e.key === 'Escape') {
                    setShowNewFolder(false);
                  }
                }}
                className="flex-1 text-xs outline-none"
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  border: 'none',
                }}
                placeholder="New folder name..."
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creating}
                className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-30"
                style={{
                  background: 'var(--color-accent-500)',
                  color: 'white',
                  border: 'none',
                }}
              >
                {creating ? '...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Directory listing */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2"
          style={{ minHeight: '200px', maxHeight: '40vh' }}
        >
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs py-4 text-center" style={{ color: 'var(--color-danger)' }}>
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-xs py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
              No subdirectories found
            </div>
          )}

          {!loading && !error && sortedEntries.map((entry) => (
            <button
              key={entry.name}
              onClick={() => handleNavigate(entry.name)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 hover:scale-[1.01] cursor-pointer group"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="text-base flex-shrink-0">📂</span>
              <span className="text-sm truncate flex-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {entry.name}
              </span>
              <span className="text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}>
                {formatDate(entry.modTime)}
              </span>
            </button>
          ))}
        </div>

        {/* Footer with actions */}
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 safe-bottom"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <div className="text-xs truncate mr-4" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            {currentPath}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onCancel}
              className="text-sm px-4 py-2 rounded-lg transition-all duration-200 hover:opacity-80 cursor-pointer"
              style={{
                background: 'var(--color-surface-3)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(currentPath)}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                color: 'white',
                border: 'none',
              }}
            >
              Open Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
