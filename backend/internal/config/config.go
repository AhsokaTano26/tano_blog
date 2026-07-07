package config

import (
	"crypto/rand"
	"encoding/hex"
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
	Secret               string
	Expiration           time.Duration
	RememberMeExpiration time.Duration
}

type UploadConfig struct {
	Dir        string
	MaxImageMB int64
	MaxAudioMB int64
	MaxVideoMB int64
}

func Load() *Config {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		// Generate a random JWT secret for development
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			log.Fatalf("FATAL: failed to generate random JWT secret: %v", err)
		}
		jwtSecret = hex.EncodeToString(b)
		log.Printf("WARNING: JWT_SECRET not set, generated random secret. JWTs will be invalid on restart.")
		log.Printf("WARNING: Set JWT_SECRET environment variable for persistent sessions.")
	}
	dbDSN := os.Getenv("DB_DSN")
	if dbDSN == "" {
		log.Fatal("FATAL: DB_DSN environment variable is required")
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
			Secret:               jwtSecret,
			Expiration:           2 * time.Hour,
			RememberMeExpiration: 7 * 24 * time.Hour,
		},
		Upload: UploadConfig{
			Dir:         getEnv("UPLOAD_DIR", "./uploads"),
			MaxImageMB:  getEnvInt64("UPLOAD_MAX_IMAGE_MB", 50),
			MaxAudioMB:  getEnvInt64("UPLOAD_MAX_AUDIO_MB", 200),
			MaxVideoMB:  getEnvInt64("UPLOAD_MAX_VIDEO_MB", 2048),
		},
		BackupDir:     getEnv("BACKUP_DIR", "./backups"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
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
