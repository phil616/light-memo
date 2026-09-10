package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"io"
	"log/slog"
	"memo/internal/auth"
	"memo/internal/memo"
	"memo/internal/session"
	"mime"
	"net/http"
	"strconv"
	"sync"
	"time"
	"unicode/utf8"
)

type API struct {
	DB         *sql.DB
	Now        func() time.Time
	mu         sync.Mutex
	attempts   []time.Time
	passwordMu sync.Mutex
}
type sessionKey struct{}

func New(db *sql.DB) http.Handler {
	a := &API{DB: db, Now: time.Now}
	return a.Handler()
}
func (a *API) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(a.recoverer)
	r.Use(a.headers)
	r.Use(cors.Handler(cors.Options{AllowOriginFunc: func(_ *http.Request, _ string) bool { return true }, AllowedMethods: []string{"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"*"}, AllowCredentials: true, MaxAge: 300}))
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
			next.ServeHTTP(w, r)
		})
	})
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "NOT_FOUND", "Not found.") })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { fail(w, 405, "INVALID_REQUEST", "Method not allowed.") })
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if e := a.DB.PingContext(r.Context()); e != nil {
			fail(w, 503, "INTERNAL_ERROR", "Service unavailable.")
			return
		}
		write(w, 200, map[string]string{"status": "ok"})
	})
	r.Route("/api/v1", func(r chi.Router) {
		r.With(a.csrf).Post("/auth/login", a.login)
		r.Group(func(r chi.Router) {
			r.Use(a.authenticate)
			r.Use(a.csrf)
			r.Get("/auth/session", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]bool{"authenticated": true}) })
			r.Post("/auth/session", a.renew)
			r.Post("/auth/logout", a.logout)
			r.Put("/auth/password", a.password)
			r.Get("/templates", a.listTemplates)
			r.Post("/templates", a.saveTemplate)
			r.Get("/templates/{id}", a.getTemplate)
			r.Put("/templates/{id}", a.saveTemplate)
			r.Delete("/templates/{id}", a.deleteTemplate)
			r.Post("/templates/{id}/preview", a.previewTemplate)
			r.Post("/templates/{id}/instantiate", a.instantiateTemplate)
			r.Get("/memos", a.list)
			r.Post("/memos", a.save)
			r.Get("/memos/{id}", a.get)
			r.Put("/memos/{id}", a.save)
			r.Delete("/memos/{id}", a.delete)
			r.Get("/tags", func(w http.ResponseWriter, r *http.Request) {
				tags, e := (memo.Store{DB: a.DB}).Tags()
				if e != nil {
					internal(w)
					return
				}
				write(w, 200, map[string]any{"items": tags})
			})
		})
	})
	return r
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if status != 204 {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func fail(w http.ResponseWriter, status int, code, message string) {
	write(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
func internal(w http.ResponseWriter) { fail(w, 500, "INTERNAL_ERROR", "Internal server error.") }
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	raw, e := io.ReadAll(r.Body)
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if e == nil {
		if !utf8.Valid(raw) {
			e = errors.New("invalid UTF-8")
		} else {
			e = d.Decode(v)
		}
	}
	if e == nil {
		var extra any
		if d.Decode(&extra) != io.EOF {
			e = errors.New("trailing JSON")
		}
	}
	if e != nil {
		var size *http.MaxBytesError
		if errors.As(e, &size) {
			fail(w, 413, "CONTENT_TOO_LARGE", "Request body too large.")
		} else {
			fail(w, 400, "INVALID_REQUEST", "Invalid JSON request.")
		}
		return false
	}
	return true
}
func (a *API) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		defer func() {
			if recover() != nil {
				internal(ww)
			}
			slog.Info("request", "request_id", middleware.GetReqID(r.Context()), "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "duration", time.Since(start).String())
		}()
		next.ServeHTTP(ww, r)
	})
}
func (a *API) headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func (a *API) csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "DELETE" {
			media, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if r.Header.Get("X-Memo-CSRF") != "1" || e != nil || media != "application/json" {
				fail(w, 403, "FORBIDDEN", "Forbidden.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func (a *API) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, e := r.Cookie(session.CookieName)
		if e != nil {
			fail(w, 401, "UNAUTHORIZED", "Authentication required.")
			return
		}
		valid, _, e := (session.Store{DB: a.DB}).Valid(c.Value, a.Now())
		if e != nil {
			internal(w)
			return
		}
		if !valid {
			fail(w, 401, "UNAUTHORIZED", "Authentication required.")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, c.Value)))
	})
}
func (a *API) login(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	now := a.Now()
	cut := 0
	for cut < len(a.attempts) && !a.attempts[cut].After(now.Add(-time.Minute)) {
		cut++
	}
	a.attempts = a.attempts[cut:]
	if len(a.attempts) >= 10 {
		a.mu.Unlock()
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "RATE_LIMITED", "Too many requests.")
		return
	}
	a.attempts = append(a.attempts, now)
	a.mu.Unlock()
	var in struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	a.passwordMu.Lock()
	defer a.passwordMu.Unlock()
	var hash string
	e := a.DB.QueryRow("SELECT password_hash FROM auth_config WHERE id=1").Scan(&hash)
	if e != nil && e != sql.ErrNoRows {
		internal(w)
		return
	}
	if e != nil || !auth.Verify(hash, in.Password) {
		fail(w, 401, "INVALID_PASSWORD", "Invalid password")
		return
	}
	token, e := (session.Store{DB: a.DB}).Create(now)
	if e != nil {
		internal(w)
		return
	}
	session.SetCookie(w, token, now)
	write(w, 204, nil)
}
func token(r *http.Request) string { return r.Context().Value(sessionKey{}).(string) }
func (a *API) renew(w http.ResponseWriter, r *http.Request) {
	s := session.Store{DB: a.DB}
	now := a.Now()
	valid, due, e := s.Valid(token(r), now)
	if e != nil {
		internal(w)
		return
	}
	if !valid {
		fail(w, 401, "UNAUTHORIZED", "Authentication required.")
		return
	}
	if due {
		if e = s.Renew(token(r), now); e != nil {
			internal(w)
			return
		}
		session.SetCookie(w, token(r), now)
	}
	write(w, 204, nil)
}
func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if _, e := a.DB.Exec("DELETE FROM sessions WHERE token_hash=?", session.Digest(token(r))); e != nil {
		internal(w)
		return
	}
	session.ClearCookie(w)
	write(w, 204, nil)
}
func (a *API) password(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.NewPassword == "" || len(in.NewPassword) > 4096 {
		fail(w, 400, "INVALID_REQUEST", "Password must contain 1–4096 bytes.")
		return
	}
	a.passwordMu.Lock()
	defer a.passwordMu.Unlock()
	var old string
	if e := a.DB.QueryRow("SELECT password_hash FROM auth_config WHERE id=1").Scan(&old); e != nil {
		internal(w)
		return
	}
	if !auth.Verify(old, in.CurrentPassword) {
		fail(w, 401, "INVALID_PASSWORD", "Invalid password")
		return
	}
	hash, e := auth.Hash(in.NewPassword)
	if e != nil {
		internal(w)
		return
	}
	tx, e := a.DB.BeginTx(r.Context(), nil)
	if e != nil {
		internal(w)
		return
	}
	defer tx.Rollback()
	_, e = tx.Exec("UPDATE auth_config SET password_hash=?,updated_at=? WHERE id=1", hash, a.Now().UnixMilli())
	if e == nil {
		_, e = tx.Exec("DELETE FROM sessions")
	}
	if e == nil {
		e = tx.Commit()
	}
	if e != nil {
		internal(w)
		return
	}
	session.ClearCookie(w)
	write(w, 204, nil)
}
func (a *API) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, offset := 30, 0
	var e error
	if q.Has("limit") {
		limit, e = strconv.Atoi(q.Get("limit"))
	}
	if e == nil && q.Has("offset") {
		offset, e = strconv.Atoi(q.Get("offset"))
	}
	if e != nil || limit < 1 || limit > 100 || offset < 0 || offset > 2147483647 || !utf8.ValidString(q.Get("q")) || utf8.RuneCountInString(q.Get("q")) > 200 || utf8.RuneCountInString(q.Get("tag")) > 32 {
		fail(w, 400, "INVALID_REQUEST", "Invalid search or pagination.")
		return
	}
	p, e := (memo.Store{DB: a.DB}).List(q.Get("q"), q.Get("tag"), limit, offset)
	if e != nil {
		internal(w)
		return
	}
	write(w, 200, p)
}
func requestID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, e := memo.ID(chi.URLParam(r, "id"))
	if e != nil {
		fail(w, 400, "INVALID_REQUEST", "Invalid memo ID.")
		return 0, false
	}
	return id, true
}
func resultError(w http.ResponseWriter, e error) {
	if errors.Is(e, sql.ErrNoRows) {
		fail(w, 404, "NOT_FOUND", "Memo not found.")
	} else if errors.Is(e, memo.ErrInvalid) {
		fail(w, 400, "INVALID_REQUEST", "Invalid memo fields.")
	} else {
		internal(w)
	}
}
func (a *API) get(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	m, e := (memo.Store{DB: a.DB}).Get(id)
	if e != nil {
		resultError(w, e)
		return
	}
	write(w, 200, m)
}
func (a *API) save(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == "PUT" {
		var ok bool
		id, ok = requestID(w, r)
		if !ok {
			return
		}
	}
	var in memo.Input
	if !decode(w, r, &in) {
		return
	}
	if len(in.Content) > 128*1024 {
		fail(w, 413, "CONTENT_TOO_LARGE", "Content exceeds 128 KiB.")
		return
	}
	m, e := (memo.Store{DB: a.DB}).Save(id, in)
	if e != nil {
		resultError(w, e)
		return
	}
	status := 200
	if id == 0 {
		status = 201
	}
	write(w, status, m)
}
func (a *API) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	if e := (memo.Store{DB: a.DB}).Delete(id); e != nil {
		resultError(w, e)
		return
	}
	write(w, 204, nil)
}
