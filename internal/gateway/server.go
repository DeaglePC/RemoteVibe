package gateway

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"agentinhand/internal/agent"
	"agentinhand/internal/config"
)

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
