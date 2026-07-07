package utils

import (
	"crypto/rand"
	"encoding/base64"

	"golang.org/x/crypto/bcrypt"
)

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func RandomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func ParseUserAgent(ua string) (browser, os, device string) {
	browser, os, device = "Unknown", "Unknown", "desktop"
	if ua == "" {
		return
	}
	// Basic UA parsing - simplified
	if contains(ua, "Mobile") || contains(ua, "Android") {
		device = "mobile"
	} else if contains(ua, "iPad") || contains(ua, "Tablet") {
		device = "tablet"
	}
	if contains(ua, "Chrome") && !contains(ua, "Edg") {
		browser = "Chrome"
	} else if contains(ua, "Firefox") {
		browser = "Firefox"
	} else if contains(ua, "Safari") && !contains(ua, "Chrome") {
		browser = "Safari"
	} else if contains(ua, "Edg") {
		browser = "Edge"
	}
	if contains(ua, "Windows") {
		os = "Windows"
	} else if contains(ua, "Mac OS") || contains(ua, "macOS") {
		os = "macOS"
	} else if contains(ua, "Linux") {
		os = "Linux"
	} else if contains(ua, "Android") {
		os = "Android"
	} else if contains(ua, "iOS") || contains(ua, "iPhone") {
		os = "iOS"
	}
	return
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
