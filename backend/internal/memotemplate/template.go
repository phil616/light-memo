package memotemplate

import (
	"database/sql"
	"encoding/json"
	"errors"
	"memo/internal/memo"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid template")
var ErrSyntax = errors.New("invalid template expression")
var ErrValues = errors.New("invalid template variables")
var ErrOutput = errors.New("invalid generated memo")
var ErrChanged = errors.New("template version changed")

type Input struct {
	Name    string   `json:"name"`
	Title   string   `json:"title"`
	Tags    []string `json:"tags"`
	Content string   `json:"content"`
}
type Template struct {
	ID int64 `json:"id"`
	Input
	Variables []string `json:"variables"`
	Version   int64    `json:"version"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}
type Page struct {
	Items      []Template      `json:"items"`
	Pagination memo.Pagination `json:"pagination"`
}
type Values struct {
	Version   int64             `json:"version"`
	Variables map[string]string `json:"variables"`
}
type Store struct{ DB *sql.DB }

// Expressions are literal variable references, never executable code.
func visit(text string, variable func(string) (string, error)) (string, error) {
	var out strings.Builder
	for len(text) > 0 {
		start := strings.Index(text, "{{")
		end := strings.Index(text, "}}")
		if start < 0 {
			if end >= 0 {
				return "", ErrSyntax
			}
			out.WriteString(text)
			break
		}
		if end >= 0 && end < start {
			return "", ErrSyntax
		}
		out.WriteString(text[:start])
		rest := text[start+2:]
		close := strings.Index(rest, "}}")
		if close < 0 {
			return "", ErrSyntax
		}
		name := strings.TrimSpace(rest[:close])
		if !validName(name) {
			return "", ErrSyntax
		}
		value, e := variable(name)
		if e != nil {
			return "", e
		}
		out.WriteString(value)
		// The result is bounded as it is built, before repeated large values can exhaust memory.
		if out.Len() > 128*1024 {
			return "", ErrOutput
		}
		text = rest[close+2:]
	}
	if out.Len() > 128*1024 {
		return "", ErrOutput
	}
	return out.String(), nil
}
func validName(name string) bool {
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 64 {
		return false
	}
	for i, r := range name {
		if r != '_' && !unicode.IsLetter(r) && !(i > 0 && unicode.IsNumber(r)) {
			return false
		}
	}
	return true
}
func Variables(i Input) ([]string, error) {
	names := []string{}
	seen := map[string]bool{}
	fields := append([]string{i.Title}, i.Tags...)
	fields = append(fields, i.Content)
	for _, field := range fields {
		_, e := visit(field, func(name string) (string, error) {
			if !seen[name] {
				seen[name] = true
				names = append(names, name)
			}
			if len(names) > 50 {
				return "", ErrSyntax
			}
			return "", nil
		})
		if e != nil {
			return nil, e
		}
	}
	return names, nil
}
func (i *Input) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if !utf8.ValidString(i.Name) || utf8.RuneCountInString(i.Name) < 1 || utf8.RuneCountInString(i.Name) > 100 {
		return ErrInvalid
	}
	m := memo.Input{Title: i.Title, Tags: i.Tags, Content: i.Content}
	if e := m.Validate(); e != nil {
		return ErrInvalid
	}
	i.Tags = m.Tags
	_, e := Variables(*i)
	return e
}
func Render(t Template, v Values) (memo.Input, error) {
	if v.Version != t.Version {
		return memo.Input{}, ErrChanged
	}
	names, e := Variables(t.Input)
	if e != nil {
		return memo.Input{}, e
	}
	if len(v.Variables) != len(names) {
		return memo.Input{}, ErrValues
	}
	for _, name := range names {
		value, ok := v.Variables[name]
		if !ok || !utf8.ValidString(value) || len(value) > 128*1024 {
			return memo.Input{}, ErrValues
		}
	}
	replace := func(text string) (string, error) {
		return visit(text, func(name string) (string, error) { return v.Variables[name], nil })
	}
	m := memo.Input{Tags: []string{}}
	m.Title, e = replace(t.Title)
	if e != nil {
		return m, e
	}
	m.Content, e = replace(t.Content)
	if e != nil {
		return m, e
	}
	for _, tag := range t.Tags {
		value, e := replace(tag)
		if e != nil {
			return m, e
		}
		m.Tags = append(m.Tags, value)
	}
	if e = m.Validate(); e != nil {
		return m, ErrOutput
	}
	return m, nil
}

const columns = "id,name,title,tags,content,version,created_at,updated_at"

func scan(row interface{ Scan(...any) error }) (Template, error) {
	var t Template
	var tags string
	var c, u int64
	e := row.Scan(&t.ID, &t.Name, &t.Title, &tags, &t.Content, &t.Version, &c, &u)
	if e != nil {
		return t, e
	}
	if e = json.Unmarshal([]byte(tags), &t.Tags); e != nil {
		return t, e
	}
	t.Variables, e = Variables(t.Input)
	t.CreatedAt = time.UnixMilli(c).UTC().Format(time.RFC3339Nano)
	t.UpdatedAt = time.UnixMilli(u).UTC().Format(time.RFC3339Nano)
	return t, e
}
func (s Store) Get(id int64) (Template, error) {
	return scan(s.DB.QueryRow("SELECT "+columns+" FROM memo_templates WHERE id=?", id))
}
func (s Store) Save(id int64, i Input) (Template, error) {
	if e := i.Validate(); e != nil {
		return Template{}, e
	}
	tags, _ := json.Marshal(i.Tags)
	now := time.Now().UnixMilli()
	var result sql.Result
	var e error
	if id == 0 {
		result, e = s.DB.Exec("INSERT INTO memo_templates(name,title,tags,content,created_at,updated_at) VALUES(?,?,?,?,?,?)", i.Name, i.Title, string(tags), i.Content, now, now)
		if e == nil {
			id, e = result.LastInsertId()
		}
	} else {
		result, e = s.DB.Exec("UPDATE memo_templates SET name=?,title=?,tags=?,content=?,version=version+1,updated_at=? WHERE id=?", i.Name, i.Title, string(tags), i.Content, now, id)
		if e == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				e = sql.ErrNoRows
			}
		}
	}
	if e != nil {
		return Template{}, e
	}
	return s.Get(id)
}
func (s Store) Delete(id int64) error {
	r, e := s.DB.Exec("DELETE FROM memo_templates WHERE id=?", id)
	if e != nil {
		return e
	}
	n, e := r.RowsAffected()
	if e == nil && n == 0 {
		return sql.ErrNoRows
	}
	return e
}
func (s Store) List(q string, limit, offset int) (Page, error) {
	p := Page{Items: []Template{}, Pagination: memo.Pagination{Limit: limit, Offset: offset}}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
	rows, e := s.DB.Query("SELECT "+columns+` FROM memo_templates WHERE name LIKE ? ESCAPE '\' OR title LIKE ? ESCAPE '\' OR content LIKE ? ESCAPE '\' ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`, pattern, pattern, pattern, limit+1, offset)
	if e != nil {
		return p, e
	}
	defer rows.Close()
	for rows.Next() {
		t, e := scan(rows)
		if e != nil {
			return p, e
		}
		p.Items = append(p.Items, t)
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
func (s Store) Instantiate(id int64, v Values) (memo.Memo, error) {
	tx, e := s.DB.Begin()
	if e != nil {
		return memo.Memo{}, e
	}
	defer tx.Rollback()
	t, e := scan(tx.QueryRow("SELECT "+columns+" FROM memo_templates WHERE id=?", id))
	if e != nil {
		return memo.Memo{}, e
	}
	input, e := Render(t, v)
	if e != nil {
		return memo.Memo{}, e
	}
	created, e := (memo.Store{DB: tx}).Save(0, input)
	if e != nil {
		return created, e
	}
	e = tx.Commit()
	return created, e
}
