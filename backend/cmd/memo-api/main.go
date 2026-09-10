package main

import (
	"log/slog"
	"memo/internal/app"
	"os"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))
	if e := app.Run(os.Args[1:]); e != nil {
		slog.Error(e.Error())
		os.Exit(1)
	}
}
