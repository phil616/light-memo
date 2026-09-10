package database

import (
	"database/sql"
	"fmt"
	"memo/migrations"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func Open(path string) (*sql.DB, error) {
	// file: URIs require an absolute path; relative URL paths can become an authority.
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve database path: %w", err)
	}
	path = absolutePath
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	u := url.URL{Scheme: "file", Path: path}
	q := u.Query()
	for _, p := range []string{"journal_mode(WAL)", "synchronous(NORMAL)", "foreign_keys(ON)", "busy_timeout(5000)"} {
		q.Add("_pragma", p)
	}
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)
	if err = db.Ping(); err == nil {
		err = migrate(db)
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
func migrate(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	files, err := migrations.Files.ReadDir(".")
	if err != nil {
		return err
	}
	for _, f := range files {
		if !strings.HasSuffix(f.Name(), ".sql") {
			continue
		}
		v, err := strconv.Atoi(strings.Split(f.Name(), "_")[0])
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		var count int
		if err = tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=?", v).Scan(&count); err != nil {
			tx.Rollback()
			return err
		}
		if count > 0 {
			tx.Rollback()
			continue
		}
		b, err := migrations.Files.ReadFile(f.Name())
		if err == nil {
			_, err = tx.Exec(string(b))
		}
		if err == nil {
			_, err = tx.Exec("INSERT INTO schema_migrations VALUES(?,?)", v, time.Now().UnixMilli())
		}
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", v, err)
		}
		if err = tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
