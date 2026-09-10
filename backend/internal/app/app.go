package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"golang.org/x/term"
	"log/slog"
	"memo/internal/auth"
	"memo/internal/config"
	"memo/internal/database"
	"memo/internal/httpapi"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func Run(args []string) error {
	if len(args) != 1 || (args[0] != "init" && args[0] != "serve") {
		return errors.New("usage: memo-api init|serve")
	}
	c, e := config.Load()
	if e != nil {
		return e
	}
	db, e := database.Open(c.DatabasePath)
	if e != nil {
		return fmt.Errorf("open database: %w", e)
	}
	defer db.Close()
	if args[0] == "init" {
		return initialize(db)
	}
	var hash string
	if e = db.QueryRow("SELECT password_hash FROM auth_config WHERE id=1").Scan(&hash); e == sql.ErrNoRows {
		return errors.New(`Run "memo-api init" first.`)
	} else if e != nil {
		return e
	}
	srv := &http.Server{Addr: c.ListenAddr, Handler: httpapi.New(db), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errCh := make(chan error, 1)
	go func() { slog.Info("listening", "address", c.ListenAddr); errCh <- srv.ListenAndServe() }()
	select {
	case e = <-errCh:
		if !errors.Is(e, http.ErrServerClosed) {
			return e
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if e = srv.Shutdown(shutdown); e != nil {
			_ = srv.Close()
			return e
		}
	}
	return nil
}
func initialize(db *sql.DB) error {
	var count int
	if e := db.QueryRow("SELECT count(*) FROM auth_config").Scan(&count); e != nil {
		return e
	}
	if count != 0 {
		return errors.New("password already initialized; refusing to overwrite")
	}
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return errors.New("password initialization requires an interactive terminal")
	}
	fmt.Fprint(os.Stderr, "Password: ")
	p, e := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if e != nil {
		return e
	}
	defer clear(p)
	fmt.Fprint(os.Stderr, "Confirm password: ")
	confirm, e := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if e != nil {
		return e
	}
	defer clear(confirm)
	if len(p) == 0 || len(p) > 4096 || string(p) != string(confirm) {
		return errors.New("passwords must match and contain 1–4096 bytes")
	}
	hash, e := auth.Hash(string(p))
	if e != nil {
		return e
	}
	now := time.Now().UnixMilli()
	_, e = db.Exec("INSERT INTO auth_config(id,password_hash,created_at,updated_at) VALUES(1,?,?,?)", hash, now, now)
	if e == nil {
		fmt.Fprintln(os.Stderr, "Password initialized.")
	}
	return e
}
