package repository

import (
	"context"
	"nintendo-gametime/internal/domain"
)

type Repository interface {
	// User
	CreateUserWithPassword(ctx context.Context, email, passwordHash string) (*domain.User, error)
	UpsertUserByEmail(ctx context.Context, email string) (*domain.User, error)
	GetUserByID(ctx context.Context, id string) (*domain.User, error)
	GetUserByEmail(ctx context.Context, email string) (*domain.User, error)
	UpdateUserPassword(ctx context.Context, userID, passwordHash string) error

	// User Preference
	GetUserPreference(ctx context.Context, userID string) (*domain.UserPreference, error)
	UpsertUserPreference(ctx context.Context, userID, marketMode string) (*domain.UserPreference, error)

	// Auth Code
	SaveAuthCode(ctx context.Context, email, code, expiresAt string) error
	ConsumeAuthCode(ctx context.Context, email, code, now string) (bool, error)

	// Nintendo Account
	UpsertNintendoAccount(ctx context.Context, userID, encryptedSession, region string) (*domain.NintendoAccount, error)
	GetNintendoAccountByUserID(ctx context.Context, userID string) (*domain.NintendoAccount, error)
	ListActiveNintendoAccounts(ctx context.Context) ([]domain.NintendoAccount, error)
	UpdateNintendoSyncState(ctx context.Context, userID string, lastSyncAt *string, syncFailCount *int) error

	// Games
	UpsertGame(ctx context.Context, input domain.UpsertGameInput) (*domain.GameRow, error)
	GetGameByID(ctx context.Context, userID, gameID string) (*domain.GameRow, error)
	ListGamesByUserID(ctx context.Context, userID string) ([]domain.GameRow, error)
	ListGamesPaginatedByUserID(ctx context.Context, userID string, offset, limit int) ([]domain.GameRow, *int, error)
	RemoveGame(ctx context.Context, userID, gameID, deletedAt string) (*domain.GameRow, error)

	// Catalog
	UpsertCatalogGame(ctx context.Context, input domain.UpsertCatalogGameInput) (*domain.CatalogGameRow, error)
	GetCatalogGameByExternalID(ctx context.Context, externalID string) (*domain.CatalogGameRow, error)
	ListCatalogGames(ctx context.Context) ([]domain.CatalogGameRow, error)
	CountCatalogGames(ctx context.Context) (int, error)
	ListCatalogGamesBySource(ctx context.Context, source string, limit int) ([]domain.CatalogGameRow, error)
	ListCatalogGamesWithoutPrices(ctx context.Context, source string, limit int) ([]domain.CatalogGameRow, error)

	// Snapshots
	InsertOfficialSnapshot(ctx context.Context, userID, gameID string, playedMinutes *int, rawPayload []byte, capturedAt string) (*domain.OfficialSnapshotRow, error)
	ListOfficialSnapshotsByUserID(ctx context.Context, userID string) ([]domain.OfficialSnapshotRow, error)
	GetLatestOfficialSnapshotsByUserID(ctx context.Context, userID string) ([]domain.OfficialSnapshotRow, error)

	// Corrections
	CreateCorrection(ctx context.Context, userID, gameID, corrType string, minutes int, reason, createdAt string) (*domain.CorrectionRow, error)
	ListCorrectionsByUserID(ctx context.Context, userID string, gameID *string) ([]domain.CorrectionRow, error)
	RevokeCorrection(ctx context.Context, userID, correctionID, revokedAt string) (*domain.CorrectionRow, error)

	// Ratings
	GetGameRatingSnapshot(ctx context.Context, userID, externalID string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error)
	UpsertGameRating(ctx context.Context, userID, externalID string, score float64, now string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error)

	// Sync Jobs
	CreateSyncJob(ctx context.Context, userID, status, triggeredBy, startedAt string) (*domain.SyncJobRow, error)
	UpdateSyncJob(ctx context.Context, syncJobID string, status string, finishedAt *string, durationMs *int, errorSummary *string) error
	GetLatestSyncJobByUserID(ctx context.Context, userID string) (*domain.SyncJobRow, error)

	// Audit Log
	InsertAuditLog(ctx context.Context, userID, action string, details []byte, createdAt string) error

	// Regional Prices
	UpsertRegionalPrices(ctx context.Context, externalID string, prices []byte, fetchedAt string) (*domain.RegionalPriceRow, error)
	GetRegionalPrices(ctx context.Context, externalID string) (*domain.RegionalPriceRow, error)
	ListRegionalPricesByStaleness(ctx context.Context, staleThreshold string, limit int) ([]domain.RegionalPriceRow, error)

	// Lifecycle
	Close()
}

// ─── Input types ─────────────────────────────────────────────────

type UpsertGameInput = domain.UpsertGameInput
type UpsertCatalogGameInput = domain.UpsertCatalogGameInput
