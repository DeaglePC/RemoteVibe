package acp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"
)

// Transport handles reading and writing JSON-RPC messages over stdio
type Transport struct {
	reader  *bufio.Reader
	writer  io.Writer
	writeMu sync.Mutex

	// channels for dispatching messages
	onResponse     chan *Message
	onNotification chan *Message
	onRequest      chan *Message
	onError        chan error
}

// NewTransport creates a transport over the given reader/writer (typically process stdin/stdout)
func NewTransport(r io.Reader, w io.Writer) *Transport {
	return &Transport{
		reader:         bufio.NewReaderSize(r, 1024*1024), // 1MB buffer for large messages
		writer:         w,
		onResponse:     make(chan *Message, 64),
		onNotification: make(chan *Message, 256),
		onRequest:      make(chan *Message, 64),
		onError:        make(chan error, 8),
	}
}

// WriteMessage sends a JSON-RPC message (newline-delimited JSON)
func (t *Transport) WriteMessage(msg interface{}) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}

	// Write JSON line + newline
	data = append(data, '\n')
	_, err = t.writer.Write(data)
	if err != nil {
		return fmt.Errorf("write message: %w", err)
	}

	log.Printf("[ACP TX] %s", string(data[:len(data)-1]))
	return nil
}

// ReadLoop reads messages from the reader in a loop and dispatches them.
// This should be run in a goroutine. It stops when the reader returns EOF or an error.
func (t *Transport) ReadLoop() {
	for {
		line, err := t.reader.ReadBytes('\n')
		if err != nil {
			if err != io.EOF {
				t.onError <- fmt.Errorf("read error: %w", err)
			} else {
				t.onError <- io.EOF
			}
			return
		}

		// Skip empty lines
		if len(line) <= 1 {
			continue
		}

		log.Printf("[ACP RX] %s", string(line[:len(line)-1]))

		var msg Message
		if err := json.Unmarshal(line, &msg); err != nil {
			log.Printf("[ACP] Failed to parse message: %v (raw: %s)", err, string(line))
			continue
		}

		// Dispatch based on message type
		if msg.IsResponse() {
			select {
			case t.onResponse <- &msg:
			default:
				log.Printf("[ACP] Warning: response channel full, dropping message id=%v", msg.ID)
			}
		} else if msg.IsNotification() {
			select {
			case t.onNotification <- &msg:
			default:
				log.Printf("[ACP] Warning: notification channel full, dropping %s", msg.Method)
			}
		} else if msg.IsRequest() {
			select {
			case t.onRequest <- &msg:
			default:
				log.Printf("[ACP] Warning: request channel full, dropping %s", msg.Method)
			}
		} else {
			log.Printf("[ACP] Unknown message type: %s", string(line))
		}
	}
}

// Responses returns a channel that emits JSON-RPC responses
func (t *Transport) Responses() <-chan *Message {
	return t.onResponse
}

// Notifications returns a channel that emits JSON-RPC notifications (no id)
func (t *Transport) Notifications() <-chan *Message {
	return t.onNotification
}

// Requests returns a channel that emits JSON-RPC requests from agent to client
func (t *Transport) Requests() <-chan *Message {
	return t.onRequest
}

// Errors returns a channel that emits transport-level errors
func (t *Transport) Errors() <-chan error {
	return t.onError
}
