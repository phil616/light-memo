package httpapi

import (
	"database/sql"
	"errors"
	"memo/internal/memotemplate"
	"net/http"
	"strconv"
	"unicode/utf8"
)

func templateError(w http.ResponseWriter, e error) {
	switch {
	case errors.Is(e, sql.ErrNoRows):
		fail(w, 404, "TEMPLATE_NOT_FOUND", "Template not found.")
	case errors.Is(e, memotemplate.ErrSyntax):
		fail(w, 400, "TEMPLATE_SYNTAX", "Invalid variable syntax.")
	case errors.Is(e, memotemplate.ErrInvalid):
		fail(w, 400, "INVALID_TEMPLATE", "Invalid template fields.")
	case errors.Is(e, memotemplate.ErrValues):
		fail(w, 400, "TEMPLATE_VARIABLES", "Missing or unknown variables.")
	case errors.Is(e, memotemplate.ErrChanged):
		fail(w, 409, "TEMPLATE_CHANGED", "Template changed. Reload before using it.")
	case errors.Is(e, memotemplate.ErrOutput):
		fail(w, 400, "TEMPLATE_OUTPUT", "Generated memo exceeds field limits.")
	default:
		internal(w)
	}
}
func (a *API) listTemplates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, offset := 30, 0
	var e error
	if q.Has("limit") {
		limit, e = strconv.Atoi(q.Get("limit"))
	}
	if e == nil && q.Has("offset") {
		offset, e = strconv.Atoi(q.Get("offset"))
	}
	if e != nil || limit < 1 || limit > 100 || offset < 0 || offset > 2147483647 || !utf8.ValidString(q.Get("q")) || utf8.RuneCountInString(q.Get("q")) > 200 {
		fail(w, 400, "INVALID_REQUEST", "Invalid pagination or query.")
		return
	}
	page, e := (memotemplate.Store{DB: a.DB}).List(q.Get("q"), limit, offset)
	if e != nil {
		templateError(w, e)
		return
	}
	write(w, 200, page)
}
func (a *API) getTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	t, e := (memotemplate.Store{DB: a.DB}).Get(id)
	if e != nil {
		templateError(w, e)
		return
	}
	write(w, 200, t)
}
func (a *API) saveTemplate(w http.ResponseWriter, r *http.Request) {
	var id int64
	if r.Method == "PUT" {
		var ok bool
		id, ok = requestID(w, r)
		if !ok {
			return
		}
	}
	var in memotemplate.Input
	if !decode(w, r, &in) {
		return
	}
	t, e := (memotemplate.Store{DB: a.DB}).Save(id, in)
	if e != nil {
		templateError(w, e)
		return
	}
	status := 200
	if id == 0 {
		status = 201
	}
	write(w, status, t)
}
func (a *API) deleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	if e := (memotemplate.Store{DB: a.DB}).Delete(id); e != nil {
		templateError(w, e)
		return
	}
	write(w, 204, nil)
}
func (a *API) previewTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	var in memotemplate.Values
	if !decode(w, r, &in) {
		return
	}
	t, e := (memotemplate.Store{DB: a.DB}).Get(id)
	if e != nil {
		templateError(w, e)
		return
	}
	rendered, e := memotemplate.Render(t, in)
	if e != nil {
		templateError(w, e)
		return
	}
	write(w, 200, rendered)
}
func (a *API) instantiateTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(w, r)
	if !ok {
		return
	}
	var in memotemplate.Values
	if !decode(w, r, &in) {
		return
	}
	created, e := (memotemplate.Store{DB: a.DB}).Instantiate(id, in)
	if e != nil {
		templateError(w, e)
		return
	}
	write(w, 201, created)
}
