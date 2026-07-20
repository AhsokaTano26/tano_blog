package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"github.com/google/uuid"
	"gorm.io/gorm/logger"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/handler"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
	"tano_blog/backend/internal/version"
)

func main() {
	// Initialize logging
	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}
	utils.InitLogging(logLevel)
	cfg := config.Load()

	// Connect to database
	gormLogLevel := logger.Warn
	if gin.Mode() == gin.DebugMode {
		gormLogLevel = logger.Info
	}
	db, err := gorm.Open(postgres.Open(cfg.Database.DSN), &gorm.Config{
		Logger: logger.Default.LogMode(gormLogLevel),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	utils.LogInfo("Connected to database")

	// Auto migrate
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	utils.LogInfo("Database migrated")

	// Enable pg_trgm extension for full-text search
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm").Error; err != nil {
		utils.LogWarn("failed to create pg_trgm extension", "error", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING GIN (title gin_trgm_ops)").Error; err != nil {
		utils.LogWarn("failed to create title trigram index", "error", err)
	}
	if err := db.Exec("CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON posts USING GIN (content gin_trgm_ops)").Error; err != nil {
		utils.LogWarn("failed to create content trigram index", "error", err)
	}

	// Initialize GeoIP
	utils.InitGeoIP()

	// Seed default admin user if not exists
	seedAdmin(db, cfg.AdminPassword)

	// Seed default configs
	seedSiteConfigs(db)
	// Migrate old CommenterBlock records to IPBan
	migrateCommenterBlocks(db)

	// Initialize repositories
	postRepo := repository.NewPostRepo(db)
	commentRepo := repository.NewCommentRepo(db)
	mediaRepo := repository.NewMediaRepo(db)
	seriesRepo := repository.NewSeriesRepo(db)
	galleryRepo := repository.NewGalleryRepo(db)

	// Initialize services
	emailService := service.NewEmailService(db)
	aiService := service.NewAIService(db)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(db, &cfg.JWT, emailService)
	postHandler := handler.NewPostHandler(postRepo)
	categoryHandler := handler.NewCategoryHandler(db)
	tagHandler := handler.NewTagHandler(db)
	commentHandler := handler.NewCommentHandler(commentRepo, db, emailService)
	mediaHandler := handler.NewMediaHandler(mediaRepo, galleryRepo, &cfg.Upload)
	siteConfigHandler := handler.NewSiteConfigHandler(db, emailService)
	accessLogHandler := handler.NewAccessLogHandler(db)
	backupHandler := handler.NewBackupHandler(db, cfg.Upload.Dir, cfg.BackupDir)
	seriesHandler := handler.NewSeriesHandler(seriesRepo)
	feedHandler := handler.NewFeedHandler(db)
	friendLinkHandler := handler.NewFriendLinkHandler(db)
	navLinkHandler := handler.NewNavLinkHandler(db)
	galleryHandler := handler.NewGalleryHandler(galleryRepo)
		ipBanRepo := repository.NewIPBanRepo(db)
		ipBanHandler := handler.NewIPBanHandler(ipBanRepo, repository.NewSiteConfigRepo(db))
	notifHandler := handler.NewNotificationHandler(db)
	aiHandler := handler.NewAIHandler(aiService, db)

	// Setup router
	r := gin.New()
	r.MaxMultipartMemory = 2 << 30 // 2 GB
	r.Use(gin.Recovery())
	r.Use(middleware.AccessLogger(db))

	// CORS: allow frontend origin
	allowedOrigins := strings.Split(os.Getenv("CORS_ORIGINS"), ",")
	if len(allowedOrigins) == 1 && allowedOrigins[0] == "" {
		allowedOrigins = []string{"http://localhost:3000"}
	}
	r.Use(middleware.CORS(allowedOrigins))
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.IPBan(ipBanRepo))

	// Serve uploaded files
	r.Static("/uploads", cfg.Upload.Dir)

	api := r.Group("/api/v1")

	// Restore endpoints (exempt from maxBodySize to allow large uploads up to 500MB)
	restoreGroup := api.Group("/admin/restore")
	restoreGroup.Use(middleware.AuthRequired(&cfg.JWT, db))
	restoreGroup.Use(middleware.CSRF())
	restoreGroup.Use(middleware.RoleRequired("admin"))
	{
		restoreGroup.POST("/upload", backupHandler.RestoreUpload)
		restoreGroup.POST("/url", backupHandler.RestoreURL)
		restoreGroup.POST("/local", backupHandler.RestoreLocal)
		restoreGroup.POST("/clear-all", backupHandler.ClearAllData)
	}

	// Media upload endpoint (exempt from maxBodySize since handler has its own type-specific limits)
	mediaGroup := api.Group("/admin")
	mediaGroup.Use(middleware.AuthRequired(&cfg.JWT, db))
	mediaGroup.Use(middleware.CSRF())
	mediaGroup.Use(middleware.RoleRequired("admin"))
	{
		mediaGroup.POST("/upload", mediaHandler.Upload)
	}

	api.Use(maxBodySize(50 << 20))
	{
		// Public auth endpoints (with rate limiting)
		auth := api.Group("/auth")
		{
			auth.POST("/login", middleware.RateLimit(10, 60*time.Second), authHandler.Login)
			auth.POST("/login/totp", middleware.RateLimit(10, 60*time.Second), authHandler.LoginWithTOTP)
			auth.POST("/passkey/login/options", middleware.RateLimit(10, 60*time.Second), authHandler.PasskeyLoginOptions)
			auth.POST("/passkey/login/verify", middleware.RateLimit(10, 60*time.Second), authHandler.PasskeyLoginVerify)
		}

		// Public config endpoint (for injection)
		api.GET("/config/public", siteConfigHandler.GetPublic)

		// Public content endpoints
		api.GET("/posts", postHandler.ListPublic)
		api.GET("/posts/top", postHandler.TopPosts)
		api.GET("/posts/top-viewed", postHandler.TopViewed)
		api.POST("/posts/:slug/reactions", middleware.RateLimit(30, 60*time.Second), postHandler.ToggleReaction)
		api.GET("/posts/:slug/adjacent", postHandler.AdjacentPosts)
		api.GET("/posts/:slug/related", postHandler.RelatedPosts)
		api.POST("/posts/:slug/verify-password", middleware.RateLimit(5, 60*time.Second), postHandler.VerifyPassword)
		api.GET("/posts/preview", middleware.RateLimit(30, 60*time.Second), postHandler.GetByPreviewToken)
		api.GET("/posts/calendar", postHandler.CalendarPostsPublic)

		// Media info (public — for article audio player to fetch metadata)
		api.GET("/media/info", mediaHandler.GetMediaInfo)

		// Password reset (public, with rate limiting)
		api.POST("/auth/forgot-password", middleware.RateLimit(3, 60*time.Second), authHandler.ForgotPassword)
		api.POST("/auth/reset-password", middleware.RateLimit(5, 60*time.Second), authHandler.ResetPassword)
		api.GET("/posts/:slug", middleware.OptionalAuth(&cfg.JWT), postHandler.GetBySlug)
		api.GET("/archive", postHandler.Archive)

		// Friend links (public)
		api.GET("/links", friendLinkHandler.ListPublic)
		api.POST("/links/apply", middleware.RateLimit(5, 60*time.Second), friendLinkHandler.Apply)

		// Nav links (public)
		api.GET("/nav-links", navLinkHandler.ListPublic)
		// Gallery (public)
		api.GET("/gallery", galleryHandler.List)

		api.GET("/categories", categoryHandler.List)
		api.GET("/categories/:slug", categoryHandler.GetBySlug)

		api.GET("/tags", tagHandler.List)
		api.GET("/tags/:slug", tagHandler.GetBySlug)

		api.GET("/series", seriesHandler.List)
		api.GET("/series/:slug", seriesHandler.GetBySlug)

		api.GET("/posts/:slug/comments", commentHandler.ListByPost)
		api.POST("/posts/:slug/comments", middleware.RateLimit(5, 60*time.Second), commentHandler.Create)
		api.POST("/posts/:slug/comments/:id/reactions", middleware.RateLimit(30, 60*time.Second), commentHandler.ToggleReaction)

		// Authenticated endpoints (CSRF protected)
		authRequired := api.Group("")
		authRequired.Use(middleware.AuthRequired(&cfg.JWT, db))
		authRequired.Use(middleware.CSRF())
		{
			// Auth management
			authRequired.POST("/auth/logout", authHandler.Logout)
			authRequired.GET("/auth/me", authHandler.Me)
			authRequired.PUT("/auth/profile", authHandler.UpdateProfile)
			authRequired.PUT("/auth/password", authHandler.ChangePassword)
			authRequired.POST("/auth/totp/setup", authHandler.TOTPSetup)
			authRequired.POST("/auth/totp/verify", middleware.RateLimit(5, 60*time.Second), authHandler.TOTPVerify)
			authRequired.DELETE("/auth/totp", authHandler.TOTPDisable)
			authRequired.POST("/auth/passkey/register/options", authHandler.PasskeyRegisterOptions)
			authRequired.POST("/auth/passkey/register/verify", authHandler.PasskeyRegisterVerify)
			authRequired.GET("/auth/passkeys", authHandler.ListPasskeys)
			authRequired.DELETE("/auth/passkey/:id", authHandler.DeletePasskey)
			authRequired.PUT("/auth/passkey/:id/rename", authHandler.RenamePasskey)

			// Notifications
			authRequired.GET("/notifications", notifHandler.List)
			authRequired.GET("/notifications/unread-count", notifHandler.UnreadCount)
			authRequired.PATCH("/notifications/:id/read", notifHandler.MarkRead)
			authRequired.PATCH("/notifications/read-all", notifHandler.MarkAllRead)

			// Admin: posts
			admin := authRequired.Group("/admin")
			admin.Use(middleware.RoleRequired("admin"))
			{
				admin.GET("/posts", postHandler.AdminList)
				admin.POST("/posts/batch-status", postHandler.BatchUpdateStatus)
				admin.POST("/posts/batch-delete", postHandler.BatchDelete)
				admin.GET("/posts/:id", postHandler.AdminGet)
				admin.POST("/posts", postHandler.Create)
				admin.PUT("/posts/:id", postHandler.Update)
				admin.DELETE("/posts/:id", postHandler.Delete)
				admin.PATCH("/posts/:id/status", postHandler.UpdateStatus)
				admin.PATCH("/posts/:id/top", postHandler.ToggleTop)
				admin.GET("/posts/:id/revisions", postHandler.ListRevisions)
				admin.POST("/posts/:id/revisions/:revId/restore", postHandler.RestoreRevision)
				admin.POST("/posts/:id/preview-token", postHandler.GeneratePreviewToken)
				admin.POST("/posts/:id/generate-excerpt", aiHandler.GenerateExcerpt)
				admin.GET("/posts/calendar", postHandler.CalendarPosts)
				admin.GET("/posts/export", postHandler.Export)

				admin.GET("/categories", categoryHandler.List)
				admin.POST("/categories", categoryHandler.Create)
				admin.PUT("/categories/:id", categoryHandler.Update)
				admin.DELETE("/categories/:id", categoryHandler.Delete)

				admin.GET("/tags", tagHandler.List)
				admin.POST("/tags", tagHandler.Create)
				admin.PUT("/tags/:id", tagHandler.Update)
				admin.DELETE("/tags/:id", tagHandler.Delete)

				admin.GET("/comments", commentHandler.AdminList)
				admin.PATCH("/comments/:id/status", commentHandler.UpdateStatus)
				admin.PATCH("/comments/batch-status", commentHandler.BatchUpdateStatus)
				admin.DELETE("/comments/:id", commentHandler.Delete)
				admin.GET("/comments/export", commentHandler.ExportCSV)
				admin.PUT("/comments/:id", commentHandler.AdminUpdate)
				admin.GET("/comments/:id/revisions", commentHandler.ListRevisions)


					admin.GET("/ip-bans", ipBanHandler.ListBans)
					admin.POST("/ip-bans", ipBanHandler.CreateBan)
					admin.DELETE("/ip-bans/:id", ipBanHandler.DeleteBan)
					admin.GET("/ip-bans/config", ipBanHandler.GetBanConfig)
					admin.PUT("/ip-bans/config", ipBanHandler.UpdateBanConfig)

				admin.GET("/media", mediaHandler.List)
				admin.DELETE("/media/:id", mediaHandler.Delete)
				admin.PUT("/media/:id/tags", mediaHandler.UpdateMediaTags)
				admin.PUT("/media/:id/metadata", mediaHandler.UpdateMetadata)
				admin.GET("/media/tags", mediaHandler.ListTags)
				admin.POST("/media/tags", mediaHandler.CreateTag)
				admin.DELETE("/media/tags/:id", mediaHandler.DeleteTag)
				admin.POST("/media/batch-delete", mediaHandler.BatchDelete)
				admin.POST("/media/batch-tag", mediaHandler.BatchUpdateTags)

				admin.GET("/series", seriesHandler.AdminList)
				admin.POST("/series", seriesHandler.AdminCreate)
				admin.PUT("/series/:id", seriesHandler.AdminUpdate)
				admin.DELETE("/series/:id", seriesHandler.AdminDelete)
				admin.GET("/series/:id/posts", seriesHandler.AdminListPosts)
				admin.PUT("/series/:id/posts", seriesHandler.AdminSetPosts)

				admin.GET("/config", siteConfigHandler.Get)
				admin.PUT("/config", siteConfigHandler.Update)
				admin.POST("/config/test-email", siteConfigHandler.TestEmail)
				admin.GET("/check-version", siteConfigHandler.CheckVersion)

				admin.GET("/users", authHandler.ListUsers)

				admin.GET("/access-logs", accessLogHandler.List)
				admin.GET("/access-logs/stats", accessLogHandler.Stats)
				admin.GET("/access-logs/stats/device", accessLogHandler.StatsByDevice)
				admin.GET("/access-logs/stats/browser", accessLogHandler.StatsByBrowser)
				admin.GET("/access-logs/stats/os", accessLogHandler.StatsByOS)
				admin.GET("/access-logs/stats/hour", accessLogHandler.StatsByHour)
				admin.GET("/access-logs/stats/country", accessLogHandler.StatsByCountry)
				admin.GET("/access-logs/stats/referrer", accessLogHandler.StatsByReferrer)
				admin.GET("/access-logs/stats/path", accessLogHandler.StatsByPath)
				admin.GET("/access-logs/stats/status-code", accessLogHandler.StatsByStatusCode)
				admin.GET("/access-logs/stats/time-range", accessLogHandler.StatsTimeRange)
				admin.GET("/access-logs/export", accessLogHandler.Export)
				admin.DELETE("/access-logs/:id", accessLogHandler.Delete)
				admin.POST("/access-logs/clear", accessLogHandler.Clear)

				// Backup
				admin.GET("/backups", backupHandler.ListBackups)
				admin.POST("/backups", backupHandler.CreateBackup)
				admin.GET("/backups/:filename/download", backupHandler.DownloadBackup)
				admin.DELETE("/backups/:filename", backupHandler.DeleteBackup)

				admin.GET("/links", friendLinkHandler.AdminList)
				admin.POST("/links", friendLinkHandler.AdminCreate)
				admin.PUT("/links/:id", friendLinkHandler.AdminUpdate)
				admin.PATCH("/links/:id/status", friendLinkHandler.AdminUpdateStatus)
				admin.DELETE("/links/:id", friendLinkHandler.AdminDelete)
				admin.GET("/links/export", friendLinkHandler.ExportCSV)

				// Nav links
				admin.GET("/nav-links", navLinkHandler.AdminList)
				admin.POST("/nav-links", navLinkHandler.AdminCreate)
				admin.PUT("/nav-links/:id", navLinkHandler.AdminUpdate)
				admin.DELETE("/nav-links/:id", navLinkHandler.AdminDelete)
				admin.PUT("/nav-links/reorder", navLinkHandler.AdminReorder)
				// Gallery
				admin.GET("/gallery", galleryHandler.List)
				admin.POST("/gallery", galleryHandler.Create)
				admin.PUT("/gallery/:id", galleryHandler.Update)
				admin.DELETE("/gallery/:id", galleryHandler.Delete)
				admin.PUT("/gallery/reorder", galleryHandler.Reorder)
				admin.POST("/gallery/toggle", galleryHandler.ToggleByURL)
			}
		}
	}

	// RSS & Sitemap & Robots
	r.GET("/rss.xml", feedHandler.RSS)
	r.GET("/sitemap.xml", feedHandler.Sitemap)
	r.GET("/robots.txt", func(c *gin.Context) {
		siteURL := os.Getenv("SITE_URL")
		if siteURL == "" {
			siteURL = "https://tano.asia"
		}
		c.Header("Content-Type", "text/plain")
		c.String(http.StatusOK, "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n", siteURL)
	})

	// Health check with DB ping
	r.GET("/health", func(c *gin.Context) {
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "error": "database unreachable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "version": version.Version})
	})

	port := cfg.Server.Port
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Publish scheduled posts every minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			result := db.Model(&model.Post{}).
				Where("status = ? AND published_at IS NOT NULL AND published_at <= ?", "draft", now).
				Updates(map[string]interface{}{"status": "published"})
			if result.RowsAffected > 0 {
				utils.LogInfo("Published scheduled posts", "count", result.RowsAffected)
			}
		}
	}()

	// Cleanup old backups every hour
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			backupHandler.CleanupOldBackups()
		}
	}()

	go func() {
		utils.LogInfo("Server starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	utils.LogInfo("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	utils.LogInfo("Server exited")

	utils.CloseGeoIP()
}

func seedAdmin(db *gorm.DB, password string) {
	var count int64
	db.Model(&model.User{}).Where("role = ?", "admin").Count(&count)
	if count > 0 {
		return
	}

	// Track whether password was auto-generated (must change) or from .env (skip)
	randomPassword := false

	// If no password provided via env, generate a random one
	if password == "" {
		randomPassword = true
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			log.Fatalf("Failed to generate random admin password: %v", err)
		}
		password = hex.EncodeToString(b)
		log.Println("============================================")
		log.Println("  INITIAL ADMIN PASSWORD:", password)
		log.Println("  Login with username: admin")
		log.Println("  You will be required to change password on first login.")
		log.Println("============================================")
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		log.Fatalf("Failed to hash admin password: %v", err)
	}

	admin := model.User{
		Username:            "admin",
		Email:               "admin@tano.asia",
		PasswordHash:        hash,
		DisplayName:         "管理员",
		Role:                "admin",
		Bio:                 "A BanG Dreamer!",
		MustChangePassword:  randomPassword,
	}

	if err := db.Create(&admin).Error; err != nil {
		log.Fatalf("Failed to seed admin user: %v", err)
	}

	utils.LogInfo("Default admin user created: admin")
}

func seedSiteConfigs(db *gorm.DB) {
	defaults := map[string]string{
		"site_title":       "朝花夕拾录",
		"site_description": "A BanG Dreamer!",
		"site_url":         "https://tano.asia",
		"footer_text":      "© 2026 Tano",
		"comment_enabled":  "true",
		"default_theme":    "dark",
		"accent_color":     "225",
		"email_enabled":    "false",
		"email_provider":   "zeabur",
		"email_from":       "",
		"profile_avatar":   "/aimi.png",
		"profile_name":     "Tano",
		"profile_bio":      "A BanG Dreamer!",
		"profile_contacts": `[{"type":"email","value":"public@tano.asia"},{"type":"github","value":"AhsokaTano26"}]`,
		"site_favicon":     "/favicon.ico",
		"ai_enabled":      "false",
		"ai_api_url":      "https://api.openai.com/v1",
		"ai_api_key":      "",
		"ai_model":        "gpt-3.5-turbo",
	}

	for key, value := range defaults {
		var count int64
		db.Model(&model.SiteConfig{}).Where("key = ?", key).Count(&count)
		if count == 0 {
			db.Create(&model.SiteConfig{Key: key, Value: value})
		}
	}
}


// migrateCommenterBlocks migrates legacy CommenterBlock records to IPBan.
func migrateCommenterBlocks(db *gorm.DB) {
	if db.Migrator().HasTable("commenter_blocks") {
		type oldBlock struct {
			ID        string
			Email     string
			IPAddress string
			Reason    string
			CreatedBy string
			CreatedAt time.Time
		}
		var old []oldBlock
		db.Table("commenter_blocks").Find(&old)
		for _, b := range old {
			if b.IPAddress == "" {
				continue
			}
			ban := model.IPBan{
				IPAddress: b.IPAddress,
				Scope:     "comment",
				Reason:    b.Reason,
				CreatedAt: b.CreatedAt,
			}
			if b.CreatedBy != "" {
				id, err := uuid.Parse(b.CreatedBy)
				if err == nil {
					ban.CreatedBy = &id
				}
			}
			db.Where("ip_address = ? AND scope = ?", b.IPAddress, "comment").
				FirstOrCreate(&ban)
		}
		db.Migrator().DropTable("commenter_blocks")
	}
}

func init() {
	_ = godotenv.Load()

	mode := os.Getenv("GIN_MODE")
	if mode == "" {
		mode = gin.ReleaseMode
	}
	gin.SetMode(mode)

	fmt.Printf(`
  ╔══════════════════════════════════════╗
  ║      Tano Blog Backend API %-8s ║
  ║        Powered by Go + Gin           ║
  ╚══════════════════════════════════════╝
`, version.Version)
}

// maxBodySize limits the request body size.
func maxBodySize(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}
