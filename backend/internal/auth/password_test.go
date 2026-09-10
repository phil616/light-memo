package auth

import "testing"

func TestPassword(t *testing.T) {
	a, e := Hash("中文 password")
	if e != nil {
		t.Fatal(e)
	}
	b, _ := Hash("中文 password")
	if a == b || !Verify(a, "中文 password") || Verify(a, "wrong") {
		t.Fatal("hash/verify failure")
	}
	for _, bad := range []string{"", "plaintext", "$argon2id$v=19$m=999999999,t=1,p=1$x$x"} {
		if Verify(bad, "x") {
			t.Fatal(bad)
		}
	}
}
