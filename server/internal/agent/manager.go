package agent

import (
	"fmt"
	"log"
	"sync"

	"agentinhand/internal/config"
)

// Manager handles the lifecycle of all agent processes
type Manager struct {
	cfg       *config.Config
	agents    map[string]*Process // id -> process
	mu        sync.RWMutex
}

// NewManager creates a new agent manager
func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		cfg:    cfg,
		agents: make(map[string]*Process),
	}
}

// ListAgents returns the available agent definitions
func (m *Manager) ListAgents() []config.AgentDef {
	return m.cfg.Agents
}

// GetAgent returns the process for a given agent ID (may be nil if not started)
func (m *Manager) GetAgent(agentID string) *Process {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.agents[agentID]
}

// StartAgent launches an agent process
func (m *Manager) StartAgent(agentID string, workDir string) (*Process, error) {
	return m.startAgentInternal(agentID, workDir, "")
}

// StartAgentWithResume 启动 Agent 并恢复已有的 Gemini CLI 会话
func (m *Manager) StartAgentWithResume(agentID string, workDir string, geminiSessionID string) (*Process, error) {
	return m.startAgentInternal(agentID, workDir, geminiSessionID)
}

// startAgentInternal 是启动 Agent 的内部方法
func (m *Manager) startAgentInternal(agentID string, workDir string, geminiSessionID string) (*Process, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already running
	if p, ok := m.agents[agentID]; ok && p.State() == StateRunning {
		return p, nil
	}

	// Find agent definition
	var agentDef *config.AgentDef
	for i := range m.cfg.Agents {
		if m.cfg.Agents[i].ID == agentID {
			agentDef = &m.cfg.Agents[i]
			break
		}
	}
	if agentDef == nil {
		return nil, fmt.Errorf("unknown agent: %s", agentID)
	}

	// Create and start process
	proc := NewProcess(*agentDef)
	var err error
	if geminiSessionID != "" {
		err = proc.StartWithResume(workDir, geminiSessionID)
	} else {
		err = proc.Start(workDir)
	}
	if err != nil {
		return nil, fmt.Errorf("start agent %s: %w", agentID, err)
	}

	m.agents[agentID] = proc
	log.Printf("[Manager] Agent %s started", agentID)
	return proc, nil
}

// StopAgent stops a specific agent
func (m *Manager) StopAgent(agentID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if p, ok := m.agents[agentID]; ok {
		p.Stop()
		delete(m.agents, agentID)
		log.Printf("[Manager] Agent %s stopped", agentID)
	}
}

// StopAll stops all running agents
func (m *Manager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, p := range m.agents {
		p.Stop()
		log.Printf("[Manager] Agent %s stopped", id)
	}
	m.agents = make(map[string]*Process)
}
