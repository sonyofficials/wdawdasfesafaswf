package ws

import (
	"context"
	"log"
	"sync"

	"github.com/gorilla/websocket"

	"secure-messenger/internal/store"
)

// Hub owns the set of connected clients and routes envelopes between them.
// It never inspects ciphertext content — routing is by userId only.
// Offline recipients get their envelope persisted via queue instead of dropped.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // userId -> client
	queue   *store.Queue
}

func NewHub(queue *store.Queue) *Hub {
	return &Hub{clients: make(map[string]*Client), queue: queue}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c.UserID] = c
	h.mu.Unlock()
	log.Printf("client connected: %s", c.UserID)

	h.flushPending(c)
}

// flushPending delivers any envelopes that queued up while this user was
// offline. Runs right after registration so nothing sent to a disconnected
// user is lost — it just arrives late, on the recipient's next connect.
func (h *Hub) flushPending(c *Client) {
	if h.queue == nil {
		return
	}
	pending, err := h.queue.Flush(context.Background(), c.UserID)
	if err != nil {
		log.Printf("flush pending for %s failed: %v", c.UserID, err)
		return
	}
	if len(pending) == 0 {
		return
	}
	log.Printf("delivering %d queued envelope(s) to %s", len(pending), c.UserID)
	for _, p := range pending {
		env := Envelope{
			Type:            p.EnvelopeType,
			ChatID:          p.ChatID,
			From:            p.FromUserID,
			To:              p.ToUserID,
			Ciphertext:      p.Ciphertext,
			Nonce:           p.Nonce,
			SenderPublicKey: p.SenderPublicKey,
			Ts:              p.ClientTs,
		}
		if err := c.conn.WriteJSON(env); err != nil {
			log.Printf("write error delivering queued envelope to %s: %v", c.UserID, err)
			return
		}
	}
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if existing, ok := h.clients[c.UserID]; ok && existing == c {
		delete(h.clients, c.UserID)
	}
	log.Printf("client disconnected: %s (total: %d)", c.UserID, len(h.clients))
}

// Route delivers an envelope to its `To` recipient if currently connected.
// If offline, persists it to the pending-envelope queue for delivery on
// next connect instead of dropping it.
func (h *Hub) Route(env Envelope) {
	h.mu.RLock()
	recipient, ok := h.clients[env.To]
	h.mu.RUnlock()

	if !ok {
		h.enqueueOffline(env)
		return
	}

	if err := recipient.conn.WriteJSON(env); err != nil {
		log.Printf("write error to %s: %v", env.To, err)
	}
}

func (h *Hub) enqueueOffline(env Envelope) {
	if h.queue == nil {
		log.Printf("route miss: recipient %s offline, no queue configured, dropping %s envelope for chat %s", env.To, env.Type, env.ChatID)
		return
	}
	err := h.queue.Enqueue(context.Background(), store.PendingEnvelope{
		ToUserID:        env.To,
		FromUserID:      env.From,
		ChatID:          env.ChatID,
		EnvelopeType:    env.Type,
		Ciphertext:      env.Ciphertext,
		Nonce:           env.Nonce,
		SenderPublicKey: env.SenderPublicKey,
		ClientTs:        env.Ts,
	})
	if err != nil {
		log.Printf("enqueue failed for offline recipient %s: %v", env.To, err)
		return
	}
	log.Printf("route miss: recipient %s offline, queued %s envelope for chat %s", env.To, env.Type, env.ChatID)
}

// Client wraps a single websocket connection.
type Client struct {
	UserID string
	conn   *websocket.Conn
	hub    *Hub
	send   chan Envelope
}

func NewClient(userID string, conn *websocket.Conn, hub *Hub) *Client {
	return &Client{
		UserID: userID,
		conn:   conn,
		hub:    hub,
		send:   make(chan Envelope, 32),
	}
}

// ReadLoop blocks reading envelopes from this client and routing them.
// Call in its own goroutine; returns when the connection closes.
func (c *Client) ReadLoop() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	for {
		var env Envelope
		if err := c.conn.ReadJSON(&env); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("unexpected close for %s: %v", c.UserID, err)
			}
			return
		}
		// server-side stamp, don't trust client clock for ordering-sensitive logic later
		env.From = c.UserID
		c.hub.Route(env)
	}
}
