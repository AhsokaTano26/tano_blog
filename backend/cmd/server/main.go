package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/handler"
	"tano_blog/backend/internal/middleware"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
	"tano_blog/backend/internal/utils"
)

func main() {
	cfg := config.Load()

	// Connect to database
	db, err := gorm.Open(postgres.Open(cfg.Database.DSN), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to database")

	// Auto migrate
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	log.Println("Database migrated")

	// Seed default admin user if not exists
	seedAdmin(db, cfg.AdminPassword)

	// Seed default configs
	seedSiteConfigs(db)

	// Initialize repositories
	postRepo := repository.NewPostRepo(db)
	commentRepo := repository.NewCommentRepo(db)
	mediaRepo := repository.NewMediaRepo(db)


	// Initialize handlers
	authHandler := handler.NewAuthHandler(db, &cfg.JWT)
	postHandler := handler.NewPostHandler(postRepo)
	categoryHandler := handler.NewCategoryHandler(db)
	tagHandler := handler.NewTagHandler(db)
	commentHandler := handler.NewCommentHandler(commentRepo, db)
	mediaHandler := handler.NewMediaHandler(mediaRepo, &cfg.Upload)
	siteConfigHandler := handler.NewSiteConfigHandler(db)
	accessLogHandler := handler.NewAccessLogHandler(db)
	feedHandler := handler.NewFeedHandler(db)

	// Setup router
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.AccessLogger(db))

	// CORS: allow frontend origin
	allowedOrigins := strings.Split(os.Getenv("CORS_ORIGINS"), ",")
	if len(allowedOrigins) == 1 && allowedOrigins[0] == "" {
		allowedOrigins = []string{"http://localhost:3000"}
	}
	r.Use(middleware.CORS(allowedOrigins))

	// Serve uploaded files
	r.Static("/uploads", cfg.Upload.Dir)

	api := r.Group("/api/v1")
	{
		// Public auth endpoints (with rate limiting)
		auth := api.Group("/auth")
		{
			auth.POST("/login", middleware.RateLimit(10, 60), authHandler.Login)
			auth.POST("/login/totp", middleware.RateLimit(10, 60), authHandler.LoginWithTOTP)
			auth.POST("/passkey/login/options", authHandler.PasskeyLoginOptions)
			auth.POST("/passkey/login/verify", authHandler.PasskeyLoginVerify)
		}

		// Public content endpoints
		api.GET("/posts", postHandler.ListPublic)
		api.GET("/posts/top", postHandler.TopPosts)
		api.GET("/posts/:slug", middleware.OptionalAuth(&cfg.JWT), postHandler.GetBySlug)
		api.GET("/archive", postHandler.Archive)

		api.GET("/categories", categoryHandler.List)
		api.GET("/categories/:slug", categoryHandler.GetBySlug)

		api.GET("/tags", tagHandler.List)
		api.GET("/tags/:slug", tagHandler.GetBySlug)

		api.GET("/posts/:slug/comments", commentHandler.ListByPost)
		api.POST("/posts/:slug/comments", commentHandler.Create)

		// Authenticated endpoints
		authRequired := api.Group("")
		authRequired.Use(middleware.AuthRequired(&cfg.JWT))
		{
			// Auth management
			authRequired.POST("/auth/logout", authHandler.Logout)
			authRequired.GET("/auth/me", authHandler.Me)
			authRequired.POST("/auth/totp/setup", authHandler.TOTPSetup)
			authRequired.POST("/auth/totp/verify", authHandler.TOTPVerify)
			authRequired.DELETE("/auth/totp", authHandler.TOTPDisable)
			authRequired.POST("/auth/passkey/register/options", authHandler.PasskeyRegisterOptions)
			authRequired.POST("/auth/passkey/register/verify", authHandler.PasskeyRegisterVerify)
			authRequired.GET("/auth/passkeys", authHandler.ListPasskeys)
			authRequired.DELETE("/auth/passkey/:id", authHandler.DeletePasskey)

			// Admin: posts
			admin := authRequired.Group("/admin")
			admin.Use(middleware.RoleRequired("admin"))
			{
				admin.GET("/posts", postHandler.AdminList)
				admin.POST("/posts", postHandler.Create)
				admin.PUT("/posts/:id", postHandler.Update)
				admin.DELETE("/posts/:id", postHandler.Delete)
				admin.PATCH("/posts/:id/status", postHandler.UpdateStatus)
				admin.PATCH("/posts/:id/top", postHandler.ToggleTop)

				admin.POST("/categories", categoryHandler.Create)
				admin.PUT("/categories/:id", categoryHandler.Update)
				admin.DELETE("/categories/:id", categoryHandler.Delete)

				admin.POST("/tags", tagHandler.Create)
				admin.PUT("/tags/:id", tagHandler.Update)
				admin.DELETE("/tags/:id", tagHandler.Delete)

				admin.GET("/comments", commentHandler.AdminList)
				admin.PATCH("/comments/:id/status", commentHandler.UpdateStatus)
				admin.DELETE("/comments/:id", commentHandler.Delete)

				admin.POST("/upload", mediaHandler.Upload)
				admin.GET("/media", mediaHandler.List)
				admin.DELETE("/media/:id", mediaHandler.Delete)

				admin.GET("/config", siteConfigHandler.Get)
				admin.PUT("/config", siteConfigHandler.Update)

				admin.GET("/access-logs", accessLogHandler.List)
				admin.GET("/access-logs/stats", accessLogHandler.Stats)
			}
		}
	}

	// RSS & Sitemap
	r.GET("/rss.xml", feedHandler.RSS)
	r.GET("/sitemap.xml", feedHandler.Sitemap)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	port := cfg.Server.Port
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited")
}

func seedAdmin(db *gorm.DB, password string) {
	var count int64
	db.Model(&model.User{}).Count(&count)
	if count > 0 {
		return
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		log.Fatalf("Failed to hash admin password: %v", err)
	}

	admin := model.User{
		Username:     "admin",
		Email:        "admin@tano.asia",
		PasswordHash: hash,
		DisplayName:  "管理员",
		Role:         "admin",
		Bio:          "A BanG Dreamer!",
	}

	if err := db.Create(&admin).Error; err != nil {
		log.Fatalf("Failed to seed admin user: %v", err)
	}

	log.Println("Default admin user created: admin")
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
	}

	for key, value := range defaults {
		var count int64
		db.Model(&model.SiteConfig{}).Where("key = ?", key).Count(&count)
		if count == 0 {
			db.Create(&model.SiteConfig{Key: key, Value: value})
		}
	}
}

func init() {
	// Set Gin mode
	mode := os.Getenv("GIN_MODE")
	if mode == "" {
		mode = gin.ReleaseMode
	}
	gin.SetMode(mode)

	fmt.Println(`
  ╔══════════════════════════════════════╗
  ║        Tano Blog Backend API        ║
  ║        Powered by Go + Gin          ║
  ╚══════════════════════════════════════╝
	`)
}
