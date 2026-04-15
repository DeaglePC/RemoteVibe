package agent

import (
	"fmt"
	"log"
	"sync"

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

// Process wraps a single agent and its communication backend (ACP or CLI)
type Process struct {
	def     config.AgentDef
	backend Backend
	state   ProcessState
	mu      sync.RWMutex
	err     error

	// Callbacks
	OnStateChange func(state ProcessState)
}

// NewProcess creates a new agent process wrapper.
// 根据 AgentDef.Mode 自动选择 ACP 或 CLI 后端。
func NewProcess(def config.AgentDef) *Process {
	var backend Backend
	switch def.Mode {
	case "cli":
		backend = NewCLIBackend(def)
	case "acp":
		backend = NewACPBackend(def)
	default:
		// 默认使用 ACP 模式（向后兼容）
		backend = NewACPBackend(def)
	}

	return &Process{
		def:     def,
		backend: backend,
		state:   StateIdle,
	}
}

// Start launches the agent subprocess
func (p *Process) Start(opts StartOptions) error {
	p.mu.Lock()

	if p.state == StateRunning {
		p.mu.Unlock()
		return fmt.Errorf("agent already running")
	}

	p.setState(StateStarting)
	p.mu.Unlock()

	log.Printf("[Process] Starting %s (mode=%s, workDir=%s, session=%s, model=%s)",
		p.def.Name, p.backend.Mode(), opts.WorkDir, opts.GeminiSessionID, opts.Model)

	if err := p.backend.Start(opts.WorkDir, opts.GeminiSessionID, opts.Model); err != nil {
		p.mu.Lock()
		p.setError(fmt.Errorf("start %s backend: %w", p.backend.Mode(), err))
		retErr := p.err
		p.mu.Unlock()
		return retErr
	}

	p.mu.Lock()
	p.setState(StateRunning)
	log.Printf("[Process] Agent %s is now running (mode=%s, sessionID=%s)",
		p.def.Name, p.backend.Mode(), p.backend.SessionID())
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

	if p.backend != nil {
		p.backend.Stop()
	}

	p.setState(StateStopped)
}

// Backend returns the communication backend for this process
func (p *Process) Backend() Backend {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.backend
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
