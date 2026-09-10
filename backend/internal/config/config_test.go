package config

import "testing"

func TestLegacyOriginDoesNotRestrictStartup(t *testing.T) {
	for _, origin := range []string{"", "*", "https://old.example.com", "invalid"} {
		t.Setenv("MEMO_FRONTEND_ORIGIN", origin)
		t.Setenv("MEMO_DATABASE_PATH", "custom.db")
		t.Setenv("MEMO_LISTEN_ADDR", "127.0.0.1:9999")
		c, e := Load()
		if e != nil || c.DatabasePath != "custom.db" || c.ListenAddr != "127.0.0.1:9999" {
			t.Fatal(c, e)
		}
	}
}
