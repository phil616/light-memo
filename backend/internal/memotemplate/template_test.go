package memotemplate

import (
	"errors"
	"strings"
	"testing"
)

func TestVariablesAndLiteralRendering(t *testing.T) {
	input := Input{Name: "每日任务", Title: "{{ 任务 }}", Tags: []string{"{{category}}", "工作"}, Content: "今天是{{任务}}，再次{{任务}}，{{__proto__}}"}
	if e := input.Validate(); e != nil {
		t.Fatal(e)
	}
	names, e := Variables(input)
	if e != nil || strings.Join(names, ",") != "任务,category,__proto__" {
		t.Fatal(names, e)
	}
	m, e := Render(Template{Input: input, Version: 1}, Values{Version: 1, Variables: map[string]string{"任务": "{{literal}} $& <script>", "category": " 工作 ", "__proto__": "正常"}})
	if e != nil || m.Title != "{{literal}} $& <script>" || len(m.Tags) != 1 || !strings.Contains(m.Content, "再次{{literal}} $& <script>") {
		t.Fatal(m, e)
	}
}
func TestInvalidExpressions(t *testing.T) {
	for _, text := range []string{"{{}}", "{{x}", "x}}", "{{a.b}}", "{{1name}}", "{{a {{b}}}}", "{{a-b}}", "{{" + strings.Repeat("a", 65) + "}}"} {
		t.Run(text, func(t *testing.T) {
			_, e := Variables(Input{Title: text})
			if !errors.Is(e, ErrSyntax) {
				t.Fatal(e)
			}
		})
	}
}
func TestRenderValidation(t *testing.T) {
	tmpl := Template{Input: Input{Title: "{{x}}", Content: "{{x}}{{x}}"}, Version: 2}
	for _, c := range []struct {
		name string
		v    Values
		want error
	}{
		{"stale", Values{Version: 1}, ErrChanged},
		{"missing", Values{Version: 2}, ErrValues},
		{"wrong key", Values{Version: 2, Variables: map[string]string{"y": "ok"}}, ErrValues},
		{"extra", Values{Version: 2, Variables: map[string]string{"x": "ok", "y": "extra"}}, ErrValues},
		{"empty title", Values{Version: 2, Variables: map[string]string{"x": ""}}, ErrOutput},
		{"long title", Values{Version: 2, Variables: map[string]string{"x": strings.Repeat("中", 201)}}, ErrOutput},
		{"expansion limit", Values{Version: 2, Variables: map[string]string{"x": strings.Repeat("x", 70000)}}, ErrOutput},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, e := Render(tmpl, c.v)
			if !errors.Is(e, c.want) {
				t.Fatal(e)
			}
		})
	}
	if _, e := Render(Template{Input: Input{Title: "固定", Content: "{{x}}"}, Version: 1}, Values{Version: 1, Variables: map[string]string{"x": ""}}); e != nil {
		t.Fatal(e)
	}
}
