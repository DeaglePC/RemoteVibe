import { getApiBaseUrl, getAuthHeaders } from '../stores/backendStore';

/**
 * 单个上传成功后返回的文件信息。
 */
export interface UploadedFile {
  /** 原始文件名 */
  name: string;
  /** 保存后的绝对路径（用于提示词里的 @路径 引用） */
  absPath: string;
  /** 文件大小（字节） */
  size: number;
  /** 是否图片类型 */
  isImage: boolean;
}

export interface UploadError {
  name: string;
  message: string;
}

export interface UploadResult {
  files: UploadedFile[];
  errors: UploadError[];
}

/** 单文件大小上限：20MB */
export const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
/** 单次最多上传文件数 */
export const MAX_UPLOAD_COUNT = 10;

/**
 * 上传一批文件到后端。
 * 后端会根据 workDir 哈希保存到 ~/.baomima-agent-gateway/uploads/<hash>/<stamp>/ 目录下，
 * 并返回绝对路径供前端在提示词里以 @路径 形式引用。
 */
export async function uploadFiles(
  files: File[],
  workDir: string,
  signal?: AbortSignal,
): Promise<UploadResult> {
  // 前置校验：大小、数量
  const errors: UploadError[] = [];
  const accepted: File[] = [];
  for (const f of files) {
    if (f.size > MAX_UPLOAD_SIZE) {
      errors.push({ name: f.name, message: `文件过大（> 20MB）` });
      continue;
    }
    accepted.push(f);
  }
  if (accepted.length === 0) {
    return { files: [], errors };
  }
  if (accepted.length > MAX_UPLOAD_COUNT) {
    const skipped = accepted.splice(MAX_UPLOAD_COUNT);
    skipped.forEach((f) => {
      errors.push({ name: f.name, message: `超过单次上传数量上限（${MAX_UPLOAD_COUNT}）` });
    });
  }

  const apiBase = getApiBaseUrl();
  const formData = new FormData();
  formData.append('workDir', workDir);
  accepted.forEach((f) => {
    formData.append('files', f, f.name);
  });

  // 注意：multipart 不能带 Content-Type，让浏览器自动生成 boundary
  const baseHeaders = getAuthHeaders() as Record<string, string>;
  const headers: Record<string, string> = {};
  if (baseHeaders.Authorization) {
    headers.Authorization = baseHeaders.Authorization;
  }

  const resp = await fetch(`${apiBase}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
    signal,
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`Upload failed: ${msg || resp.status}`);
  }

  const data = await resp.json() as {
    files?: Array<{ name: string; absPath: string; size: number; isImage: boolean }>;
    errors?: UploadError[];
  };

  const uploaded = (data.files ?? []).map((f) => ({
    name: f.name,
    absPath: f.absPath,
    size: f.size,
    isImage: f.isImage,
  }));

  const serverErrors = data.errors ?? [];
  return {
    files: uploaded,
    errors: [...errors, ...serverErrors],
  };
}
