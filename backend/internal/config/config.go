package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env            string
	Port           int
	JWTSecret      string
	EncryptionKey  string
	StorageMode    string // "memory" or "postgres"
	DatabaseURL    string
	OTPExpiresMin  int
	OTPDevCode     string
	InternalToken  string
	NintendoMock   bool
	APIBaseURL     string
	SMTPHost       string
	SMTPPort       int
	SMTPUser       string
	SMTPPass       string
	SMTPFrom       string
	RBin           string
	REnabled       bool
	RTimeout       time.Duration
	// Crawler / eShop
	EshopCacheTTL         time.Duration
	EshopRateLimit        time.Duration
	CrawlerDiscoverInt    time.Duration
	CrawlerPriceRefreshInt time.Duration
	CrawlerStalePrice     time.Duration
	CrawlerBatchLimit     int
	CatalogRefreshInt     time.Duration
	AlertFailThreshold    int
}

func Load() *Config {
	return &Config{
		Env:            envStr("NODE_ENV", "development"),
		Port:           envInt("PORT", 4000),
		JWTSecret:      envStr("JWT_SECRET", "dev_jwt_secret_please_change"),
		EncryptionKey:  envStr("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
		StorageMode:    envStr("STORAGE_MODE", "postgres"),
		DatabaseURL:    envStr("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/nintendo_gametime?sslmode=disable"),
		OTPExpiresMin:  envInt("OTP_EXPIRES_MINUTES", 10),
		OTPDevCode:     envStr("OTP_DEV_CODE", "000000"),
		InternalToken:  envStr("INTERNAL_SYNC_TOKEN", "internal_sync_token_change_me"),
		NintendoMock:   envBool("NINTENDO_MOCK", true),
		APIBaseURL:     envStr("API_BASE_URL", "http://localhost:4000"),
		SMTPHost:       envStr("SMTP_HOST", ""),
		SMTPPort:       envInt("SMTP_PORT", 587),
		SMTPUser:       envStr("SMTP_USER", ""),
		SMTPPass:       envStr("SMTP_PASS", ""),
		SMTPFrom:       envStr("SMTP_FROM", ""),
		RBin:           envStr("R_VISUALIZATION_BIN", "Rscript"),
		REnabled:       envBool("R_VISUALIZATION_ENABLED", true),
		RTimeout:       time.Duration(envInt("R_VISUALIZATION_TIMEOUT_MS", 3000)) * time.Millisecond,
		EshopCacheTTL:          time.Duration(envInt("ESHOP_CACHE_TTL_MS", 21600000)) * time.Millisecond,
		EshopRateLimit:         time.Duration(envInt("ESHOP_RATE_LIMIT_MS", 1200)) * time.Millisecond,
		CrawlerDiscoverInt:     time.Duration(envInt("CRAWLER_DISCOVER_INTERVAL_MS", 43200000)) * time.Millisecond,
		CrawlerPriceRefreshInt: time.Duration(envInt("CRAWLER_PRICE_REFRESH_INTERVAL_MS", 7200000)) * time.Millisecond,
		CrawlerStalePrice:      time.Duration(envInt("CRAWLER_STALE_PRICE_MS", 21600000)) * time.Millisecond,
		CrawlerBatchLimit:      envInt("CRAWLER_BATCH_LIMIT", 50),
		CatalogRefreshInt:      time.Duration(envInt("CATALOG_REFRESH_INTERVAL_MS", 21600000)) * time.Millisecond,
		AlertFailThreshold:     envInt("ALERT_FAIL_THRESHOLD", 3),
	}
}

func (c *Config) IsProduction() bool { return c.Env == "production" }
func (c *Config) IsMemory() bool     { return c.StorageMode == "memory" }

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		v = strings.ToLower(v)
		return v == "true" || v == "1"
	}
	return fallback
}
