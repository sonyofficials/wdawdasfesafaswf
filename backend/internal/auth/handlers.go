package auth

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

type Handlers struct {
	users    *UserStore
	sessions *SessionStore
}

func NewHandlers(users *UserStore, sessions *SessionStore) *Handlers {
	return &Handlers{users: users, sessions: sessions}
}

type registerRequest struct {
	Username  string `json:"username"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Password  string `json:"password"`
}

type authResponse struct {
	Token    string `json:"token"`
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handlers) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed JSON body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Phone = strings.TrimSpace(req.Phone)

	if !usernameRe.MatchString(req.Username) {
		writeError(w, http.StatusBadRequest, "username must be 3-32 chars, letters/digits/underscore only")
		return
	}
	if req.Email == "" && req.Phone == "" {
		writeError(w, http.StatusBadRequest, "email or phone required")
		return
	}
	if req.Email != "" && req.Phone != "" {
		writeError(w, http.StatusBadRequest, "provide email OR phone, not both")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	user, err := h.users.Register(r.Context(), RegisterInput{
		Username: req.Username, FirstName: req.FirstName, LastName: req.LastName,
		Email: req.Email, Phone: req.Phone, Password: req.Password,
	})
	if err != nil {
		switch {
		case errors.Is(err, ErrUsernameTaken):
			writeError(w, http.StatusConflict, "username already taken")
		case errors.Is(err, ErrContactTaken):
			writeError(w, http.StatusConflict, "email or phone already registered")
		default:
			log.Printf("register error: %v", err)
			writeError(w, http.StatusInternalServerError, "registration failed")
		}
		return
	}

	token, err := h.sessions.Create(r.Context(), user.ID)
	if err != nil {
		log.Printf("session create error: %v", err)
		writeError(w, http.StatusInternalServerError, "registered but session creation failed, try logging in")
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{Token: token, UserID: user.ID, Username: user.Username})
}

type loginRequest struct {
	Identifier string `json:"identifier"` // username, email, or phone
	Password   string `json:"password"`
}

func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "malformed JSON body")
		return
	}

	req.Identifier = strings.TrimSpace(req.Identifier)
	if req.Identifier == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "identifier and password required")
		return
	}

	user, err := h.users.FindByLogin(r.Context(), req.Identifier)
	if err != nil {
		// Deliberately identical error for "no such user" and "wrong
		// password" below — do not leak which one it was, that's a
		// username-enumeration side channel.
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	valid, err := VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !valid {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.sessions.Create(r.Context(), user.ID)
	if err != nil {
		log.Printf("session create error: %v", err)
		writeError(w, http.StatusInternalServerError, "login failed")
		return
	}

	writeJSON(w, http.StatusOK, authResponse{Token: token, UserID: user.ID, Username: user.Username})
}

func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}

	authHeader := r.Header.Get("Authorization")
	token := strings.TrimPrefix(authHeader, "Bearer ")
	if token == "" {
		writeError(w, http.StatusBadRequest, "missing bearer token")
		return
	}

	if err := h.sessions.Revoke(r.Context(), token); err != nil {
		log.Printf("logout revoke error: %v", err)
		// still return success — token not existing is an acceptable logout outcome
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
