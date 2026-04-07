package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"agentinhand/internal/agent"
	"agentinhand/internal/config"
	"agentinhand/internal/gateway"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Printf("Warning: Could not load config file %s: %v. Using defaults.", *configPath, err)
		cfg = config.Default()
	}

	log.Printf("🚀 BaoMiHua Agent Gateway starting...")
	log.Printf("   Listening on :%d", cfg.Server.Port)

	// Initialize agent manager
	mgr := agent.NewManager(cfg)

	// Initialize WebSocket gateway
	srv := gateway.NewServer(cfg, mgr)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Println("Shutting down...")
		mgr.StopAll()
		srv.Shutdown()
	}()

	if err := srv.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
