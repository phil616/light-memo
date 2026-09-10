package session

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"net/http"
	"time"
)

const CookieName = "__Host-memo_session"
const Lifetime = 30 * 24 * time.Hour
const RenewWindow = 7 * 24 * time.Hour

type Store struct{ DB *sql.DB }

func Digest(token string) []byte { h := sha256.Sum256([]byte(token)); return h[:] }
func (s Store) Create(now time.Time) (string, error) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	_, e := s.DB.Exec("INSERT INTO sessions(token_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?)", Digest(token), now.UnixMilli(), now.UnixMilli(), now.Add(Lifetime).UnixMilli())
	return token, e
}
func (s Store) Valid(token string, now time.Time) (bool, bool, error) {
	b, e := base64.RawURLEncoding.DecodeString(token)
	if e != nil || len(b) != 32 {
		return false, false, nil
	}
	var expiry int64
	e = s.DB.QueryRow("SELECT expires_at FROM sessions WHERE token_hash=?", Digest(token)).Scan(&expiry)
	if e == sql.ErrNoRows {
		return false, false, nil
	}
	if e != nil {
		return false, false, e
	}
	return expiry > now.UnixMilli(), expiry < now.Add(RenewWindow).UnixMilli(), nil
}
func (s Store) Renew(token string, now time.Time) error {
	_, e := s.DB.Exec("UPDATE sessions SET expires_at=?,last_seen_at=? WHERE token_hash=? AND expires_at>?", now.Add(Lifetime).UnixMilli(), now.UnixMilli(), Digest(token), now.UnixMilli())
	return e
}
func SetCookie(w http.ResponseWriter, token string, now time.Time) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: token, Path: "/", MaxAge: int(Lifetime.Seconds()), Expires: now.Add(Lifetime), Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode})
}
func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Path: "/", MaxAge: -1, Expires: time.Unix(1, 0), Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode})
}
