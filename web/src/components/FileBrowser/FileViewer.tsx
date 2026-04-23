import { useState, useEffect, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import {
  X, FileCode, FileText, FileImage, Database, Terminal,
  Lock, LayoutTemplate, Copy, Check, ArrowLeft, FileWarning, Ban,
} from 'lucide-react';

/** 文件预览大小上限：与后端保持一致（server/internal/gateway/server.go:handleFileContent） */
const MAX_PREVIEW_SIZE = 2 * 1024 * 1024; // 2 MB

interface Props {
  filePath: string;
  fileName: string;
  onClose: () => void;
  /** 在手机模式下是否全屏 */
  isMobile?: boolean;
  /** 文件字节大小（若已知，可用于提前判断是否过大） */
  fileSize?: number;
}

/** 文本文件最大支持的文件扩展名 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv',
  'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf', 'env',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'go', 'py', 'rs', 'rb', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'html', 'css', 'scss', 'less', 'sass',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1', 'cmd',
  'sql', 'graphql', 'gql',
  'dockerfile', 'makefile', 'cmake',
  'gitignore', 'gitattributes', 'editorconfig', 'eslintrc',
  'mod', 'sum', 'lock',
  'svg', 'proto', 'diff', 'patch',
]);

/** 检查文件是否可预览为文本 */
export function isTextFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const nameLC = fileName.toLowerCase();
  // 无扩展名但可能是文本文件
  if (['makefile', 'dockerfile', 'readme', 'license', 'changelog', 'authors', 'contributing'].includes(nameLC)) {
    return true;
  }
  return TEXT_EXTENSIONS.has(ext);
}

/** 人类可读的文件大小 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 获取语言标识用于语法高亮 */
function getLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    go: 'go', py: 'python', rs: 'rust', rb: 'ruby',
    java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    md: 'markdown', markdown: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', graphql: 'graphql',
    dockerfile: 'dockerfile',
    svg: 'xml', proto: 'protobuf',
  };
  return langMap[ext] || 'text';
}

/** 获取文件图标 */
function getFileIcon(name: string) {
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
    case 'lock':
      return <Lock size={16} className="text-zinc-400" />;
    default:
      return <FileText size={16} className="text-zinc-400" />;
  }
}

export default function FileViewer({ filePath, fileName, onClose, isMobile, fileSize }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const language = getLanguage(fileName);

  // 预览前的静态拦截：二进制文件 / 过大文件
  const isBinary = !isTextFile(fileName);
  const tooLarge = typeof fileSize === 'number' && fileSize > MAX_PREVIEW_SIZE;
  const blockKind: 'binary' | 'too-large' | null = isBinary
    ? 'binary'
    : tooLarge
      ? 'too-large'
      : null;

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ path: filePath });
      const resp = await fetch(`${getApiBaseUrl()}/api/file-content?${params}`, {
        headers: getAuthHeaders(),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setContent(data.content);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    // 被静态拦截时直接跳过请求
    if (blockKind !== null) {
      setLoading(false);
      setError(null);
      setContent(null);
      return;
    }
    fetchContent();
  }, [fetchContent, blockKind]);

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = content?.split('\n') || [];
  const lineCount = lines.length;
  const fileDirectory = filePath.replace(/\/[^/]+$/, '') || '/';

  return (
    <div className={`flex flex-col h-full ${isMobile ? '' : ''}`}
      style={{ background: 'var(--color-surface-0)' }}
    >
      {/* Header */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2 px-3 py-3 sm:py-2.5">
          {isMobile && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span className="text-xs font-medium">Files</span>
            </button>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getFileIcon(fileName)}
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate text-[var(--color-text-primary)]">
                {fileName}
              </span>
              {isMobile && (
                <span
                  className="mt-0.5 block text-[11px] truncate"
                  style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  {fileDirectory}
                </span>
              )}
            </div>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--color-surface-3)',
                color: 'var(--color-text-muted)',
                fontSize: '0.6rem',
              }}
            >
              {language}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {content !== null && (
              <>
                <span className="text-xs text-[var(--color-text-muted)] hidden sm:block">
                  {lineCount} lines
                </span>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-accent-400)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
                  title="Copy file content"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </>
            )}
            {!isMobile && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
                title="Close file viewer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {isMobile && content !== null && (
          <div className="px-3 pb-3 sm:hidden">
            <div
              className="rounded-xl px-3 py-2.5"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between gap-3 text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}>
                <span>{lineCount} lines</span>
                <span>Swipe sideways for long lines</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-auto ${isMobile ? 'mobile-scroll safe-bottom' : ''}`}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* 二进制文件：禁止预览（仿 VSCode） */}
        {!loading && blockKind === 'binary' && (
          <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center gap-3">
            <div
              className="p-4 rounded-full"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <Ban size={28} className="text-[var(--color-text-muted)]" />
            </div>
            <div className="text-sm font-medium text-[var(--color-text-primary)]">
              该文件是二进制文件，无法预览
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {fileName}
              {typeof fileSize === 'number' && ` · ${formatBytes(fileSize)}`}
            </div>
          </div>
        )}

        {/* 过大文件：静态拦截（未请求） */}
        {!loading && blockKind === 'too-large' && (
          <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center gap-3">
            <div
              className="p-4 rounded-full"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <FileWarning size={28} className="text-amber-400" />
            </div>
            <div className="text-sm font-medium text-[var(--color-text-primary)]">
              文件过大，无法预览
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {fileName}
              {typeof fileSize === 'number' && ` · ${formatBytes(fileSize)}`}
              {` · 上限 ${formatBytes(MAX_PREVIEW_SIZE)}`}
            </div>
          </div>
        )}

        {/* 其它错误（例如后端返回 file too large 兜底） */}
        {!loading && blockKind === null && error && (
          (() => {
            const isSizeErr = /file too large/i.test(error);
            return (
              <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center gap-3">
                <div
                  className="p-4 rounded-full"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  {isSizeErr
                    ? <FileWarning size={28} className="text-amber-400" />
                    : <X size={28} className="text-red-400" />}
                </div>
                <div className="text-sm font-medium text-[var(--color-text-primary)]">
                  {isSizeErr ? '文件过大，无法预览' : '无法打开文件'}
                </div>
                <div
                  className="text-xs break-all max-w-md"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {error}
                </div>
              </div>
            );
          })()
        )}

        {!loading && !error && blockKind === null && content !== null && (
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            showLineNumbers
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              padding: '0.75rem 0',
              background: 'var(--color-surface-0)',
              fontSize: '0.75rem',
              lineHeight: '1.65',
              minHeight: '100%',
            }}
            codeTagProps={{
              style: {
                fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                tabSize: 2,
              },
            }}
            lineNumberStyle={{
              minWidth: '2.5em',
              paddingRight: '1em',
              color: 'var(--color-text-muted)',
              borderRight: '1px solid var(--color-border)',
              marginRight: '1em',
              userSelect: 'none',
              textAlign: 'right',
            }}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}
