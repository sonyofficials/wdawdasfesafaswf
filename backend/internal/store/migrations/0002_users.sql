-- 0002_users.sql
--
-- User accounts. Per the product's privacy stance: no mandatory real name.
-- `email` and `phone` are mutually-optional-but-one-required (enforced at
-- the application layer, not via CHECK constraint, so partial signups via
-- future flows aren't blocked by schema rigidity) and are used only for
-- account recovery — never surfaced to other users in the UI.

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT        NOT NULL UNIQUE,
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT UNIQUE,
    phone           TEXT UNIQUE,
    password_hash   TEXT        NOT NULL, -- argon2id encoded hash, see internal/auth/password.go
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS sessions (
    token           TEXT PRIMARY KEY,       -- opaque random token, not a JWT — see internal/auth/session.go for rationale
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
