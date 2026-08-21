package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"secure-messenger/internal/auth"
	"secure-messenger/internal/store"
	"secure-messenger/internal/ws"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()

	pool, err := store.Open(ctx)
	if err != nil {
		log.Fatalf("postgres connection failed: %v", err)
	}
	defer pool.Close()

	if err := store.Migrate(ctx, pool); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	log.Println("migrations applied")

	queue := store.NewQueue(pool)
	hub := ws.NewHub(queue)

	userStore := auth.NewUserStore(pool)
	sessionStore := auth.NewSessionStore(pool)
	authHandlers := auth.NewHandlers(userStore, sessionStore)

	// TTL sweep: drop anything queued for more than 30 days — an abandoned
	// account shouldn't grow the table forever. Runs once on start too so a
	// long-stopped dev server doesn't accumulate silently.
	go func() {
		const maxAge = 30 * 24 * time.Hour
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for {
			n, err := queue.CleanupOlderThan(ctx, maxAge)
			if err != nil {
				log.Printf("cleanup sweep failed: %v", err)
			} else if n > 0 {
				log.Printf("cleanup sweep: removed %d expired queued envelope(s)", n)
			}

			sn, err := sessionStore.CleanupExpired(ctx)
			if err != nil {
				log.Printf("session cleanup failed: %v", err)
			} else if sn > 0 {
				log.Printf("cleanup sweep: removed %d expired session(s)", sn)
			}

			<-ticker.C
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", ws.NewHandler(hub, sessionStore))
	mux.HandleFunc("/api/auth/register", authHandlers.Register)
	mux.HandleFunc("/api/auth/login", authHandlers.Login)
	mux.HandleFunc("/api/auth/logout", authHandlers.Logout)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	log.Printf("relay listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
