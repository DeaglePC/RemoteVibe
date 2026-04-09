import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, getAuthHeaders } from '../../stores/backendStore';
import {
  X, FileCode, FileText, FileImage, Database, Terminal,
  Lock, LayoutTemplate, Copy, Check, ArrowLeft,
} from 'lucide-react';

interface Props {
  filePath: string;
  fileName: string;
  onClose: () => void;
  /** 在手机模式下是否全屏 */
  isMobile?: boolean;
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

export default function FileViewer({ filePath, fileName, onClose, isMobile }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const language = getLanguage(fileName);

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
    fetchContent();
  }, [fetchContent]);

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = content?.split('\n') || [];
  const lineCount = lines.length;
  const lineNumWidth = Math.max(String(lineCount).length * 0.6 + 1, 2.5);

  return (
    <div className={`flex flex-col h-full ${isMobile ? '' : ''}`}
      style={{ background: 'var(--color-surface-0)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {isMobile && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getFileIcon(fileName)}
          <span className="text-sm font-medium truncate text-[var(--color-text-primary)]">
            {fileName}
          </span>
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
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-accent-400)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
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

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--color-accent-500)', animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="m-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center flex flex-col items-center gap-2">
            <X size={24} className="text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {!loading && !error && content !== null && (
          <div className="flex text-xs font-mono leading-relaxed">
            {/* Line numbers */}
            <div
              className="flex-shrink-0 text-right select-none py-3 sticky left-0"
              style={{
                width: `${lineNumWidth}rem`,
                color: 'var(--color-text-muted)',
                background: 'var(--color-surface-1)',
                borderRight: '1px solid var(--color-border)',
                paddingRight: '0.5rem',
              }}
            >
              {lines.map((_, i) => (
                <div key={i} className="px-2" style={{ lineHeight: '1.65' }}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code content */}
            <pre
              className="flex-1 py-3 px-4 m-0 overflow-x-auto"
              style={{
                color: 'var(--color-text-secondary)',
                lineHeight: '1.65',
                tabSize: 2,
                background: 'transparent',
              }}
            >
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
