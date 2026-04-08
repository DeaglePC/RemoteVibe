package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"agentinhand/internal/agent"
	"agentinhand/internal/config"
)

// sessionsDataDir 返回会话数据存储目录 ~/.baomima-agent-gateway
func sessionsDataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	dir := filepath.Join(home, ".baomima-agent-gateway")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("cannot create data directory: %w", err)
	}
	return dir, nil
}

// sessionsFilePath 返回会话数据文件路径
func sessionsFilePath() (string, error) {
	dir, err := sessionsDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "sessions.json"), nil
}

// workspacesFilePath 返回工作区记录文件路径
func workspacesFilePath() (string, error) {
	dir, err := sessionsDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "workspaces.json"), nil
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 16,
	WriteBufferSize: 1024 * 16,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev; tighten in production
	},
}

// Server is the HTTP + WebSocket server
type Server struct {
	cfg    *config.Config
	mgr    *agent.Manager
	httpSrv *http.Server

	clients   map[*websocket.Conn]*ClientConn
	clientsMu sync.RWMutex
}

// ClientConn tracks a connected WebSocket client
type ClientConn struct {
	conn    *websocket.Conn
	send    chan []byte
	writeMu sync.Mutex
}

// NewServer creates a new gateway server
func NewServer(cfg *config.Config, mgr *agent.Manager) *Server {
	s := &Server{
		cfg:     cfg,
		mgr:     mgr,
		clients: make(map[*websocket.Conn]*ClientConn),
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/browse", s.handleBrowse)
	mux.HandleFunc("/api/mkdir", s.handleMkdir)
	mux.HandleFunc("/api/files", s.handleFiles)
	mux.HandleFunc("/api/sessions", s.handleSessions)
	mux.HandleFunc("/api/workspaces", s.handleWorkspaces)
	mux.HandleFunc("/api/auth-status", s.handleAuthStatus)
	mux.HandleFunc("/api/gemini-sessions", s.handleGeminiSessions)
	mux.HandleFunc("/ws", s.handleWebSocket)

	s.httpSrv = &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: s.corsMiddleware(s.authMiddleware(mux)),
	}

	return s
}

// Start begins listening
func (s *Server) Start() error {
	log.Printf("[Gateway] Server starting on :%d", s.cfg.Server.Port)
	return s.httpSrv.ListenAndServe()
}

// Shutdown gracefully stops the server
func (s *Server) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	s.clientsMu.Lock()
	for _, c := range s.clients {
		c.conn.Close()
	}
	s.clientsMu.Unlock()

	s.httpSrv.Shutdown(ctx)
}

// ==================== Middleware ====================

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth if no token configured
		if s.cfg.Auth.Token == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Health endpoint doesn't need auth
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Check token from query param (for WebSocket) or Authorization header
		token := r.URL.Query().Get("token")
		if token == "" {
			auth := r.Header.Get("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				token = strings.TrimPrefix(auth, "Bearer ")
			}
		}

		if token != s.cfg.Auth.Token {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ==================== HTTP Handlers ====================

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

// FileEntry 表示目录中的文件或子目录信息
type FileEntry struct {
	Name    string `json:"name"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"` // Unix 毫秒时间戳
}

// handleBrowse 返回指定目录下的子目录列表，用于前端目录选择器
// 支持 ?showFiles=true 显示文件，?showHidden=true 显示隐藏文件
func (s *Server) handleBrowse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		// 默认返回用户 home 目录
		home, err := os.UserHomeDir()
		if err != nil {
			http.Error(w, `{"error":"cannot determine home directory"}`, http.StatusInternalServerError)
			return
		}
		dirPath = home
	}

	showFiles := r.URL.Query().Get("showFiles") == "true"
	showHidden := r.URL.Query().Get("showHidden") == "true"

	// 清理路径
	dirPath = filepath.Clean(dirPath)

	// 读取目录
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	var items []FileEntry
	for _, entry := range entries {
		// 跳过隐藏文件/目录（除非 showHidden）
		if !showHidden && strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		// 如果不显示文件，只保留目录
		if !showFiles && !entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		items = append(items, FileEntry{
			Name:    entry.Name(),
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().UnixMilli(),
		})
	}

	// 确保空目录返回空数组 [] 而非 null
	if items == nil {
		items = []FileEntry{}
	}

	result := map[string]interface{}{
		"path":    dirPath,
		"entries": items,
	}

	data, _ := json.Marshal(result)
	w.Write(data)
}

// handleMkdir 在指定路径创建新目录
func (s *Server) handleMkdir(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		w.Write(errMsg)
		return
	}

	dirPath := filepath.Clean(body.Path)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	data, _ := json.Marshal(map[string]string{"path": dirPath})
	w.Write(data)
}

// handleFiles 返回指定目录下的所有文件和子目录（含文件信息），用于文件浏览器
func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": "path is required"})
		w.Write(errMsg)
		return
	}

	showHidden := r.URL.Query().Get("showHidden") == "true"
	dirPath = filepath.Clean(dirPath)

	// 检查路径是否存在
	stat, err := os.Stat(dirPath)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	// 如果是文件，返回文件信息
	if !stat.IsDir() {
		item := FileEntry{
			Name:    stat.Name(),
			IsDir:   false,
			Size:    stat.Size(),
			ModTime: stat.ModTime().UnixMilli(),
		}
		data, _ := json.Marshal(map[string]interface{}{
			"path":  dirPath,
			"isDir": false,
			"file":  item,
		})
		w.Write(data)
		return
	}

	// 读取目录
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	var items []FileEntry
	for _, entry := range entries {
		if !showHidden && strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		items = append(items, FileEntry{
			Name:    entry.Name(),
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().UnixMilli(),
		})
	}

	// 确保空目录返回空数组 [] 而非 null
	if items == nil {
		items = []FileEntry{}
	}

	data, _ := json.Marshal(map[string]interface{}{
		"path":    dirPath,
		"isDir":   true,
		"entries": items,
	})
	w.Write(data)
}

// handleSessions 处理会话数据的持久化操作
// GET: 加载所有会话数据
// PUT: 保存会话数据
// DELETE: 清除所有历史会话
func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		s.handleSessionsLoad(w)
	case http.MethodPut:
		s.handleSessionsSave(w, r)
	case http.MethodDelete:
		s.handleSessionsDelete(w)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// handleSessionsLoad 从文件加载会话数据
func (s *Server) handleSessionsLoad(w http.ResponseWriter) {
	fp, err := sessionsFilePath()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	data, err := os.ReadFile(fp)
	if err != nil {
		if os.IsNotExist(err) {
			// 文件不存在，返回空数据
			w.Write([]byte(`{"sessions":[],"activeSessionId":null,"version":1}`))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	// 直接返回文件内容（前端 JSON 格式）
	w.Write(data)
}

// handleSessionsSave 将会话数据保存到文件
func (s *Server) handleSessionsSave(w http.ResponseWriter, r *http.Request) {
	fp, err := sessionsFilePath()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024)) // 限制 10MB
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": "failed to read request body"})
		w.Write(errMsg)
		return
	}

	// 验证 JSON 格式
	if !json.Valid(body) {
		w.WriteHeader(http.StatusBadRequest)
		errMsg, _ := json.Marshal(map[string]string{"error": "invalid JSON"})
		w.Write(errMsg)
		return
	}

	// 写入临时文件后重命名，确保原子性
	tmpPath := fp + ".tmp"
	if err := os.WriteFile(tmpPath, body, 0644); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	if err := os.Rename(tmpPath, fp); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	w.Write([]byte(`{"ok":true}`))
}

// handleSessionsDelete 删除会话数据文件
func (s *Server) handleSessionsDelete(w http.ResponseWriter) {
	fp, err := sessionsFilePath()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	if err := os.Remove(fp); err != nil && !os.IsNotExist(err) {
		w.WriteHeader(http.StatusInternalServerError)
		errMsg, _ := json.Marshal(map[string]string{"error": err.Error()})
		w.Write(errMsg)
		return
	}

	w.Write([]byte(`{"ok":true}`))
}

// handleWorkspaces 管理工作区记录
// GET: 返回 [{path, lastUsed, sessionCount}]
// POST: 记录一个工作区的使用（{path: "/some/dir"}）
func (s *Server) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		s.handleWorkspacesGet(w)
	case http.MethodPost:
		s.handleWorkspacesRecord(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// workspaceRecord 表示一条工作区使用记录
type workspaceRecord struct {
	Path         string `json:"path"`
	LastUsed     int64  `json:"lastUsed"`
	SessionCount int    `json:"sessionCount"`
}

// loadWorkspacesFile 读取 workspaces.json
func loadWorkspacesFile() ([]workspaceRecord, error) {
	fp, err := workspacesFilePath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(fp)
	if err != nil {
		if os.IsNotExist(err) {
			return []workspaceRecord{}, nil
		}
		return nil, err
	}

	var records []workspaceRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return []workspaceRecord{}, nil
	}
	return records, nil
}

// saveWorkspacesFile 写入 workspaces.json
func saveWorkspacesFile(records []workspaceRecord) error {
	fp, err := workspacesFilePath()
	if err != nil {
		return err
	}

	data, err := json.Marshal(records)
	if err != nil {
		return err
	}

	// 原子写入
	tmpPath := fp + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, fp)
}

// handleWorkspacesGet 返回工作区列表，合并 workspaces.json 和 sessions.json 数据
func (s *Server) handleWorkspacesGet(w http.ResponseWriter) {
	// 先从独立 workspaces.json 加载
	records, err := loadWorkspacesFile()
	if err != nil {
		log.Printf("[Gateway] Failed to load workspaces.json: %v", err)
		records = []workspaceRecord{}
	}

	// 补充从 sessions.json 中提取的工作区（向后兼容）
	sessionWorkspaces := s.extractWorkspacesFromSessions()
	wsMap := make(map[string]*workspaceRecord)
	for i := range records {
		wsMap[records[i].Path] = &records[i]
	}
	for _, sw := range sessionWorkspaces {
		if existing, ok := wsMap[sw.Path]; ok {
			// 合并：取更大的 lastUsed 和累加 sessionCount
			if sw.LastUsed > existing.LastUsed {
				existing.LastUsed = sw.LastUsed
			}
			if sw.SessionCount > existing.SessionCount {
				existing.SessionCount = sw.SessionCount
			}
		} else {
			rec := sw
			wsMap[sw.Path] = &rec
		}
	}

	// 转为数组并按 lastUsed 倒序排列
	workspaces := make([]*workspaceRecord, 0, len(wsMap))
	for _, info := range wsMap {
		workspaces = append(workspaces, info)
	}
	for i := 0; i < len(workspaces); i++ {
		for j := i + 1; j < len(workspaces); j++ {
			if workspaces[j].LastUsed > workspaces[i].LastUsed {
				workspaces[i], workspaces[j] = workspaces[j], workspaces[i]
			}
		}
	}

	result, _ := json.Marshal(map[string]interface{}{
		"workspaces": workspaces,
	})
	w.Write(result)
}

// extractWorkspacesFromSessions 从 sessions.json 中提取工作区信息（向后兼容）
func (s *Server) extractWorkspacesFromSessions() []workspaceRecord {
	fp, err := sessionsFilePath()
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(fp)
	if err != nil {
		return nil
	}

	var sessionData struct {
		Sessions []struct {
			WorkDir   string `json:"workDir"`
			CreatedAt int64  `json:"createdAt"`
		} `json:"sessions"`
	}
	if err := json.Unmarshal(data, &sessionData); err != nil {
		return nil
	}

	wsMap := make(map[string]*workspaceRecord)
	for _, sess := range sessionData.Sessions {
		if sess.WorkDir == "" {
			continue
		}
		if info, ok := wsMap[sess.WorkDir]; ok {
			info.SessionCount++
			if sess.CreatedAt > info.LastUsed {
				info.LastUsed = sess.CreatedAt
			}
		} else {
			wsMap[sess.WorkDir] = &workspaceRecord{
				Path:         sess.WorkDir,
				LastUsed:     sess.CreatedAt,
				SessionCount: 1,
			}
		}
	}

	result := make([]workspaceRecord, 0, len(wsMap))
	for _, v := range wsMap {
		result = append(result, *v)
	}
	return result
}

// handleWorkspacesRecord 记录一个工作区的使用
func (s *Server) handleWorkspacesRecord(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"path is required"}`))
		return
	}

	// 清理路径
	absPath, err := filepath.Abs(body.Path)
	if err != nil {
		absPath = body.Path
	}

	records, err := loadWorkspacesFile()
	if err != nil {
		records = []workspaceRecord{}
	}

	// 查找是否已存在
	found := false
	for i := range records {
		if records[i].Path == absPath {
			records[i].LastUsed = time.Now().UnixMilli()
			records[i].SessionCount++
			found = true
			break
		}
	}

	if !found {
		records = append(records, workspaceRecord{
			Path:         absPath,
			LastUsed:     time.Now().UnixMilli(),
			SessionCount: 1,
		})
	}

	if err := saveWorkspacesFile(records); err != nil {
		log.Printf("[Gateway] Failed to save workspaces.json: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"failed to save workspace"}`))
		return
	}

	w.Write([]byte(`{"ok":true}`))
}

// handleAuthStatus 检查各 Agent CLI 工具的认证状态
// GET: 返回 {agents: [{id, name, authenticated}]}
func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	type agentAuthInfo struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		Authenticated bool   `json:"authenticated"`
	}

	var results []agentAuthInfo
	for _, ag := range s.cfg.Agents {
		info := agentAuthInfo{
			ID:   ag.ID,
			Name: ag.Name,
		}

		// 根据 agent 类型检查认证状态
		switch ag.ID {
		case "gemini":
			// Gemini CLI 认证凭据存储在 ~/.gemini/oauth_creds.json
			home, err := os.UserHomeDir()
			if err == nil {
				credPath := filepath.Join(home, ".gemini", "oauth_creds.json")
				if _, err := os.Stat(credPath); err == nil {
					info.Authenticated = true
				}
			}
		default:
			// 其他 agent 默认认为已认证（或未知状态）
			info.Authenticated = true
		}

		results = append(results, info)
	}

	// 确保返回空数组而非 null
	if results == nil {
		results = []agentAuthInfo{}
	}

	data, _ := json.Marshal(map[string]interface{}{
		"agents": results,
	})
	w.Write(data)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Gateway] WebSocket upgrade error: %v", err)
		return
	}

	client := &ClientConn{
		conn: conn,
		send: make(chan []byte, 256),
	}

	s.clientsMu.Lock()
	s.clients[conn] = client
	s.clientsMu.Unlock()

	log.Printf("[Gateway] Client connected: %s", conn.RemoteAddr())

	// Create handler for this connection
	handler := NewHandler(s, client)

	// Send agent list on connect
	handler.sendAgentList()

	// Start read/write loops
	go handler.readLoop()
	go handler.writeLoop()
}

// removeClient removes a client from the tracked connections
func (s *Server) removeClient(conn *websocket.Conn) {
	s.clientsMu.Lock()
	delete(s.clients, conn)
	s.clientsMu.Unlock()
}

// broadcast sends a message to all connected clients
func (s *Server) broadcast(msg *ServerMessage) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for _, c := range s.clients {
		sendToClient(c, msg)
	}
}

// ==================== Gemini CLI Native Sessions ====================

// geminiSessionFile 表示 Gemini CLI 会话 JSON 文件的结构（仅解析需要的字段）
type geminiSessionFile struct {
	SessionID   string `json:"sessionId"`
	StartTime   string `json:"startTime"`
	LastUpdated string `json:"lastUpdated"`
	Messages    []struct {
		Type    string `json:"type"`
		Content interface{} `json:"content"`
	} `json:"messages"`
}

// geminiProjectsFile 表示 ~/.gemini/projects.json 的结构
type geminiProjectsFile struct {
	Projects map[string]string `json:"projects"`
}

// listGeminiNativeSessions 直接读取 Gemini CLI 的本地会话文件获取会话列表
// 读取 ~/.gemini/projects.json 获取工作目录到项目短名的映射，
// 然后扫描 ~/.gemini/tmp/{项目短名}/chats/session-*.json 获取会话信息。
// 相比调用 `gemini --list-sessions` 命令（~8秒），直接读文件只需要毫秒级。
func (s *Server) listGeminiNativeSessions(workDir string) []GeminiSessionInfo {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Printf("[Gateway] Failed to get home dir: %v", err)
		return []GeminiSessionInfo{}
	}

	geminiDir := filepath.Join(home, ".gemini")

	// 读取 projects.json 获取工作目录到项目短名的映射
	projectsPath := filepath.Join(geminiDir, "projects.json")
	projectsData, err := os.ReadFile(projectsPath)
	if err != nil {
		log.Printf("[Gateway] Failed to read %s: %v", projectsPath, err)
		return []GeminiSessionInfo{}
	}

	var projects geminiProjectsFile
	if err := json.Unmarshal(projectsData, &projects); err != nil {
		log.Printf("[Gateway] Failed to parse projects.json: %v", err)
		return []GeminiSessionInfo{}
	}

	// 查找 workDir 对应的项目短名
	projectName, ok := projects.Projects[workDir]
	if !ok {
		log.Printf("[Gateway] WorkDir %s not found in Gemini CLI projects.json", workDir)
		return []GeminiSessionInfo{}
	}

	// 扫描会话文件目录
	chatsDir := filepath.Join(geminiDir, "tmp", projectName, "chats")
	entries, err := os.ReadDir(chatsDir)
	if err != nil {
		log.Printf("[Gateway] Failed to read chats dir %s: %v", chatsDir, err)
		return []GeminiSessionInfo{}
	}

	var sessions []GeminiSessionInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "session-") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		sessionPath := filepath.Join(chatsDir, entry.Name())
		data, err := os.ReadFile(sessionPath)
		if err != nil {
			log.Printf("[Gateway] Failed to read session file %s: %v", sessionPath, err)
			continue
		}

		var sf geminiSessionFile
		if err := json.Unmarshal(data, &sf); err != nil {
			log.Printf("[Gateway] Failed to parse session file %s: %v", sessionPath, err)
			continue
		}

		// 解析时间戳
		createdAt := parseISO8601ToMillis(sf.StartTime)
		updatedAt := parseISO8601ToMillis(sf.LastUpdated)
		if updatedAt == 0 {
			updatedAt = createdAt
		}

		// 从第一条用户消息中提取标题
		title := extractSessionTitle(sf.Messages)

		sessions = append(sessions, GeminiSessionInfo{
			ID:           sf.SessionID,
			Title:        title,
			CreatedAt:    createdAt,
			UpdatedAt:    updatedAt,
			MessageCount: len(sf.Messages),
		})
	}

	// 按更新时间倒序排列
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt > sessions[j].UpdatedAt
	})

	log.Printf("[Gateway] Found %d Gemini CLI sessions for %s (project: %s)", len(sessions), workDir, projectName)
	return sessions
}

// parseISO8601ToMillis 将 ISO 8601 时间字符串转换为 Unix 毫秒时间戳
func parseISO8601ToMillis(s string) int64 {
	if s == "" {
		return 0
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339, s)
		if err != nil {
			return 0
		}
	}
	return t.UnixMilli()
}

// extractSessionTitle 从会话消息中提取标题（取第一条用户消息的前 80 个字符）
func extractSessionTitle(messages []struct {
	Type    string      `json:"type"`
	Content interface{} `json:"content"`
}) string {
	for _, msg := range messages {
		if msg.Type != "user" {
			continue
		}
		// 用户消息的 content 是一个数组 [{text: "..."}]
		if arr, ok := msg.Content.([]interface{}); ok && len(arr) > 0 {
			if obj, ok := arr[0].(map[string]interface{}); ok {
				if text, ok := obj["text"].(string); ok && text != "" {
					text = strings.TrimSpace(text)
					if len(text) > 80 {
						return text[:80] + "..."
					}
					return text
				}
			}
		}
		// content 也可能直接是字符串
		if text, ok := msg.Content.(string); ok && text != "" {
			text = strings.TrimSpace(text)
			if len(text) > 80 {
				return text[:80] + "..."
			}
			return text
		}
	}
	return "Untitled session"
}

// handleGeminiSessions 处理 Gemini CLI 原生会话的 REST API 请求
// GET /api/gemini-sessions?workDir=/path/to/project
func (s *Server) handleGeminiSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	workDir := r.URL.Query().Get("workDir")
	if workDir == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"workDir is required"}`))
		return
	}

	sessions := s.listGeminiNativeSessions(workDir)

	// 确保返回空数组而非 null
	if sessions == nil {
		sessions = []GeminiSessionInfo{}
	}

	data, _ := json.Marshal(map[string]interface{}{
		"workDir":  workDir,
		"sessions": sessions,
	})
	w.Write(data)
}
