package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all configuration for the gateway
type Config struct {
	Server ServerConfig `yaml:"server"`
	Auth   AuthConfig   `yaml:"auth"`
	Agents []AgentDef   `yaml:"agents"`
}

// ServerConfig holds HTTP/WebSocket server settings
type ServerConfig struct {
	Port            int    `yaml:"port"`
	AllowedOrigins  []string `yaml:"allowed_origins"`
}

// AuthConfig holds authentication settings
type AuthConfig struct {
	Token string `yaml:"token"`
}

// AgentDef defines how to launch a specific agent
type AgentDef struct {
	ID      string   `yaml:"id"`
	Name    string   `yaml:"name"`
	Command string   `yaml:"command"`
	Args    []string `yaml:"args"`
}

// Default returns a sane default configuration
func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Port:           3710,
			AllowedOrigins: []string{"*"},
		},
		Auth: AuthConfig{
			Token: "",
		},
		Agents: []AgentDef{
			{
				ID:      "gemini",
				Name:    "Gemini CLI",
				Command: "gemini",
				Args:    []string{"--acp"},
			},
		},
	}
}

// Load reads config from a YAML file
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := Default()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
