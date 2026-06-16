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

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/database"
	"nintendo-gametime/internal/handler"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/rvis"
	"nintendo-gametime/internal/services/crawler"
)

func main() {
	cfg := config.Load()

	// Repository
	var repo repository.Repository
	if cfg.IsMemory() {
		repo = repository.NewMemory()
		log.Println("[APP] Using in-memory storage")
	} else {
		pool, err := database.NewPostgresPool(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		if err := database.EnsureSchema(context.Background(), pool); err != nil {
			log.Fatalf("Failed to ensure schema: %v", err)
		}
		repo = repository.NewPostgres(pool)
		log.Println("[APP] Using PostgreSQL storage")
	}

	// Services
	rvisSvc := rvis.NewService(cfg)

	// Handlers
	authH := handler.NewAuthHandler(repo, cfg)
	gamesH := handler.NewGamesHandler(repo)
	catalogH := handler.NewCatalogHandler(repo, rvisSvc)
	dashboardH := handler.NewDashboardHandler(repo, rvisSvc)
	accountsH := handler.NewAccountsHandler(repo, cfg)
	correctionsH := handler.NewCorrectionsHandler(repo)
	syncH := handler.NewSyncHandler(repo, cfg)
	crawlerSvc := crawler.New(repo, cfg)
	crawlerH := handler.NewCrawlerHandler(crawlerSvc)

	// Router
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.ResponseTime())
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization", "X-Internal-Token"},
		ExposeHeaders:   []string{"X-Response-Time"},
		MaxAge:          12 * time.Hour,
	}))

	// Health
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
	})

	// Auth (public)
	auth := r.Group("/api/auth")
	{
		auth.POST("/send-code", authH.SendCode)
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
	}

	// Nintendo OAuth (public — browser redirect without JWT header)
	r.GET("/api/auth/nintendo/login", accountsH.NintendoLogin)
	r.GET("/api/auth/nintendo/callback", accountsH.NintendoCallback)

	// Protected
	api := r.Group("/api")
	api.Use(middleware.AuthRequired(cfg.JWTSecret, repo))
	{
		api.GET("/me", authH.GetMe)

		// Games
		api.GET("/games", gamesH.ListGames)
		api.GET("/games/:id", gamesH.GetGame)
		api.POST("/games/library", gamesH.AddToLibrary)
		api.DELETE("/games/:id", gamesH.RemoveFromLibrary)
		api.PUT("/games/:id/rating", gamesH.RateGame)

		// Catalog
		api.GET("/catalog/games", catalogH.ListCatalog)
		api.GET("/catalog/games/:externalId", catalogH.GetCatalogGame)
		api.GET("/catalog/games/:externalId/prices", catalogH.GetPrices)
		api.GET("/catalog/games/:externalId/pricemap", catalogH.GetPriceMap)
		api.PUT("/catalog/games/:externalId/rating", catalogH.RateCatalogGame)
		api.GET("/catalog/status", catalogH.GetCatalogStatus)

		// Dashboard
		api.GET("/dashboard/summary", dashboardH.GetSummary)
		api.GET("/dashboard/charts", dashboardH.GetCharts)

		// Accounts
		api.GET("/accounts/nintendo", accountsH.GetNintendo)
		api.POST("/accounts/nintendo/bind", accountsH.BindNintendo)
		api.GET("/accounts/preferences", accountsH.GetPreferences)
		api.PUT("/accounts/preferences", accountsH.UpdatePreferences)

		// Corrections
		api.POST("/playtime/corrections", correctionsH.CreateCorrection)
		api.GET("/playtime/corrections", correctionsH.ListCorrections)
		api.POST("/playtime/corrections/:id/revoke", correctionsH.RevokeCorrection)

		// Sync
		api.POST("/sync/run", syncH.RunSync)
		api.GET("/sync/status", syncH.GetStatus)
	}

	// Internal endpoints
	internal := r.Group("/api/internal")
	internal.Use(middleware.InternalToken(cfg.InternalToken))
	{
		internal.POST("/sync/all", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "Bulk sync triggered"})
		})
		internal.POST("/catalog/refresh", crawlerH.TriggerCatalogRefresh)
		internal.POST("/crawler/discover", crawlerH.TriggerDiscover)
		internal.POST("/crawler/prices", crawlerH.TriggerPrices)
		internal.POST("/crawler/metacritic", crawlerH.TriggerMetaCritic)
		internal.GET("/crawler/status", crawlerH.GetStatus)
	}

	// Image proxy
	r.GET("/api/proxy/image", func(c *gin.Context) {
		targetURL := c.Query("url")
		if targetURL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing url parameter"})
			return
		}
		if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid url scheme"})
			return
		}

		client := &http.Client{Timeout: 15 * time.Second}
		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, targetURL, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid url"})
			return
		}
		req.Header.Set("User-Agent", "NintendoGameTime/1.0")
		req.Header.Set("Accept", "image/*")

		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "fetch failed"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 400 {
			c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("upstream returned %d", resp.StatusCode)})
			return
		}

		contentType := resp.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "image/jpeg"
		}
		c.Header("Content-Type", contentType)
		c.Header("Cache-Control", "public, max-age=86400")
		c.Header("Access-Control-Allow-Origin", "*")

		c.DataFromReader(http.StatusOK, resp.ContentLength, contentType, resp.Body, nil)
	})

	// Server
	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{Addr: addr, Handler: r}

	go func() {
		log.Printf("[APP] Server starting on %s (env=%s, storage=%s)", addr, cfg.Env, cfg.StorageMode)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Start crawler scheduler in background
	crawlerCtx, crawlerCancel := context.WithCancel(context.Background())
	defer crawlerCancel()
	go crawlerSvc.StartScheduler(crawlerCtx)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[APP] Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[APP] Shutdown error: %v", err)
	}
	repo.Close()
	log.Println("[APP] Server stopped")
}
