package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Upload   UploadConfig
}

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	DSN string
}

type JWTConfig struct {
	Secret     string
	Expiration time.Duration
}

type UploadConfig struct {
	Dir   string
	MaxMB int64
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnv("SERVER_PORT", "8080"),
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
		},
		Database: DatabaseConfig{
			DSN: getEnv("DB_DSN", "host=localhost user=tano password=tano_blog_pass dbname=tano_blog port=5432 sslmode=disable"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "change-me-in-production"),
			Expiration: 24 * time.Hour,
		},
		Upload: UploadConfig{
			Dir:   getEnv("UPLOAD_DIR", "./uploads"),
			MaxMB: getEnvInt64("UPLOAD_MAX_MB", 10),
		},
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return fallback
}
