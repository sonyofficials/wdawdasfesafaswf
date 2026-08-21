package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUsernameTaken = errors.New("username already taken")
var ErrContactTaken = errors.New("email or phone already registered")
var ErrUserNotFound = errors.New("user not found")

type User struct {
	ID           int64   `db:"id"`
	Username     string  `db:"username"`
	FirstName    *string `db:"first_name"`
	LastName     *string `db:"last_name"`
	Email        *string `db:"email"`
	Phone        *string `db:"phone"`
	PasswordHash string  `db:"password_hash"`
}

type RegisterInput struct {
	Username  string
	FirstName string // optional, empty string stored as NULL
	LastName  string // optional, empty string stored as NULL
	Email     string // one of Email/Phone required, enforced by handler
	Phone     string
	Password  string
}

type UserStore struct {
	pool *pgxpool.Pool
}

func NewUserStore(pool *pgxpool.Pool) *UserStore {
	return &UserStore{pool: pool}
}

// Register hashes the password and inserts a new user row. Returns
// ErrUsernameTaken / ErrContactTaken on unique constraint violations so the
// handler can give a specific, actionable error instead of a generic 500.
func (u *UserStore) Register(ctx context.Context, in RegisterInput) (*User, error) {
	hash, err := HashPassword(in.Password)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	var firstName, lastName, email, phone *string
	if in.FirstName != "" {
		firstName = &in.FirstName
	}
	if in.LastName != "" {
		lastName = &in.LastName
	}
	if in.Email != "" {
		email = &in.Email
	}
	if in.Phone != "" {
		phone = &in.Phone
	}

	var id int64
	err = u.pool.QueryRow(ctx, `
		INSERT INTO users (username, first_name, last_name, email, phone, password_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, in.Username, firstName, lastName, email, phone, hash).Scan(&id)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			if pgErr.ConstraintName == "users_username_key" {
				return nil, ErrUsernameTaken
			}
			return nil, ErrContactTaken
		}
		return nil, fmt.Errorf("inserting user: %w", err)
	}

	return &User{
		ID: id, Username: in.Username, FirstName: firstName, LastName: lastName,
		Email: email, Phone: phone, PasswordHash: hash,
	}, nil
}

// FindByLogin looks a user up by username, email, or phone — whichever the
// login form's single "identifier" field turns out to match. Matches the
// UI: one input field, three possible meanings.
func (u *UserStore) FindByLogin(ctx context.Context, identifier string) (*User, error) {
	row := u.pool.QueryRow(ctx, `
		SELECT id, username, first_name, last_name, email, phone, password_hash
		FROM users
		WHERE username = $1 OR email = $1 OR phone = $1
	`, identifier)

	var user User
	err := row.Scan(&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.Email, &user.Phone, &user.PasswordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("querying user: %w", err)
	}

	return &user, nil
}
