// 文件上传相关处理：支持在聊天输入框中通过附件按钮上传文件，
// 保存到 ~/.baomima-agent-gateway/uploads/<workspaceHash>/<timestamp>/<filename>，
// 返回绝对路径供前端在提示词中以 @<abs> 的形式引用给 AI Agent。
package gateway

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 单文件大小上限：20 MB
const maxUploadBytes int64 = 20 * 1024 * 1024

// 单次上传最多文件数
const maxUploadFiles = 10

// multipart 解析最大内存阈值：超过会落盘到临时文件
const uploadMemoryLimit int64 = 10 * 1024 * 1024

// uploadsBaseDir 返回全局上传根目录 ~/.baomima-agent-gateway/uploads
func uploadsBaseDir() (string, error) {
	base, err := sessionsDataDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "uploads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("cannot create uploads directory: %w", err)
	}
	return dir, nil
}

// workspaceHash 根据工作区绝对路径生成稳定的短哈希，用作子目录名
func workspaceHash(workDir string) string {
	sum := sha1.Sum([]byte(workDir))
	return hex.EncodeToString(sum[:])[:12]
}

// uploadedFileResult 上传成功的单个文件信息，返回给前端
type uploadedFileResult struct {
	Name    string `json:"name"`
	AbsPath string `json:"absPath"`
	Size    int64  `json:"size"`
	IsImage bool   `json:"isImage"`
}

// uploadErrorResult 上传失败的单个文件信息
type uploadErrorResult struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

// sanitizeFilename 清理文件名：去掉目录分隔符，避免路径逃逸；保留原扩展名
func sanitizeFilename(name string) string {
	// 取 base，剔除所有路径部分
	name = filepath.Base(name)
	// Windows 兼容：反斜杠也视作分隔符
	if idx := strings.LastIndexAny(name, `\/`); idx >= 0 {
		name = name[idx+1:]
	}
	// 过滤控制字符与不允许的字符
	var b strings.Builder
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			continue
		}
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	cleaned := strings.TrimSpace(b.String())
	if cleaned == "" || cleaned == "." || cleaned == ".." {
		return fmt.Sprintf("file_%d", time.Now().UnixNano())
	}
	return cleaned
}

// isImageExt 简单根据扩展名判断是否是图片
func isImageExt(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff":
		return true
	}
	return false
}

// uniquePath 若目标文件已存在则在文件名前追加 _1、_2 ...
func uniquePath(dir, name string) string {
	dst := filepath.Join(dir, name)
	if _, err := os.Stat(dst); os.IsNotExist(err) {
		return dst
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 1; i < 1000; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s_%d%s", base, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
	// 退化兜底
	return filepath.Join(dir, fmt.Sprintf("%s_%d%s", base, time.Now().UnixNano(), ext))
}

// saveUploadedFile 把单个 multipart 上传文件写入目标目录，返回文件信息
func saveUploadedFile(fh *multipart.FileHeader, targetDir string) (uploadedFileResult, error) {
	src, err := fh.Open()
	if err != nil {
		return uploadedFileResult{}, fmt.Errorf("open upload stream: %w", err)
	}
	defer src.Close()

	name := sanitizeFilename(fh.Filename)
	dstPath := uniquePath(targetDir, name)

	dst, err := os.OpenFile(dstPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return uploadedFileResult{}, fmt.Errorf("create target file: %w", err)
	}

	// 使用 LimitReader 再兜底一次，防止恶意超大
	written, copyErr := io.Copy(dst, io.LimitReader(src, maxUploadBytes+1))
	closeErr := dst.Close()
	if copyErr != nil {
		os.Remove(dstPath)
		return uploadedFileResult{}, fmt.Errorf("write target file: %w", copyErr)
	}
	if closeErr != nil {
		os.Remove(dstPath)
		return uploadedFileResult{}, fmt.Errorf("close target file: %w", closeErr)
	}
	if written > maxUploadBytes {
		os.Remove(dstPath)
		return uploadedFileResult{}, fmt.Errorf("file too large: %d bytes (max %d)", written, maxUploadBytes)
	}

	abs, err := filepath.Abs(dstPath)
	if err != nil {
		abs = dstPath
	}

	return uploadedFileResult{
		Name:    filepath.Base(dstPath),
		AbsPath: abs,
		Size:    written,
		IsImage: isImageExt(dstPath),
	}, nil
}

// handleUpload 处理附件上传请求：POST /api/upload (multipart/form-data)
//
// 表单字段：
//   - workDir: 当前工作区绝对路径（必填，作为哈希入参，实际文件不会保存到该目录）
//   - files:   多文件字段（可重复，单文件 <= 20MB，单次 <= 10 个）
//   - file:    兼容的单文件字段
//
// 成功返回：{"files":[...uploadedFileResult], "errors":[...uploadErrorResult]}
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// 限制总请求体大小：maxFiles * maxSize + 少量余量
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadFiles*maxUploadBytes+1<<20)

	if err := r.ParseMultipartForm(uploadMemoryLimit); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		msg, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("parse multipart failed: %v", err)})
		w.Write(msg)
		return
	}

	workDir := strings.TrimSpace(r.FormValue("workDir"))
	if workDir == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"workDir is required"}`))
		return
	}

	// 目标子目录：<uploads_base>/<hash>/<timestamp>/
	base, err := uploadsBaseDir()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		msg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(msg)
		return
	}
	stamp := time.Now().Format("20060102-150405")
	targetDir := filepath.Join(base, workspaceHash(workDir), stamp)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		msg, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("cannot create target dir: %v", err)})
		w.Write(msg)
		return
	}

	form := r.MultipartForm
	if form == nil || form.File == nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"no files in request"}`))
		return
	}

	// 支持字段名 "files"（多文件）；兼容 "file" 单文件字段
	headers := make([]*multipart.FileHeader, 0)
	headers = append(headers, form.File["files"]...)
	headers = append(headers, form.File["file"]...)
	if len(headers) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"no files in request"}`))
		return
	}
	if len(headers) > maxUploadFiles {
		headers = headers[:maxUploadFiles]
	}

	results := make([]uploadedFileResult, 0, len(headers))
	errs := make([]uploadErrorResult, 0)

	for _, fh := range headers {
		if fh.Size > maxUploadBytes {
			errs = append(errs, uploadErrorResult{
				Name:    fh.Filename,
				Message: fmt.Sprintf("file too large: %d bytes (max %d)", fh.Size, maxUploadBytes),
			})
			continue
		}
		saved, serr := saveUploadedFile(fh, targetDir)
		if serr != nil {
			errs = append(errs, uploadErrorResult{Name: fh.Filename, Message: serr.Error()})
			continue
		}
		results = append(results, saved)
	}

	payload := map[string]any{
		"files":  results,
		"errors": errs,
	}
	data, _ := json.Marshal(payload)
	w.Write(data)
}
