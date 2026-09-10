package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"memo/internal/auth"
	"memo/internal/database"
	"memo/internal/memo"
	"memo/internal/session"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const origin = "https://memo.example.com"

type fixture struct {
	a       *API
	handler http.Handler
	db      *sql.DB
	cookie  *http.Cookie
}

func setup(t *testing.T) *fixture {
	t.Helper()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	db, e := database.Open(filepath.Join(t.TempDir(), "memo.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	hash, e := auth.Hash("test-password")
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec("INSERT INTO auth_config VALUES(1,?,?,?)", hash, 0, 0)
	if e != nil {
		t.Fatal(e)
	}
	a := &API{DB: db, Now: time.Now}
	f := &fixture{a: a, handler: a.Handler(), db: db}
	token, e := (session.Store{DB: db}).Create(a.Now())
	if e != nil {
		t.Fatal(e)
	}
	f.cookie = &http.Cookie{Name: session.CookieName, Value: token}
	return f
}
func (f *fixture) request(method, path, body string, authenticated bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Origin", origin)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Memo-CSRF", "1")
	if authenticated {
		r.AddCookie(f.cookie)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}
func check(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d want %d: %s", w.Code, status, w.Body.String())
	}
}
func TestMemoCRUDSearch(t *testing.T) {
	f := setup(t)
	input := memo.Input{Title: "Cloudflare TLS", Tags: []string{" PKI ", "Go", "PKI", ""}, Content: "Authenticated Origin Pulls\r\n中文备忘录 🦊✨🚀\n100% _ quote \"literal\""}
	b, _ := json.Marshal(input)
	w := f.request("POST", "/api/v1/memos", string(b), true)
	check(t, w, 201)
	var m memo.Memo
	json.Unmarshal(w.Body.Bytes(), &m)
	if len(m.Tags) != 2 || m.Content != input.Content {
		t.Fatal(m)
	}
	path := fmt.Sprintf("/api/v1/memos/%d", m.ID)
	check(t, f.request("GET", path, "", true), 200)
	for _, q := range []string{"Cloud", "PKI", "Origin", "gin Pul", "中", "中文", "文备忘", "🦊✨🚀", "%", "_", "\"literal\""} {
		t.Run(q, func(t *testing.T) {
			p, e := (memo.Store{DB: f.db}).List(q, "", 30, 0)
			if e != nil || len(p.Items) != 1 {
				t.Fatalf("%q: %+v %v", q, p, e)
			}
		})
	}
	for _, q := range []string{"absent", "\" OR cloud", "NOT", "*"} {
		p, e := (memo.Store{DB: f.db}).List(q, "", 30, 0)
		if e != nil || len(p.Items) != 0 {
			t.Fatalf("literal %q: %+v %v", q, p, e)
		}
	}
	p, e := (memo.Store{DB: f.db}).List("", "Go", 1, 0)
	if e != nil || len(p.Items) != 1 {
		t.Fatal(p, e)
	}
	p, e = (memo.Store{DB: f.db}).List("", "G", 1, 0)
	if e != nil || len(p.Items) != 0 {
		t.Fatal(p, e)
	}
	check(t, f.request("PUT", path, `{"title":"Updated","tags":["Only"],"content":"new body"}`, true), 200)
	p, e = (memo.Store{DB: f.db}).List("Origin", "", 30, 0)
	if e != nil || len(p.Items) != 0 {
		t.Fatal(p, e)
	}
	p, e = (memo.Store{DB: f.db}).List("new body", "", 30, 0)
	if e != nil || len(p.Items) != 1 {
		t.Fatal(p, e)
	}
	check(t, f.request("DELETE", path, "{}", true), 204)
	check(t, f.request("GET", path, "", true), 404)
	p, e = (memo.Store{DB: f.db}).List("new body", "", 30, 0)
	if e != nil || len(p.Items) != 0 {
		t.Fatal(p, e)
	}
}
func TestPaginationTagsValidation(t *testing.T) {
	f := setup(t)
	for i := 0; i < 3; i++ {
		_, e := (memo.Store{DB: f.db}).Save(0, memo.Input{Title: fmt.Sprint(i), Tags: []string{"Go"}, Content: "x"})
		if e != nil {
			t.Fatal(e)
		}
	}
	p, e := (memo.Store{DB: f.db}).List("", "", 2, 0)
	if e != nil || len(p.Items) != 2 || !p.Pagination.HasMore {
		t.Fatal(p, e)
	}
	last, e := (memo.Store{DB: f.db}).List("", "", 2, 2)
	if e != nil || len(last.Items) != 1 || last.Pagination.HasMore || last.Items[0].ID == p.Items[0].ID {
		t.Fatal(last, e)
	}
	tags, e := (memo.Store{DB: f.db}).Tags()
	if e != nil || len(tags) != 1 || tags[0].Count != 3 {
		t.Fatal(tags, e)
	}
	for _, path := range []string{"/memos?limit=0", "/memos?limit=101", "/memos?offset=-1", "/memos?limit=x", "/memos/no", "/memos/0"} {
		check(t, f.request("GET", "/api/v1"+path, "", true), 400)
	}
	for _, body := range []string{`{}`, `null`, `{"title":""}`, `{"title":"x","unknown":1}`, `{"title":"x"} {}`, `{"title":42}`, `{"title":"x","tags":["` + strings.Repeat("中", 33) + `"]}`} {
		check(t, f.request("POST", "/api/v1/memos", body, true), 400)
	}
	b, _ := json.Marshal(memo.Input{Title: strings.Repeat("中", 200), Content: strings.Repeat("a", 128*1024)})
	check(t, f.request("POST", "/api/v1/memos", string(b), true), 201)
	b, _ = json.Marshal(memo.Input{Title: "x", Content: strings.Repeat("a", 128*1024+1)})
	check(t, f.request("POST", "/api/v1/memos", string(b), true), 413)
	check(t, f.request("POST", "/api/v1/memos", `{"title":"`+strings.Repeat("a", 256*1024)+`"}`, true), 413)
}
func TestAuthentication(t *testing.T) {
	f := setup(t)
	wrong := f.request("POST", "/api/v1/auth/login", `{"password":"wrong"}`, false)
	check(t, wrong, 401)
	if !strings.Contains(wrong.Body.String(), `"INVALID_PASSWORD"`) {
		t.Fatal(wrong.Body.String())
	}
	w := f.request("POST", "/api/v1/auth/login", `{"password":"test-password"}`, false)
	check(t, w, 204)
	cs := w.Result().Cookies()
	if len(cs) != 1 {
		t.Fatal(cs)
	}
	c := cs[0]
	if !c.Secure || !c.HttpOnly || c.Domain != "" || c.Path != "/" || c.SameSite != http.SameSiteStrictMode || c.MaxAge != 2592000 {
		t.Fatal(c)
	}
	f.cookie = c
	var stored []byte
	f.db.QueryRow("SELECT token_hash FROM sessions WHERE token_hash=?", session.Digest(c.Value)).Scan(&stored)
	if bytes.Equal(stored, []byte(c.Value)) || len(stored) != 32 {
		t.Fatal("raw token stored")
	}
	check(t, f.request("GET", "/api/v1/auth/session", "", true), 200)
	f.a.Now = func() time.Time { return time.Now().Add(25 * 24 * time.Hour) }
	var before int64
	f.db.QueryRow("SELECT expires_at FROM sessions WHERE token_hash=?", stored).Scan(&before)
	check(t, f.request("GET", "/api/v1/auth/session", "", true), 200)
	var after int64
	f.db.QueryRow("SELECT expires_at FROM sessions WHERE token_hash=?", stored).Scan(&after)
	if before != after {
		t.Fatal("GET mutated session")
	}
	w = f.request("POST", "/api/v1/auth/session", "{}", true)
	check(t, w, 204)
	if len(w.Result().Cookies()) != 1 {
		t.Fatal("missing renewal")
	}
	f.db.QueryRow("SELECT expires_at FROM sessions WHERE token_hash=?", stored).Scan(&after)
	if after <= before {
		t.Fatal("did not slide")
	}
	f.a.Now = func() time.Time { return time.Now().Add(56 * 24 * time.Hour) }
	check(t, f.request("GET", "/api/v1/auth/session", "", true), 401)
	f.a.Now = time.Now
	check(t, f.request("POST", "/api/v1/auth/logout", "{}", true), 204)
	check(t, f.request("GET", "/api/v1/auth/session", "", true), 401)
}
func TestPasswordChangeAndLimiter(t *testing.T) {
	f := setup(t)
	check(t, f.request("PUT", "/api/v1/auth/password", `{"currentPassword":"test-password","newPassword":"changed"}`, true), 204)
	var count int
	f.db.QueryRow("SELECT count(*) FROM sessions").Scan(&count)
	if count != 0 {
		t.Fatal(count)
	}
	check(t, f.request("POST", "/api/v1/auth/login", `{"password":"changed"}`, false), 204)
	for i := 0; i < 9; i++ {
		check(t, f.request("POST", "/api/v1/auth/login", `{"password":"wrong"}`, false), 401)
	}
	check(t, f.request("POST", "/api/v1/auth/login", `{"password":"changed"}`, false), 429)
	f.a.Now = func() time.Time { return time.Now().Add(time.Minute + time.Second) }
	check(t, f.request("POST", "/api/v1/auth/login", `{"password":"changed"}`, false), 204)
}
func TestSecurity(t *testing.T) {
	f := setup(t)
	check(t, f.request("GET", "/api/v1/memos", "", false), 401)
	for _, change := range []func(*http.Request){func(r *http.Request) { r.Header.Del("X-Memo-CSRF") }, func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }} {
		r := httptest.NewRequest("POST", "/api/v1/memos", strings.NewReader(`{"title":"x"}`))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Memo-CSRF", "1")
		r.AddCookie(f.cookie)
		change(r)
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		check(t, w, 403)
	}
	for _, o := range []string{origin, "https://evil.example.com"} {
		r := httptest.NewRequest("OPTIONS", "/api/v1/memos", nil)
		r.Header.Set("Origin", o)
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", "Content-Type,X-Memo-CSRF")
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		if w.Header().Get("Access-Control-Allow-Origin") != o || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Fatal(w.Header())
		}
	}
	w := f.request("GET", "/api/v1/memos", "", true)
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(w.Header())
	}
}

func TestWildcardCredentialedCORS(t *testing.T) {
	f := setup(t)
	for _, origin := range []string{"https://another.example.org", "http://192.168.1.2:5173", "null"} {
		for _, method := range []string{"OPTIONS", "GET", "POST"} {
			path := "/api/v1/auth/session"
			r := httptest.NewRequest(method, path, strings.NewReader("{}"))
			r.AddCookie(f.cookie)
			r.Header.Set("Origin", origin)
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("X-Memo-CSRF", "1")
			if method == "OPTIONS" {
				r.Header.Set("Access-Control-Request-Method", "POST")
				r.Header.Set("Access-Control-Request-Headers", "Content-Type,X-Memo-CSRF")
			}
			w := httptest.NewRecorder()
			f.handler.ServeHTTP(w, r)
			if w.Code < 200 || w.Code >= 300 {
				t.Fatalf("%s: %d %s", method, w.Code, w.Body.String())
			}
			if w.Header().Get("Access-Control-Allow-Origin") != origin || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
				t.Fatal(w.Header())
			}
			if !strings.Contains(strings.Join(w.Header().Values("Vary"), ","), "Origin") {
				t.Fatal("missing Vary: Origin")
			}
		}
	}
	for _, header := range []string{"X-Memo-CSRF", "Content-Type"} {
		r := httptest.NewRequest("POST", "/api/v1/auth/session", strings.NewReader("{}"))
		r.AddCookie(f.cookie)
		r.Header.Set("Origin", "https://any.example.org")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Memo-CSRF", "1")
		r.Header.Del(header)
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		check(t, w, 403)
	}
}

func TestUnrestrictedCORSErrorsAndHeaders(t *testing.T) {
	f := setup(t)
	for _, c := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/api/v1/auth/session", "", 401},
		{"POST", "/api/v1/auth/login", `{"password":"wrong"}`, 401},
		{"GET", "/missing", "", 404},
	} {
		r := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
		r.Header.Set("Origin", "https://arbitrary.example.net")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Memo-CSRF", "1")
		w := httptest.NewRecorder()
		f.handler.ServeHTTP(w, r)
		check(t, w, c.status)
		if w.Header().Get("Access-Control-Allow-Origin") != "https://arbitrary.example.net" || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Fatal(w.Header())
		}
	}
	r := httptest.NewRequest("OPTIONS", "/api/v1/auth/login", nil)
	r.Header.Set("Origin", "https://any.example.org")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "X-Custom-Header,Content-Type,X-Memo-CSRF")
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code < 200 || w.Code >= 300 || !strings.Contains(w.Header().Get("Access-Control-Allow-Headers"), "X-Custom-Header") {
		t.Fatal(w.Code, w.Header())
	}
	r = httptest.NewRequest("POST", "/api/v1/auth/session", strings.NewReader("{}"))
	r.AddCookie(f.cookie)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Memo-CSRF", "1")
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	check(t, w, 204)
}
