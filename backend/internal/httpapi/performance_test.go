package httpapi

import (
	"fmt"
	"memo/internal/memo"
	"sort"
	"testing"
	"time"
)

func TestSearchTenThousandMemos(t *testing.T) {
	if testing.Short() {
		t.Skip("10,000-row performance sample")
	}
	f := setup(t)
	tx, e := f.db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	stmt, e := tx.Prepare("INSERT INTO memos(title,tags,content,created_at,updated_at) VALUES(?,?,?,?,?)")
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 10000; i++ {
		_, e = stmt.Exec(fmt.Sprintf("Memo %d Cloudflare", i), `["Go","PKI"]`, fmt.Sprintf("Authenticated Origin Pulls 中文备忘录 sample %d", i), i, i)
		if e != nil {
			t.Fatal(e)
		}
	}
	stmt.Close()
	if e = tx.Commit(); e != nil {
		t.Fatal(e)
	}
	s := memo.Store{DB: f.db}
	queries := []string{"Origin", "中文备", "Cloudflare", "备", "Go", "sample 951"}
	durations := make([]time.Duration, 0, 60)
	for i := 0; i < 66; i++ {
		start := time.Now()
		_, e := s.List(queries[i%len(queries)], "", 30, 0)
		if e != nil {
			t.Fatal(e)
		}
		if i >= 6 {
			durations = append(durations, time.Since(start))
		}
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	t.Logf("10,000 memos, 60 warm search samples: P95=%s", durations[56])
}
