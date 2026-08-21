-- 0001_pending_envelopes.sql
--
-- Store-and-forward queue for offline recipients. The server stores only
-- what already crosses the wire in plaintext form on this relay: ciphertext
-- + nonce + routing metadata. It never gains visibility into message
-- content by adding this table — same E2EE guarantee, just delayed
-- delivery instead of drop-on-offline.

CREATE TABLE IF NOT EXISTS pending_envelopes (
    id              BIGSERIAL PRIMARY KEY,
    to_user_id      TEXT        NOT NULL,
    from_user_id    TEXT        NOT NULL,
    chat_id         TEXT        NOT NULL,
    envelope_type   TEXT        NOT NULL,
    ciphertext      TEXT,
    nonce           TEXT,
    sender_pub_key  TEXT,
    client_ts       BIGINT      NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access pattern: "give me everything queued for this user, oldest first"
CREATE INDEX IF NOT EXISTS idx_pending_envelopes_to_user
    ON pending_envelopes (to_user_id, created_at);

-- TTL sweep pattern: "delete anything older than N days" — run periodically,
-- see internal/store/cleanup.go. Index supports the WHERE created_at < $1 scan.
CREATE INDEX IF NOT EXISTS idx_pending_envelopes_created_at
    ON pending_envelopes (created_at);
