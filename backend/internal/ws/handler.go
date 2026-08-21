package ws

import (
	"context"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Dev-mode: allow any origin. Production must pin this to the real
	// frontend origin(s) before going live — see README "Next" / hardening.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// TokenValidator is the minimal interface the ws package needs from
// internal/auth, kept here (rather than importing auth.SessionStore
// directly) so this package only depends on the one method it actually
// calls. Satisfied by *auth.SessionStore's Validate method without either
// package needing to import the other's full type.
type TokenValidator interface {
	Validate(ctx context.Context, token string) (int64, error)
}

// NewHandler returns an http.HandlerFunc that upgrades to a WebSocket
// connection after validating a session token, and registers the client
// with the given hub using the *server-verified* userID — not a client-
// supplied query param. This closes the gap flagged in the README: a
// connecting client can no longer claim to be any userId it likes.
func NewHandler(hub *Hub, sessions TokenValidator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "missing token query param", http.StatusUnauthorized)
			return
		}

		userID, err := sessions.Validate(r.Context(), token)
		if err != nil {
			http.Error(w, "invalid or expired session", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade failed: %v", err)
			return
		}

		client := NewClient(strconv.FormatInt(userID, 10), conn, hub)
		hub.Register(client)
		client.ReadLoop() // blocks until disconnect
	}
}
