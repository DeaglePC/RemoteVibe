package agent

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"

	"agentinhand/internal/acp"
	"agentinhand/internal/config"
)

// ProcessState represents the lifecycle state of an agent process
type ProcessState string

const (
	StateIdle     ProcessState = "idle"
	StateStarting ProcessState = "starting"
	StateRunning  ProcessState = "running"
	StateStopping ProcessState = "stopping"
	StateStopped  ProcessState = "stopped"
	StateError    ProcessState = "error"
)

// Process wraps a single agent subprocess and its ACP client
type Process struct {
	def    config.AgentDef
	cmd    *exec.Cmd
	client *acp.Client
	state  ProcessState
	mu     sync.RWMutex
	err    error

	// Callbacks
	OnStateChange func(state ProcessState)
}

// NewProcess creates a new agent process wrapper
func NewProcess(def config.AgentDef) *Process {
	return &Process{
		def:   def,
		state: StateIdle,
	}
}

// Start launches the agent subprocess and initializes the ACP connection
func (p *Process) Start(workDir string) error {
	return p.startInternal(workDir, "")
}

// StartWithResume 启动 Agent 并恢复已有的 Gemini CLI 会话
func (p *Process) StartWithResume(workDir string, geminiSessionID string) error {
	return p.startInternal(workDir, geminiSessionID)
}

// startInternal 是公共启动逻辑，geminiSessionID 为空时创建新会话
func (p *Process) startInternal(workDir string, geminiSessionID string) error {
	// 第一阶段：在锁内检查状态、启动进程、创建 ACP client
	p.mu.Lock()

	if p.state == StateRunning {
		p.mu.Unlock()
		return fmt.Errorf("agent already running")
	}

	p.setState(StateStarting)

	log.Printf("[Agent] Building command: %s %v (workDir=%s, resumeSession=%s)",
		p.def.Command, p.def.Args, workDir, geminiSessionID)

	// Build command
	p.cmd = exec.Command(p.def.Command, p.def.Args...)
	if workDir != "" {
		p.cmd.Dir = workDir
	}

	// 将子进程的 stderr 输出到父进程的 stderr，便于调试
	p.cmd.Stderr = os.Stderr

	// Set up pipes
	stdin, err := p.cmd.StdinPipe()
	if err != nil {
		p.setError(fmt.Errorf("stdin pipe: %w", err))
		p.mu.Unlock()
		return p.err
	}

	stdout, err := p.cmd.StdoutPipe()
	if err != nil {
		p.setError(fmt.Errorf("stdout pipe: %w", err))
		p.mu.Unlock()
		return p.err
	}

	// Start process
	log.Printf("[Agent] Starting process...")
	if err := p.cmd.Start(); err != nil {
		p.setError(fmt.Errorf("start process: %w", err))
		p.mu.Unlock()
		return p.err
	}

	log.Printf("[Agent] Started %s (PID: %d)", p.def.Name, p.cmd.Process.Pid)

	// Create ACP client over the pipes
	p.client = acp.NewClient(stdout, stdin)
	p.client.Start()

	// 释放锁，后续的 ACP 握手操作是长耗时网络 IO，不应该在持锁期间执行
	p.mu.Unlock()

	// Monitor process exit
	go func() {
		waitErr := p.cmd.Wait()
		p.mu.Lock()
		// 进程退出后关闭 ACP client，释放 pending requests 和 dispatchLoop
		if p.client != nil {
			p.client.Stop()
		}
		if waitErr != nil {
			log.Printf("[Agent] Process %s exited with error: %v", p.def.Name, waitErr)
			p.setError(waitErr)
		} else {
			log.Printf("[Agent] Process %s exited normally", p.def.Name)
			p.setState(StateStopped)
		}
		p.mu.Unlock()
	}()

	// 第二阶段：ACP 握手（无锁状态下执行）

	// ACP Initialize handshake
	log.Printf("[Agent] Sending ACP initialize handshake...")
	initResult, err := p.client.Initialize()
	if err != nil {
		log.Printf("[Agent] ACP initialize failed: %v", err)
		p.Stop()
		p.mu.Lock()
		p.setError(fmt.Errorf("ACP initialize: %w", err))
		retErr := p.err
		p.mu.Unlock()
		return retErr
	}

	log.Printf("[Agent] ACP initialized: %s v%s (loadSession=%v)",
		initResult.AgentInfo.Name, initResult.AgentInfo.Version,
		initResult.AgentCapabilities.LoadSession)

	// 确定工作目录
	sessionCwd := workDir
	if sessionCwd == "" {
		sessionCwd, _ = os.Getwd()
	}

	// 如果提供了 geminiSessionID 并且 Agent 支持 loadSession，则恢复会话
	if geminiSessionID != "" && p.client.SupportsLoadSession() {
		log.Printf("[Agent] Loading session %s (cwd=%s)...", geminiSessionID, sessionCwd)
		sessionID, err := p.client.SessionLoad(geminiSessionID, sessionCwd)
		if err != nil {
			log.Printf("[Agent] Failed to load session %s, falling back to new: %v", geminiSessionID, err)
			// 回退到创建新会话
			log.Printf("[Agent] Creating fallback new session...")
			sessionID, err = p.client.SessionNew(sessionCwd)
			if err != nil {
				p.Stop()
				p.mu.Lock()
				p.setError(fmt.Errorf("ACP session/new fallback: %w", err))
				retErr := p.err
				p.mu.Unlock()
				return retErr
			}
			log.Printf("[Agent] Fallback session created: %s", sessionID)
		} else {
			log.Printf("[Agent] Session loaded: %s (active sessionID in client: %s)", sessionID, p.client.SessionID())
		}
	} else {
		// 创建新会话
		log.Printf("[Agent] Creating new session (cwd=%s)...", sessionCwd)
		sessionID, err := p.client.SessionNew(sessionCwd)
		if err != nil {
			p.Stop()
			p.mu.Lock()
			p.setError(fmt.Errorf("ACP session/new: %w", err))
			retErr := p.err
			p.mu.Unlock()
			return retErr
		}
		log.Printf("[Agent] Session created: %s", sessionID)
	}

	p.mu.Lock()
	p.setState(StateRunning)
	log.Printf("[Agent] Agent is now running, client sessionID=%s", p.client.SessionID())
	p.mu.Unlock()
	return nil
}

// Stop gracefully stops the agent process
func (p *Process) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.state != StateRunning && p.state != StateStarting {
		return
	}

	p.setState(StateStopping)

	// Try to cancel the session first
	if p.client != nil {
		p.client.Cancel()
		p.client.Stop()
	}

	// Kill the process
	if p.cmd != nil && p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}

	p.setState(StateStopped)
}

// Client returns the ACP client for this process
func (p *Process) Client() *acp.Client {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.client
}

// State returns the current process state
func (p *Process) State() ProcessState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

// Error returns the last error
func (p *Process) Error() error {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.err
}

func (p *Process) setState(state ProcessState) {
	p.state = state
	if p.OnStateChange != nil {
		go p.OnStateChange(state)
	}
}

func (p *Process) setError(err error) {
	p.err = err
	p.state = StateError
	if p.OnStateChange != nil {
		go p.OnStateChange(StateError)
	}
}
