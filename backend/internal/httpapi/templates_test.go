package httpapi

import (
	"encoding/json"
	"fmt"
	"memo/internal/memo"
	"memo/internal/memotemplate"
	"testing"
)

func TestTemplateLifecycle(t *testing.T) {
	f := setup(t)
	check(t, f.request("GET", "/api/v1/templates", "", false), 401)
	input := `{"name":"每日任务100%","title":"任务：{{task_name}}","tags":["{{category}}"],"content":"今天的任务是{{task_name}}，再次{{task_name}}"}`
	w := f.request("POST", "/api/v1/templates", input, true)
	check(t, w, 201)
	var tmpl memotemplate.Template
	if e := json.Unmarshal(w.Body.Bytes(), &tmpl); e != nil {
		t.Fatal(e)
	}
	if len(tmpl.Variables) != 2 || tmpl.Version != 1 {
		t.Fatal(tmpl)
	}
	path := fmt.Sprintf("/api/v1/templates/%d", tmpl.ID)
	check(t, f.request("GET", path, "", true), 200)
	check(t, f.request("GET", "/api/v1/templates?limit=0", "", true), 400)
	check(t, f.request("POST", "/api/v1/templates", `{"name":"错误","title":"{{x","content":""}`, true), 400)
	w = f.request("GET", "/api/v1/templates?q=100%25", "", true)
	check(t, w, 200)
	var page memotemplate.Page
	json.Unmarshal(w.Body.Bytes(), &page)
	if len(page.Items) != 1 {
		t.Fatal(w.Body.String())
	}
	values := `{"version":1,"variables":{"task_name":"整理资料","category":"工作"}}`
	check(t, f.request("POST", path+"/preview", values, true), 200)
	var count int
	f.db.QueryRow("SELECT count(*) FROM memos").Scan(&count)
	if count != 0 {
		t.Fatal("preview created memo")
	}
	check(t, f.request("POST", path+"/instantiate", `{"version":1,"variables":{}}`, true), 400)
	w = f.request("POST", path+"/instantiate", values, true)
	check(t, w, 201)
	var created memo.Memo
	json.Unmarshal(w.Body.Bytes(), &created)
	if created.Title != "任务：整理资料" || created.Content != "今天的任务是整理资料，再次整理资料" {
		t.Fatal(created)
	}
	found, e := (memo.Store{DB: f.db}).List("整理资料", "工作", 30, 0)
	if e != nil || len(found.Items) != 1 {
		t.Fatal(found, e)
	}
	check(t, f.request("PUT", path, input, true), 200)
	check(t, f.request("POST", path+"/instantiate", values, true), 409)
	check(t, f.request("DELETE", path, "", true), 204)
	check(t, f.request("POST", path+"/instantiate", values, true), 404)
	w = f.request("GET", fmt.Sprintf("/api/v1/memos/%d", created.ID), "", true)
	check(t, w, 200)
	f.db.QueryRow("SELECT count(*) FROM memos").Scan(&count)
	if count != 1 {
		t.Fatal("failed instantiate changed memo count", count)
	}
}
