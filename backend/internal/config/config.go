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
	Secret     string
	Expiration time.Duration
}

type UploadConfig struct {
	Dir   string
	MaxMB int64
}

func Load() *Config {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Println("WARNING: JWT_SECRET not set, using insecure default. Set JWT_SECRET in production!")
		jwtSecret = "change-me-in-production"
	}
	dbDSN := os.Getenv("DB_DSN")
	if dbDSN == "" {
		log.Println("WARNING: DB_DSN not set, using default localhost connection.")
		dbDSN = "host=localhost user=tano password=tano_blog_pass dbname=tano_blog port=5432 sslmode=disable"
	}
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		log.Println("WARNING: ADMIN_PASSWORD not set, using default 'admin123'. Change this immediately!")
		adminPassword = "admin123"
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
			Secret:     jwtSecret,
			Expiration: 24 * time.Hour,
		},
		Upload: UploadConfig{
			Dir:   getEnv("UPLOAD_DIR", "./uploads"),
			MaxMB: getEnvInt64("UPLOAD_MAX_MB", 10),
		},
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
