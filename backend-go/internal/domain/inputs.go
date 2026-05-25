package domain

import "encoding/json"

type UpsertGameInput struct {
	UserID       string
	ExternalID   string
	Title        string
	CoverURL     *string
	Region       string
	Platform     string
	PriceJPY     *int
	OwnedAt      *string
	LastPlayedAt *string
}

type UpsertCatalogGameInput struct {
	ExternalID    string
	SortOrder     int
	Title         string
	CoverURL      *string
	StoreURL      string
	Description   *string
	Publisher     *string
	ReleaseDate   *string
	PriceAmount   *float64
	PriceCurrency string
	Platform      string
	Region        string
	Source        string
	Localizations json.RawMessage
	LastSyncedAt  string
}
