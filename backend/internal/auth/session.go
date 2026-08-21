package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionTTL controls how long an issued token stays valid without re-login.
const SessionTTL = 30 * 24 * time.Hour

// Sessions are deliberately opaque random tokens looked up against Postgres
// on every request, not JWTs. Trade-off, stated plainly: this costs one DB
// round-trip per authenticated request that a self-contained JWT would
// avoid. In exchange: a compromised or logged-out session is revocable
// instantly (DELETE the row) — a JWT is valid until its expiry no matter
// what the server wants, unless you bolt on a revocation blacklist, at
// which point you've rebuilt this table anyway. For a messenger whose
// entire pitch is "scrictly private," instant revocation wins that trade.
type SessionStore struct {
	pool *pgxpool.Pool
}

func NewSessionStore(pool *pgxpool.Pool) *SessionStore {
	return &SessionStore{pool: pool}
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Create issues a new session token for a user and persists it.
func (s *SessionStore) Create(ctx context.Context, userID int64) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO sessions (token, user_id, expires_at)
		VALUES ($1, $2, $3)
	`, token, userID, time.Now().Add(SessionTTL))
	if err != nil {
		return "", fmt.Errorf("storing session: %w", err)
	}

	return token, nil
}

// Validate returns the userID for a token if it exists and hasn't expired.
func (s *SessionStore) Validate(ctx context.Context, token string) (int64, error) {
	var userID int64
	var expiresAt time.Time

	err := s.pool.QueryRow(ctx, `
		SELECT user_id, expires_at FROM sessions WHERE token = $1
	`, token).Scan(&userID, &expiresAt)
	if err != nil {
		return 0, fmt.Errorf("session lookup: %w", err)
	}

	if time.Now().After(expiresAt) {
		return 0, fmt.Errorf("session expired")
	}

	return userID, nil
}

// Revoke deletes a session — used on logout. Instant, unlike JWT expiry.
func (s *SessionStore) Revoke(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	if err != nil {
		return fmt.Errorf("revoking session: %w", err)
	}
	return nil
}

// CleanupExpired deletes sessions past their expiry — same TTL-sweep
// pattern as the pending_envelopes queue cleanup.
func (s *SessionStore) CleanupExpired(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	if err != nil {
		return 0, fmt.Errorf("cleanup: %w", err)
	}
	return tag.RowsAffected(), nil
}
