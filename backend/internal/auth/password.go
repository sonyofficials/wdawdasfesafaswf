package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters. These are the values OWASP currently recommends as a
// reasonable default for interactive login (not a batch/offline job):
// memory=19MiB, iterations=2, parallelism=1. Tuned for a relay server that
// also has to serve WebSocket traffic — not maxed out for a dedicated auth
// service. Revisit if this ever runs on hardware with a known memory budget.
const (
	argonMemory      = 19 * 1024 // KiB
	argonIterations  = 2
	argonParallelism = 1
	argonSaltLength  = 16
	argonKeyLength   = 32
)

var ErrInvalidHash = errors.New("invalid encoded hash format")
var ErrIncompatibleVersion = errors.New("incompatible argon2 version")

// HashPassword returns a self-describing encoded hash string
// ($argon2id$v=19$m=...,t=...,p=...$salt$hash) so verification never needs
// external config — the params travel with the hash, standard practice for
// argon2id so future param tuning doesn't break existing stored hashes.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLength)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonIterations, argonParallelism, b64Salt, b64Hash)

	return encoded, nil
}

// VerifyPassword checks a plaintext password against a previously stored
// encoded hash. Uses constant-time comparison to avoid timing side-channels.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, ErrInvalidHash
	}
	if parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false, ErrInvalidHash
	}
	if version != argon2.Version {
		return false, ErrIncompatibleVersion
	}

	var memory, iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHash
	}
	storedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, ErrInvalidHash
	}

	computedHash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(storedHash)))

	// constant-time compare — do not use == or bytes.Equal here, both leak
	// timing information proportional to how many leading bytes match.
	if subtle.ConstantTimeCompare(storedHash, computedHash) == 1 {
		return true, nil
	}
	return false, nil
}
