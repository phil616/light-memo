package config

import "os"

type Config struct{ ListenAddr, DatabasePath string }

func Load() (Config, error) {
	return Config{value("MEMO_LISTEN_ADDR", "127.0.0.1:8080"), value("MEMO_DATABASE_PATH", "memo.db")}, nil
}
func value(k, d string) string {
	if s := os.Getenv(k); s != "" {
		return s
	}
	return d
}
