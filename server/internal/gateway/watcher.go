package gateway

import (
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// DirWatcher 监听指定工作目录下的文件变化，通过回调推送事件
type DirWatcher struct {
	watcher *fsnotify.Watcher
	rootDir string
	onEvent func(event FSEventPayload)
	done    chan struct{}
	mu      sync.Mutex
	closed  bool

	// 防抖：对同一路径的连续事件合并
	pending   map[string]*pendingEvent
	pendingMu sync.Mutex
	ticker    *time.Ticker
}

type pendingEvent struct {
	payload   FSEventPayload
	updatedAt time.Time
}

// 防抖间隔：同一路径在此时间内的连续事件只推送一次
const debounceInterval = 300 * time.Millisecond

// NewDirWatcher 创建并启动目录监听器
// rootDir: 要监听的根目录
// onEvent: 有文件变化时的回调函数
func NewDirWatcher(rootDir string, onEvent func(event FSEventPayload)) (*DirWatcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	// 只监听根目录本身（不递归），保持轻量
	// 当用户展开子目录时，前端可发送 watch_dir 消息来添加子目录监听
	if err := w.Add(rootDir); err != nil {
		w.Close()
		return nil, err
	}

	dw := &DirWatcher{
		watcher: w,
		rootDir: rootDir,
		onEvent: onEvent,
		done:    make(chan struct{}),
		pending: make(map[string]*pendingEvent),
		ticker:  time.NewTicker(debounceInterval),
	}

	go dw.eventLoop()
	go dw.flushLoop()

	log.Printf("[DirWatcher] Started watching: %s", rootDir)
	return dw, nil
}

// AddDir 添加子目录监听
func (dw *DirWatcher) AddDir(dir string) error {
	dw.mu.Lock()
	defer dw.mu.Unlock()
	if dw.closed {
		return nil
	}
	return dw.watcher.Add(dir)
}

// RemoveDir 移除子目录监听
func (dw *DirWatcher) RemoveDir(dir string) error {
	dw.mu.Lock()
	defer dw.mu.Unlock()
	if dw.closed {
		return nil
	}
	return dw.watcher.Remove(dir)
}

// Close 停止监听并释放资源
func (dw *DirWatcher) Close() {
	dw.mu.Lock()
	defer dw.mu.Unlock()
	if dw.closed {
		return
	}
	dw.closed = true
	dw.ticker.Stop()
	close(dw.done)
	dw.watcher.Close()
	log.Printf("[DirWatcher] Stopped watching: %s", dw.rootDir)
}

// eventLoop 读取 fsnotify 事件并加入防抖队列
func (dw *DirWatcher) eventLoop() {
	for {
		select {
		case <-dw.done:
			return

		case event, ok := <-dw.watcher.Events:
			if !ok {
				return
			}
			dw.handleFSEvent(event)

		case err, ok := <-dw.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[DirWatcher] Error: %v", err)
		}
	}
}

// flushLoop 定期将防抖队列中到期的事件推送出去
func (dw *DirWatcher) flushLoop() {
	for {
		select {
		case <-dw.done:
			return
		case <-dw.ticker.C:
			dw.flush()
		}
	}
}

// handleFSEvent 将 fsnotify 事件转换为应用事件并加入防抖队列
func (dw *DirWatcher) handleFSEvent(event fsnotify.Event) {
	// 忽略临时文件和编辑器备份文件
	name := filepath.Base(event.Name)
	if strings.HasPrefix(name, ".") && strings.HasSuffix(name, ".swp") {
		return
	}
	if strings.HasSuffix(name, "~") || strings.HasSuffix(name, ".tmp") {
		return
	}
	// 忽略 .git 目录下的变化
	if strings.Contains(event.Name, string(filepath.Separator)+".git"+string(filepath.Separator)) {
		return
	}

	action := classifyAction(event.Op)
	if action == "" {
		return
	}

	// 提取受影响的父目录路径（前端需要知道刷新哪个目录）
	dirPath := filepath.Dir(event.Name)

	payload := FSEventPayload{
		Path:   event.Name,
		Dir:    dirPath,
		Name:   name,
		Action: action,
	}

	dw.pendingMu.Lock()
	dw.pending[event.Name] = &pendingEvent{
		payload:   payload,
		updatedAt: time.Now(),
	}
	dw.pendingMu.Unlock()
}

// flush 将到期的防抖事件推送给前端
func (dw *DirWatcher) flush() {
	now := time.Now()
	var toSend []FSEventPayload

	dw.pendingMu.Lock()
	for key, pe := range dw.pending {
		if now.Sub(pe.updatedAt) >= debounceInterval {
			toSend = append(toSend, pe.payload)
			delete(dw.pending, key)
		}
	}
	dw.pendingMu.Unlock()

	for _, payload := range toSend {
		dw.onEvent(payload)
	}
}

// classifyAction 将 fsnotify 操作转换为字符串动作
func classifyAction(op fsnotify.Op) string {
	switch {
	case op.Has(fsnotify.Create):
		return "create"
	case op.Has(fsnotify.Remove) || op.Has(fsnotify.Rename):
		return "remove"
	case op.Has(fsnotify.Write):
		return "modify"
	case op.Has(fsnotify.Chmod):
		// chmod 事件通常不需要通知前端
		return ""
	default:
		return ""
	}
}
