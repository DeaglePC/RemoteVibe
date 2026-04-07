package agent

import (
	"fmt"
	"log"
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
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.state == StateRunning {
		return fmt.Errorf("agent already running")
	}

	p.setState(StateStarting)

	// Build command
	p.cmd = exec.Command(p.def.Command, p.def.Args...)
	if workDir != "" {
		p.cmd.Dir = workDir
	}

	// Set up pipes
	stdin, err := p.cmd.StdinPipe()
	if err != nil {
		p.setError(fmt.Errorf("stdin pipe: %w", err))
		return p.err
	}

	stdout, err := p.cmd.StdoutPipe()
	if err != nil {
		p.setError(fmt.Errorf("stdout pipe: %w", err))
		return p.err
	}

	// Start process
	if err := p.cmd.Start(); err != nil {
		p.setError(fmt.Errorf("start process: %w", err))
		return p.err
	}

	log.Printf("[Agent] Started %s (PID: %d)", p.def.Name, p.cmd.Process.Pid)

	// Create ACP client over the pipes
	p.client = acp.NewClient(stdout, stdin)
	p.client.Start()

	// Monitor process exit
	go func() {
		err := p.cmd.Wait()
		p.mu.Lock()
		defer p.mu.Unlock()
		if err != nil {
			log.Printf("[Agent] Process %s exited with error: %v", p.def.Name, err)
			p.setError(err)
		} else {
			log.Printf("[Agent] Process %s exited normally", p.def.Name)
			p.setState(StateStopped)
		}
	}()

	// ACP Initialize handshake
	initResult, err := p.client.Initialize()
	if err != nil {
		p.Stop()
		p.setError(fmt.Errorf("ACP initialize: %w", err))
		return p.err
	}

	log.Printf("[Agent] ACP initialized: %s v%s", initResult.AgentInfo.Name, initResult.AgentInfo.Version)

	// Create session
	sessionID, err := p.client.SessionNew()
	if err != nil {
		p.Stop()
		p.setError(fmt.Errorf("ACP session/new: %w", err))
		return p.err
	}

	log.Printf("[Agent] Session created: %s", sessionID)
	p.setState(StateRunning)
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
