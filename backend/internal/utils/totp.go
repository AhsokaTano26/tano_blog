package utils

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math/rand"
	"net/url"
	"strings"
	"time"
)

// GenerateTOTPSecret generates a new TOTP secret and QR code URL
func GenerateTOTPSecret(username string) (secret string, qrURL string, err error) {
	// Generate a random 160-bit key
	key := make([]byte, 20)
	for i := range key {
		key[i] = byte(rand.Intn(256))
	}
	secret = base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(key)

	issuer := "TanoBlog"
	qrURL = fmt.Sprintf("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		url.PathEscape(issuer),
		url.PathEscape(username),
		secret,
		url.PathEscape(issuer),
	)

	return secret, qrURL, nil
}

// VerifyTOTP verifies a TOTP code against the secret
func VerifyTOTP(secret, code string) bool {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return false
	}

	// Check current and adjacent time windows (allow 1 step skew)
	now := time.Now()
	for i := -1; i <= 1; i++ {
		t := now.Add(time.Duration(i) * 30 * time.Second)
		expected := generateTOTPCode(key, t)
		if expected == code {
			return true
		}
	}
	return false
}

func generateTOTPCode(key []byte, t time.Time) string {
	counter := uint64(t.Unix()) / 30
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	offset := sum[19] & 0x0f
	truncated := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	code := truncated % 1000000

	return fmt.Sprintf("%06d", code)
}
