package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"golang.org/x/crypto/argon2"
	"strings"
)

func Hash(password string) (string, error) {
	salt := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return "", e
	}
	key := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	b := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=2$%s$%s", b.EncodeToString(salt), b.EncodeToString(key)), nil
}
func Verify(encoded, password string) bool {
	p := strings.Split(encoded, "$")
	if len(p) != 6 || p[1] != "argon2id" || p[2] != "v=19" {
		return false
	}
	var m, t uint32
	var lanes uint8
	if _, e := fmt.Sscanf(p[3], "m=%d,t=%d,p=%d", &m, &t, &lanes); e != nil || m < 8*uint32(lanes) || m > 262144 || t < 1 || t > 10 || lanes < 1 || lanes > 16 {
		return false
	}
	salt, e := base64.RawStdEncoding.DecodeString(p[4])
	if e != nil || len(salt) < 8 {
		return false
	}
	hash, e := base64.RawStdEncoding.DecodeString(p[5])
	if e != nil || len(hash) != 32 {
		return false
	}
	key := argon2.IDKey([]byte(password), salt, t, m, lanes, 32)
	return subtle.ConstantTimeCompare(hash, key) == 1
}
