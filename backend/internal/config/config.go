package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server        ServerConfig
	Database      DatabaseConfig
	JWT           JWTConfig
	Upload        UploadConfig
	BackupDir     string
	AdminPassword string
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
	Secret              string
	Expiration          time.Duration
	RememberMeExpiration time.Duration
}

type UploadConfig struct {
	Dir   string
	MaxMB int64
}

func Load() *Config {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable is required")
	}
	dbDSN := os.Getenv("DB_DSN")
	if dbDSN == "" {
		log.Fatal("FATAL: DB_DSN environment variable is required")
	}
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		log.Fatal("FATAL: ADMIN_PASSWORD environment variable is required")
	}

	return &Config{
		Server: ServerConfig{
			Port:         getEnv("SERVER_PORT", "8080"),
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
		},
		Database: DatabaseConfig{
			DSN: dbDSN,
		},
		JWT: JWTConfig{
			Secret:              jwtSecret,
			Expiration:          2 * time.Hour,
			RememberMeExpiration: 7 * 24 * time.Hour,
		},
		Upload: UploadConfig{
			Dir:   getEnv("UPLOAD_DIR", "./uploads"),
			MaxMB: getEnvInt64("UPLOAD_MAX_MB", 10),
		},
		BackupDir:     getEnv("BACKUP_DIR", "./backups"),
		AdminPassword: adminPassword,
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
