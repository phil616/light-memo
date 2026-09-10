package app

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestServeRequiresInitialization(t *testing.T) {
	t.Setenv("MEMO_DATABASE_PATH", filepath.Join(t.TempDir(), "memo.db"))
	t.Setenv("MEMO_FRONTEND_ORIGIN", "http://localhost:5173")
	e := Run([]string{"serve"})
	if e == nil || !strings.Contains(e.Error(), `Run "memo-api init" first.`) {
		t.Fatal(e)
	}
}
func TestCommandValidation(t *testing.T) {
	for _, args := range [][]string{nil, {"other"}, {"serve", "password"}} {
		if Run(args) == nil {
			t.Fatal(args)
		}
	}
}
