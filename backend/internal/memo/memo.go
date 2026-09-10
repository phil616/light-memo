package memo

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid memo")

type Input struct {
	Title   string   `json:"title"`
	Tags    []string `json:"tags"`
	Content string   `json:"content"`
}
type Memo struct {
	ID        int64    `json:"id"`
	Title     string   `json:"title"`
	Tags      []string `json:"tags"`
	Content   string   `json:"content"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}
type Page struct {
	Items      []Memo     `json:"items"`
	Pagination Pagination `json:"pagination"`
}
type Pagination struct {
	Limit   int  `json:"limit"`
	Offset  int  `json:"offset"`
	HasMore bool `json:"hasMore"`
}

// DB supports both direct access and operations inside a transaction.
type DB interface {
	Exec(string, ...any) (sql.Result, error)
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}
type Store struct{ DB DB }

func (i *Input) Validate() error {
	if !utf8.ValidString(i.Title) || utf8.RuneCountInString(i.Title) < 1 || utf8.RuneCountInString(i.Title) > 200 || strings.TrimSpace(i.Title) == "" || !utf8.ValidString(i.Content) || len(i.Content) > 128*1024 {
		return ErrInvalid
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, t := range i.Tags {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if !utf8.ValidString(t) || utf8.RuneCountInString(t) > 32 {
			return ErrInvalid
		}
		if !seen[t] {
			tags = append(tags, t)
			seen[t] = true
		}
	}
	if len(tags) > 20 {
		return ErrInvalid
	}
	i.Tags = tags
	return nil
}

const columns = "m.id,m.title,m.tags,m.content,m.created_at,m.updated_at"

func scan(row interface{ Scan(...any) error }) (Memo, error) {
	var m Memo
	var tags string
	var c, u int64
	e := row.Scan(&m.ID, &m.Title, &tags, &m.Content, &c, &u)
	if e != nil {
		return m, e
	}
	e = json.Unmarshal([]byte(tags), &m.Tags)
	m.CreatedAt = time.UnixMilli(c).UTC().Format(time.RFC3339Nano)
	m.UpdatedAt = time.UnixMilli(u).UTC().Format(time.RFC3339Nano)
	return m, e
}
func (s Store) Get(id int64) (Memo, error) {
	return scan(s.DB.QueryRow("SELECT "+columns+" FROM memos m WHERE m.id=?", id))
}
func (s Store) Save(id int64, i Input) (Memo, error) {
	if e := i.Validate(); e != nil {
		return Memo{}, e
	}
	tags, _ := json.Marshal(i.Tags)
	now := time.Now().UnixMilli()
	var e error
	if id == 0 {
		var r sql.Result
		r, e = s.DB.Exec("INSERT INTO memos(title,tags,content,created_at,updated_at) VALUES(?,?,?,?,?)", i.Title, string(tags), i.Content, now, now)
		if e == nil {
			id, e = r.LastInsertId()
		}
	} else {
		var r sql.Result
		r, e = s.DB.Exec("UPDATE memos SET title=?,tags=?,content=?,updated_at=? WHERE id=?", i.Title, string(tags), i.Content, now, id)
		if e == nil {
			n, _ := r.RowsAffected()
			if n == 0 {
				e = sql.ErrNoRows
			}
		}
	}
	if e != nil {
		return Memo{}, e
	}
	return s.Get(id)
}
func (s Store) Delete(id int64) error {
	r, e := s.DB.Exec("DELETE FROM memos WHERE id=?", id)
	if e != nil {
		return e
	}
	n, e := r.RowsAffected()
	if e == nil && n == 0 {
		return sql.ErrNoRows
	}
	return e
}
func (s Store) List(q, tag string, limit, offset int) (Page, error) {
	p := Page{Items: []Memo{}, Pagination: Pagination{limit, offset, false}}
	from := " FROM memos m"
	where := []string{"1=1"}
	args := []any{}
	order := "m.updated_at DESC,m.id DESC"
	if q != "" {
		if utf8.RuneCountInString(q) >= 3 {
			from = " FROM memos_fts JOIN memos m ON m.id=memos_fts.rowid"
			where = append(where, "memos_fts MATCH ?")
			args = append(args, `"`+strings.ReplaceAll(q, `"`, `""`)+`"`)
			order = "bm25(memos_fts,6.0,3.0,1.0)," + order
		} else {
			like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
			where = append(where, `(m.title LIKE ? ESCAPE '\' OR m.tags LIKE ? ESCAPE '\' OR m.content LIKE ? ESCAPE '\')`)
			args = append(args, like, like, like)
		}
	}
	if tag != "" {
		where = append(where, "EXISTS(SELECT 1 FROM json_each(m.tags) WHERE value=?)")
		args = append(args, tag)
	}
	args = append(args, limit+1, offset)
	rows, e := s.DB.Query("SELECT "+columns+from+" WHERE "+strings.Join(where, " AND ")+" ORDER BY "+order+" LIMIT ? OFFSET ?", args...)
	if e != nil {
		return p, e
	}
	defer rows.Close()
	for rows.Next() {
		m, e := scan(rows)
		if e != nil {
			return p, e
		}
		p.Items = append(p.Items, m)
	}
	if e = rows.Err(); e != nil {
		return p, e
	}
	if len(p.Items) > limit {
		p.Items = p.Items[:limit]
		p.Pagination.HasMore = true
	}
	return p, nil
}

type Tag struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (s Store) Tags() ([]Tag, error) {
	rows, e := s.DB.Query("SELECT j.value,count(*) FROM memos m,json_each(m.tags) j GROUP BY j.value ORDER BY count(*) DESC,j.value ASC")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	tags := []Tag{}
	for rows.Next() {
		var t Tag
		if e = rows.Scan(&t.Name, &t.Count); e != nil {
			return nil, e
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}
func ID(s string) (int64, error) {
	var id int64
	_, e := fmt.Sscan(s, &id)
	if e != nil || id < 1 || fmt.Sprint(id) != s {
		return 0, ErrInvalid
	}
	return id, nil
}
