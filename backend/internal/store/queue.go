package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PendingEnvelope mirrors the wire Envelope type but with DB-assigned id.
// Kept independent from ws.Envelope to avoid an import cycle between
// internal/store and internal/ws — the handler translates between them.
type PendingEnvelope struct {
	ID              int64  `db:"id"`
	ToUserID        string `db:"to_user_id"`
	FromUserID      string `db:"from_user_id"`
	ChatID          string `db:"chat_id"`
	EnvelopeType    string `db:"envelope_type"`
	Ciphertext      string `db:"ciphertext"`
	Nonce           string `db:"nonce"`
	SenderPublicKey string `db:"sender_pub_key"`
	ClientTs        int64  `db:"client_ts"`
}

type Queue struct {
	pool *pgxpool.Pool
}

func NewQueue(pool *pgxpool.Pool) *Queue {
	return &Queue{pool: pool}
}

// Enqueue stores an envelope for a recipient who is not currently connected.
// Called from Hub.Route on a routing miss instead of silently dropping.
func (q *Queue) Enqueue(ctx context.Context, e PendingEnvelope) error {
	_, err := q.pool.Exec(ctx, `
		INSERT INTO pending_envelopes
			(to_user_id, from_user_id, chat_id, envelope_type, ciphertext, nonce, sender_pub_key, client_ts)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, e.ToUserID, e.FromUserID, e.ChatID, e.EnvelopeType, e.Ciphertext, e.Nonce, e.SenderPublicKey, e.ClientTs)
	if err != nil {
		return fmt.Errorf("enqueue: %w", err)
	}
	return nil
}

// Flush returns all queued envelopes for a user, oldest first, and deletes
// them from the queue in the same transaction — at-most-once delivery from
// the queue's perspective (if the client drops mid-flush, undelivered
// messages are lost; upgrading to at-least-once with client ack is a
// documented next step, not built here).
func (q *Queue) Flush(ctx context.Context, userID string) ([]PendingEnvelope, error) {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("flush begin: %w", err)
	}
	defer tx.Rollback(ctx) // no-op if committed

	rows, err := tx.Query(ctx, `
		SELECT id, to_user_id, from_user_id, chat_id, envelope_type, ciphertext, nonce, sender_pub_key, client_ts
		FROM pending_envelopes
		WHERE to_user_id = $1
		ORDER BY created_at ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("flush query: %w", err)
	}

	results, err := pgx.CollectRows(rows, pgx.RowToStructByName[PendingEnvelope])
	if err != nil {
		return nil, fmt.Errorf("flush scan: %w", err)
	}

	if len(results) > 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM pending_envelopes WHERE to_user_id = $1`, userID); err != nil {
			return nil, fmt.Errorf("flush delete: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("flush commit: %w", err)
	}

	return results, nil
}

// CleanupOlderThan deletes queued envelopes past the given age. Intended to
// run on a periodic ticker (see cmd/server/main.go) so undelivered messages
// for permanently-abandoned accounts don't grow the table forever.
func (q *Queue) CleanupOlderThan(ctx context.Context, maxAge time.Duration) (int64, error) {
	cutoff := time.Now().Add(-maxAge)
	tag, err := q.pool.Exec(ctx, `DELETE FROM pending_envelopes WHERE created_at < $1`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("cleanup: %w", err)
	}
	return tag.RowsAffected(), nil
}
