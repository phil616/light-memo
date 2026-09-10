package database

import (
	"database/sql"
	"memo/migrations"
	"path/filepath"
	"testing"
)

func TestMigrationsAndPragmas(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memo.db")
	db, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	db.Close()
	db, e = Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	var n int
	if e = db.QueryRow("SELECT count(*) FROM schema_migrations").Scan(&n); e != nil || n != 2 {
		t.Fatal(n, e)
	}
	var journal string
	db.QueryRow("PRAGMA journal_mode").Scan(&journal)
	if journal != "wal" {
		t.Fatal(journal)
	}
	for _, q := range []string{"PRAGMA foreign_keys", "PRAGMA busy_timeout"} {
		if e = db.QueryRow(q).Scan(&n); e != nil || n == 0 {
			t.Fatal(q, n, e)
		}
	}
}

func TestRelativeDatabasePaths(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, path := range []string{"memo.db", "./data/memo.db", "中文 空格/#memo?.db"} {
		t.Run(path, func(t *testing.T) {
			db, err := Open(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = db.Exec("INSERT INTO auth_config VALUES(1, 'test-hash', 0, 0)"); err != nil {
				t.Fatal(err)
			}
			if err = db.Close(); err != nil {
				t.Fatal(err)
			}
			db, err = Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			var hash string
			if err = db.QueryRow("SELECT password_hash FROM auth_config WHERE id=1").Scan(&hash); err != nil || hash != "test-hash" {
				t.Fatalf("reopen: %q %v", hash, err)
			}
		})
	}
}

func TestUpgradePreservesExistingMemo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.db")
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	initial, e := migrations.Files.ReadFile("001_initial.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(string(initial)); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL); INSERT INTO schema_migrations VALUES(1,0); INSERT INTO memos(title,tags,content,created_at,updated_at) VALUES('旧备忘录','[]','原文',0,0)"); e != nil {
		t.Fatal(e)
	}
	db.Close()
	db, e = Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	var content string
	if e = db.QueryRow("SELECT content FROM memos WHERE id=1").Scan(&content); e != nil || content != "原文" {
		t.Fatal(content, e)
	}
	var n int
	if e = db.QueryRow("SELECT count(*) FROM memo_templates").Scan(&n); e != nil || n != 0 {
		t.Fatal(n, e)
	}
}
