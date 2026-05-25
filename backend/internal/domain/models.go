package domain

import (
	"encoding/json"
	"time"
)

// ─── Core entities ───────────────────────────────────────────────

type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	PasswordHash *string    `json:"-"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type UserPreference struct {
	UserID    string    `json:"userId"`
	MarketMode string   `json:"marketMode"` // "GLOBAL" or "DOMESTIC"
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type AuthCode struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Code       string     `json:"code"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	ConsumedAt *time.Time `json:"consumedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type NintendoAccount struct {
	ID              string     `json:"id"`
	UserID          string     `json:"userId"`
	EncryptedSession string   `json:"-"`
	Region          string     `json:"region"` // "JP", "GLOBAL", "UNKNOWN"
	LastSyncAt      *time.Time `json:"lastSyncAt,omitempty"`
	SyncFailCount   int        `json:"syncFailCount"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	DeletedAt       *time.Time `json:"deletedAt,omitempty"`
}

type GameRow struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	ExternalID   string     `json:"externalId"`
	Title        string     `json:"title"`
	CoverURL     *string    `json:"coverUrl,omitempty"`
	Region       string     `json:"region"`
	Platform     string     `json:"platform"`
	PriceJPY     *int       `json:"priceJpy,omitempty"`
	OwnedAt      *time.Time `json:"ownedAt,omitempty"`
	LastPlayedAt *time.Time `json:"lastPlayedAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty"`
}

type CatalogGameRow struct {
	ID           string          `json:"id"`
	ExternalID   string          `json:"externalId"`
	SortOrder    int             `json:"sortOrder"`
	Title        string          `json:"title"`
	CoverURL     *string         `json:"coverUrl,omitempty"`
	StoreURL     string          `json:"storeUrl"`
	Description  *string         `json:"description,omitempty"`
	Publisher    *string         `json:"publisher,omitempty"`
	ReleaseDate  *string         `json:"releaseDate,omitempty"`
	PriceAmount  *float64        `json:"priceAmount,omitempty"`
	PriceCurrency string         `json:"priceCurrency"`
	Platform     string          `json:"platform"`
	Region       string          `json:"region"`
	Source       string          `json:"source"`
	Localizations json.RawMessage `json:"localizations"`
	LastSyncedAt time.Time       `json:"lastSyncedAt"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}

type OfficialSnapshotRow struct {
	ID           string          `json:"id"`
	UserID       string          `json:"userId"`
	GameID       string          `json:"gameId"`
	PlayedMinutes *int           `json:"playedMinutes,omitempty"`
	RawPayload   json.RawMessage `json:"rawPayload"`
	CapturedAt   time.Time       `json:"capturedAt"`
}

type CorrectionRow struct {
	ID        string     `json:"id"`
	UserID    string     `json:"userId"`
	GameID    string     `json:"gameId"`
	Type      string     `json:"type"` // "SET_TOTAL" or "ADD_DELTA"
	Minutes   int        `json:"minutes"`
	Reason    string     `json:"reason"`
	CreatedAt time.Time  `json:"createdAt"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
	DeletedAt *time.Time `json:"deletedAt,omitempty"`
}

type GameRatingRow struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	ExternalID string    `json:"externalId"`
	Score      float64   `json:"score"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type GameRatingSummaryRow struct {
	ExternalID  string    `json:"externalId"`
	RatingCount int       `json:"ratingCount"`
	RatingTotal float64   `json:"ratingTotal"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SyncJobRow struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	Status       string     `json:"status"` // QUEUED, RUNNING, SUCCESS, FAILED
	TriggeredBy  string     `json:"triggeredBy"` // MANUAL, SCHEDULED, BIND
	StartedAt    time.Time  `json:"startedAt"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
	DurationMs   *int       `json:"durationMs,omitempty"`
	ErrorSummary *string    `json:"errorSummary,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type AuditLogRow struct {
	ID        string          `json:"id"`
	UserID    string          `json:"userId"`
	Action    string          `json:"action"`
	Details   json.RawMessage `json:"details"`
	CreatedAt time.Time       `json:"createdAt"`
}

type RegionalPriceRow struct {
	ID         string          `json:"id"`
	ExternalID string          `json:"externalId"`
	Prices     json.RawMessage `json:"prices"`
	FetchedAt  time.Time       `json:"fetchedAt"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

// ─── Price types ─────────────────────────────────────────────────

type RegionalPrice struct {
	Region          string  `json:"region"`
	Country         string  `json:"country"`
	Label           string  `json:"label"`
	Currency        string  `json:"currency"`
	Price           float64 `json:"price"`
	SalePrice       *float64 `json:"salePrice,omitempty"`
	OnSale          bool    `json:"onSale"`
	DiscountPercent *int    `json:"discountPercent,omitempty"`
	FetchedAt       string  `json:"fetchedAt"`
}

type EshopRegion struct {
	Code     string `json:"code"`
	Country  string `json:"country"`
	Label    string `json:"label"`
	Currency string `json:"currency"`
}

// ─── Playtime calculation ────────────────────────────────────────

type EffectivePlaytime struct {
	GameID                string `json:"gameId"`
	OfficialMinutes       int    `json:"officialMinutes"`
	CorrectionDeltaMinutes int   `json:"correctionDeltaMinutes"`
	TotalMinutes          int    `json:"totalMinutes"`
	Source                string `json:"source"` // "official", "corrected", "manual-only"
	UpdatedAt             string `json:"updatedAt"`
}

// ─── Nintendo fetched game ───────────────────────────────────────

type NintendoFetchedGame struct {
	ExternalID   string `json:"externalId"`
	Title        string `json:"title"`
	CoverURL     string `json:"coverUrl"`
	Region       string `json:"region"`
	Platform     string `json:"platform"`
	PriceJPY     *int   `json:"priceJpy,omitempty"`
	PlayedMinutes *int  `json:"playedMinutes,omitempty"`
	OwnedAt      string `json:"ownedAt,omitempty"`
	LastPlayedAt string `json:"lastPlayedAt,omitempty"`
}

// ─── Auth ────────────────────────────────────────────────────────

type AuthUser struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
}
