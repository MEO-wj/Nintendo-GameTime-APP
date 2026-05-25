package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"nintendo-gametime/internal/domain"
)

type PostgresRepo struct {
	pool *pgxpool.Pool
}

func NewPostgres(pool *pgxpool.Pool) *PostgresRepo {
	return &PostgresRepo{pool: pool}
}

func (r *PostgresRepo) Close() { r.pool.Close() }

func now() time.Time { return time.Now().UTC() }
func uuidStr() string { return uuid.New().String() }

// ─── User ────────────────────────────────────────────────────────

func (r *PostgresRepo) CreateUserWithPassword(ctx context.Context, email, passwordHash string) (*domain.User, error) {
	id := uuidStr()
	n := now()
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, created_at) VALUES ($1,$2,$3,$4)`,
		id, email, passwordHash, n)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &domain.User{ID: id, Email: email, PasswordHash: &passwordHash, CreatedAt: n}, nil
}

func (r *PostgresRepo) UpsertUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE email=$1`, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err == pgx.ErrNoRows {
		id := uuidStr()
		n := now()
		_, err = r.pool.Exec(ctx,
			`INSERT INTO users (id, email, password_hash, created_at) VALUES ($1,$2,NULL,$3)`,
			id, email, n)
		if err != nil {
			return nil, fmt.Errorf("insert user: %w", err)
		}
		return &domain.User{ID: id, Email: email, CreatedAt: n}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &u, nil
}

func (r *PostgresRepo) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE id=$1`, id).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *PostgresRepo) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE email=$1`, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *PostgresRepo) UpdateUserPassword(ctx context.Context, userID, passwordHash string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, passwordHash, userID)
	return err
}

// ─── User Preference ─────────────────────────────────────────────

func (r *PostgresRepo) GetUserPreference(ctx context.Context, userID string) (*domain.UserPreference, error) {
	var p domain.UserPreference
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, market_mode, created_at, updated_at FROM user_preferences WHERE user_id=$1`, userID).
		Scan(&p.UserID, &p.MarketMode, &p.CreatedAt, &p.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

func (r *PostgresRepo) UpsertUserPreference(ctx context.Context, userID, marketMode string) (*domain.UserPreference, error) {
	n := now()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_preferences (user_id, market_mode, created_at, updated_at)
		VALUES ($1,$2,$3,$3)
		ON CONFLICT (user_id) DO UPDATE SET market_mode=$2, updated_at=$3`,
		userID, marketMode, n)
	if err != nil {
		return nil, err
	}
	return &domain.UserPreference{UserID: userID, MarketMode: marketMode, CreatedAt: n, UpdatedAt: n}, nil
}

// ─── Auth Code ───────────────────────────────────────────────────

func (r *PostgresRepo) SaveAuthCode(ctx context.Context, email, code, expiresAt string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO auth_codes (id, email, code, expires_at, created_at) VALUES ($1,$2,$3,$4,$5)`,
		uuidStr(), email, code, expiresAt, now())
	return err
}

func (r *PostgresRepo) ConsumeAuthCode(ctx context.Context, email, code, nowStr string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE auth_codes SET consumed_at=$1
		WHERE id = (
			SELECT id FROM auth_codes
			WHERE email=$2 AND code=$3 AND consumed_at IS NULL AND expires_at > $1
			ORDER BY created_at DESC LIMIT 1
		)`, nowStr, email, code)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ─── Nintendo Account ────────────────────────────────────────────

func (r *PostgresRepo) UpsertNintendoAccount(ctx context.Context, userID, encryptedSession, region string) (*domain.NintendoAccount, error) {
	n := now()
	id := uuidStr()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO nintendo_accounts (id, user_id, encrypted_session, region, created_at, updated_at, deleted_at)
		VALUES ($1,$2,$3,$4,$5,$5,NULL)
		ON CONFLICT (user_id) DO UPDATE SET encrypted_session=$3, region=$4, updated_at=$5, deleted_at=NULL`,
		id, userID, encryptedSession, region, n)
	if err != nil {
		return nil, err
	}
	return &domain.NintendoAccount{ID: id, UserID: userID, EncryptedSession: encryptedSession, Region: region, CreatedAt: n, UpdatedAt: n}, nil
}

func (r *PostgresRepo) GetNintendoAccountByUserID(ctx context.Context, userID string) (*domain.NintendoAccount, error) {
	var a domain.NintendoAccount
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at, deleted_at
		FROM nintendo_accounts WHERE user_id=$1 AND deleted_at IS NULL`, userID).
		Scan(&a.ID, &a.UserID, &a.EncryptedSession, &a.Region, &a.LastSyncAt, &a.SyncFailCount, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

func (r *PostgresRepo) ListActiveNintendoAccounts(ctx context.Context) ([]domain.NintendoAccount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at
		FROM nintendo_accounts WHERE deleted_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.NintendoAccount
	for rows.Next() {
		var a domain.NintendoAccount
		if err := rows.Scan(&a.ID, &a.UserID, &a.EncryptedSession, &a.Region, &a.LastSyncAt, &a.SyncFailCount, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

func (r *PostgresRepo) UpdateNintendoSyncState(ctx context.Context, userID string, lastSyncAt *string, syncFailCount *int) error {
	if lastSyncAt != nil {
		_, err := r.pool.Exec(ctx, `UPDATE nintendo_accounts SET last_sync_at=$1, updated_at=$2 WHERE user_id=$3`, *lastSyncAt, now(), userID)
		if err != nil {
			return err
		}
	}
	if syncFailCount != nil {
		_, err := r.pool.Exec(ctx, `UPDATE nintendo_accounts SET sync_fail_count=$1, updated_at=$2 WHERE user_id=$3`, *syncFailCount, now(), userID)
		if err != nil {
			return err
		}
	}
	return nil
}

// ─── Games ───────────────────────────────────────────────────────

func (r *PostgresRepo) UpsertGame(ctx context.Context, input domain.UpsertGameInput) (*domain.GameRow, error) {
	n := now()
	id := uuidStr()
	row := r.pool.QueryRow(ctx, `
		INSERT INTO games (id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,NULL)
		ON CONFLICT (user_id, external_id) DO UPDATE SET
			title=$4, cover_url=$5, region=$6, platform=$7, price_jpy=$8, owned_at=$9, last_played_at=$10, updated_at=$11, deleted_at=NULL
		RETURNING id, created_at`,
		id, input.UserID, input.ExternalID, input.Title, input.CoverURL, input.Region, input.Platform, input.PriceJPY, input.OwnedAt, input.LastPlayedAt, n)
	var resultID string
	var createdAt time.Time
	if err := row.Scan(&resultID, &createdAt); err != nil {
		return nil, err
	}
	return &domain.GameRow{
		ID: resultID, UserID: input.UserID, ExternalID: input.ExternalID, Title: input.Title,
		CoverURL: input.CoverURL, Region: input.Region, Platform: input.Platform, PriceJPY: input.PriceJPY,
		CreatedAt: createdAt, UpdatedAt: n,
	}, nil
}

func (r *PostgresRepo) GetGameByID(ctx context.Context, userID, gameID string) (*domain.GameRow, error) {
	var g domain.GameRow
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at
		FROM games WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, gameID, userID).
		Scan(&g.ID, &g.UserID, &g.ExternalID, &g.Title, &g.CoverURL, &g.Region, &g.Platform, &g.PriceJPY, &g.OwnedAt, &g.LastPlayedAt, &g.CreatedAt, &g.UpdatedAt, &g.DeletedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &g, err
}

func (r *PostgresRepo) ListGamesByUserID(ctx context.Context, userID string) ([]domain.GameRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at
		FROM games WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.GameRow
	for rows.Next() {
		var g domain.GameRow
		if err := rows.Scan(&g.ID, &g.UserID, &g.ExternalID, &g.Title, &g.CoverURL, &g.Region, &g.Platform, &g.PriceJPY, &g.OwnedAt, &g.LastPlayedAt, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, g)
	}
	return result, rows.Err()
}

func (r *PostgresRepo) ListGamesPaginatedByUserID(ctx context.Context, userID string, offset, limit int) ([]domain.GameRow, *int, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at
		FROM games WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC OFFSET $2 LIMIT $3`,
		userID, offset, limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var result []domain.GameRow
	for rows.Next() {
		var g domain.GameRow
		if err := rows.Scan(&g.ID, &g.UserID, &g.ExternalID, &g.Title, &g.CoverURL, &g.Region, &g.Platform, &g.PriceJPY, &g.OwnedAt, &g.LastPlayedAt, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, nil, err
		}
		result = append(result, g)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	var next *int
	if len(result) == limit {
		v := offset + limit
		next = &v
	}
	return result, next, nil
}

func (r *PostgresRepo) RemoveGame(ctx context.Context, userID, gameID, deletedAt string) (*domain.GameRow, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE games SET deleted_at=$1, updated_at=$1 WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL`,
		deletedAt, gameID, userID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil
	}
	return r.GetGameByID(ctx, userID, gameID)
}

// ─── Catalog ─────────────────────────────────────────────────────

func (r *PostgresRepo) UpsertCatalogGame(ctx context.Context, input domain.UpsertCatalogGameInput) (*domain.CatalogGameRow, error) {
	n := now()
	id := uuidStr()
	loc := input.Localizations
	if loc == nil {
		loc = json.RawMessage(`{}`)
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO catalog_games (id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date, price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
		ON CONFLICT (external_id) DO UPDATE SET
			sort_order=$3, title=$4, cover_url=$5, store_url=$6, description=$7, publisher=$8, release_date=$9,
			price_amount=$10, price_currency=$11, platform=$12, region=$13, source=$14, localizations=$15, last_synced_at=$16, updated_at=$17`,
		id, input.ExternalID, input.SortOrder, input.Title, input.CoverURL, input.StoreURL,
		input.Description, input.Publisher, input.ReleaseDate, input.PriceAmount, input.PriceCurrency,
		input.Platform, input.Region, input.Source, loc, input.LastSyncedAt, n)
	if err != nil {
		return nil, err
	}
	return &domain.CatalogGameRow{
		ID: id, ExternalID: input.ExternalID, SortOrder: input.SortOrder, Title: input.Title,
		CoverURL: input.CoverURL, StoreURL: input.StoreURL, Description: input.Description,
		Publisher: input.Publisher, ReleaseDate: input.ReleaseDate, PriceAmount: input.PriceAmount,
		PriceCurrency: input.PriceCurrency, Platform: input.Platform, Region: input.Region,
		Source: input.Source, Localizations: loc, LastSyncedAt: n, CreatedAt: n, UpdatedAt: n,
	}, nil
}

func (r *PostgresRepo) GetCatalogGameByExternalID(ctx context.Context, externalID string) (*domain.CatalogGameRow, error) {
	var g domain.CatalogGameRow
	err := r.pool.QueryRow(ctx, `
		SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
			price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
		FROM catalog_games WHERE external_id=$1`, externalID).
		Scan(&g.ID, &g.ExternalID, &g.SortOrder, &g.Title, &g.CoverURL, &g.StoreURL, &g.Description,
			&g.Publisher, &g.ReleaseDate, &g.PriceAmount, &g.PriceCurrency, &g.Platform, &g.Region,
			&g.Source, &g.Localizations, &g.LastSyncedAt, &g.CreatedAt, &g.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &g, err
}

func (r *PostgresRepo) ListCatalogGames(ctx context.Context) ([]domain.CatalogGameRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
			price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
		FROM catalog_games ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCatalogRows(rows)
}

func (r *PostgresRepo) CountCatalogGames(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM catalog_games`).Scan(&count)
	return count, err
}

func (r *PostgresRepo) ListCatalogGamesBySource(ctx context.Context, source string, limit int) ([]domain.CatalogGameRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
			price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
		FROM catalog_games WHERE source=$1 LIMIT $2`, source, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCatalogRows(rows)
}

func (r *PostgresRepo) ListCatalogGamesWithoutPrices(ctx context.Context, source string, limit int) ([]domain.CatalogGameRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.external_id, c.sort_order, c.title, c.cover_url, c.store_url, c.description, c.publisher, c.release_date,
			c.price_amount, c.price_currency, c.platform, c.region, c.source, c.localizations, c.last_synced_at, c.created_at, c.updated_at
		FROM catalog_games c LEFT JOIN regional_prices r ON c.external_id = r.external_id
		WHERE c.source=$1 AND r.id IS NULL LIMIT $2`, source, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCatalogRows(rows)
}

func scanCatalogRows(rows pgx.Rows) ([]domain.CatalogGameRow, error) {
	var result []domain.CatalogGameRow
	for rows.Next() {
		var g domain.CatalogGameRow
		if err := rows.Scan(&g.ID, &g.ExternalID, &g.SortOrder, &g.Title, &g.CoverURL, &g.StoreURL,
			&g.Description, &g.Publisher, &g.ReleaseDate, &g.PriceAmount, &g.PriceCurrency,
			&g.Platform, &g.Region, &g.Source, &g.Localizations, &g.LastSyncedAt, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, g)
	}
	return result, rows.Err()
}

// ─── Snapshots ───────────────────────────────────────────────────

func (r *PostgresRepo) InsertOfficialSnapshot(ctx context.Context, userID, gameID string, playedMinutes *int, rawPayload []byte, capturedAt string) (*domain.OfficialSnapshotRow, error) {
	id := uuidStr()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO official_snapshots (id, user_id, game_id, played_minutes, raw_payload, captured_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, id, userID, gameID, playedMinutes, rawPayload, capturedAt)
	if err != nil {
		return nil, err
	}
	t, _ := time.Parse(time.RFC3339, capturedAt)
	return &domain.OfficialSnapshotRow{ID: id, UserID: userID, GameID: gameID, PlayedMinutes: playedMinutes, RawPayload: rawPayload, CapturedAt: t}, nil
}

func (r *PostgresRepo) ListOfficialSnapshotsByUserID(ctx context.Context, userID string) ([]domain.OfficialSnapshotRow, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, user_id, game_id, played_minutes, raw_payload, captured_at FROM official_snapshots WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.OfficialSnapshotRow
	for rows.Next() {
		var s domain.OfficialSnapshotRow
		if err := rows.Scan(&s.ID, &s.UserID, &s.GameID, &s.PlayedMinutes, &s.RawPayload, &s.CapturedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *PostgresRepo) GetLatestOfficialSnapshotsByUserID(ctx context.Context, userID string) ([]domain.OfficialSnapshotRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT ON (game_id) id, user_id, game_id, played_minutes, raw_payload, captured_at
		FROM official_snapshots WHERE user_id=$1 ORDER BY game_id, captured_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.OfficialSnapshotRow
	for rows.Next() {
		var s domain.OfficialSnapshotRow
		if err := rows.Scan(&s.ID, &s.UserID, &s.GameID, &s.PlayedMinutes, &s.RawPayload, &s.CapturedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// ─── Corrections ─────────────────────────────────────────────────

func (r *PostgresRepo) CreateCorrection(ctx context.Context, userID, gameID, corrType string, minutes int, reason, createdAt string) (*domain.CorrectionRow, error) {
	id := uuidStr()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO playtime_corrections (id, user_id, game_id, type, minutes, reason, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, userID, gameID, corrType, minutes, reason, createdAt)
	if err != nil {
		return nil, err
	}
	t, _ := time.Parse(time.RFC3339, createdAt)
	return &domain.CorrectionRow{ID: id, UserID: userID, GameID: gameID, Type: corrType, Minutes: minutes, Reason: reason, CreatedAt: t}, nil
}

func (r *PostgresRepo) ListCorrectionsByUserID(ctx context.Context, userID string, gameID *string) ([]domain.CorrectionRow, error) {
	query := `SELECT id, user_id, game_id, type, minutes, reason, created_at, revoked_at, deleted_at FROM playtime_corrections WHERE user_id=$1 AND deleted_at IS NULL`
	args := []any{userID}
	if gameID != nil {
		query += ` AND game_id=$2`
		args = append(args, *gameID)
	}
	query += ` ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.CorrectionRow
	for rows.Next() {
		var c domain.CorrectionRow
		if err := rows.Scan(&c.ID, &c.UserID, &c.GameID, &c.Type, &c.Minutes, &c.Reason, &c.CreatedAt, &c.RevokedAt, &c.DeletedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (r *PostgresRepo) RevokeCorrection(ctx context.Context, userID, correctionID, revokedAt string) (*domain.CorrectionRow, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE playtime_corrections SET revoked_at=$1 WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL AND revoked_at IS NULL`,
		revokedAt, correctionID, userID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil
	}
	corrID := correctionID
	corrs, err := r.ListCorrectionsByUserID(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	for _, c := range corrs {
		if c.ID == corrID {
			return &c, nil
		}
	}
	return nil, nil
}

// ─── Ratings ─────────────────────────────────────────────────────

func (r *PostgresRepo) GetGameRatingSnapshot(ctx context.Context, userID, externalID string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error) {
	var ur domain.GameRatingRow
	err := r.pool.QueryRow(ctx, `SELECT id, user_id, external_id, score, created_at, updated_at FROM game_ratings WHERE user_id=$1 AND external_id=$2`, userID, externalID).
		Scan(&ur.ID, &ur.UserID, &ur.ExternalID, &ur.Score, &ur.CreatedAt, &ur.UpdatedAt)
	if err == pgx.ErrNoRows {
		ur = domain.GameRatingRow{}
	} else if err != nil {
		return nil, nil, err
	}

	var sum domain.GameRatingSummaryRow
	err = r.pool.QueryRow(ctx, `SELECT external_id, rating_count, rating_total, updated_at FROM game_rating_summaries WHERE external_id=$1`, externalID).
		Scan(&sum.ExternalID, &sum.RatingCount, &sum.RatingTotal, &sum.UpdatedAt)
	if err == pgx.ErrNoRows {
		return &ur, nil, nil
	} else if err != nil {
		return nil, nil, err
	}
	return &ur, &sum, nil
}

func (r *PostgresRepo) UpsertGameRating(ctx context.Context, userID, externalID string, score float64, nowStr string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	n := now()

	// Get existing rating
	var existingScore *float64
	var existingID string
	err = tx.QueryRow(ctx, `SELECT id, score FROM game_ratings WHERE user_id=$1 AND external_id=$2 FOR UPDATE`, userID, externalID).Scan(&existingID, &existingScore)
	if err != nil && err != pgx.ErrNoRows {
		return nil, nil, err
	}

	// Upsert summary
	var sum domain.GameRatingSummaryRow
	if existingScore != nil {
		_, err = tx.Exec(ctx, `
			INSERT INTO game_rating_summaries (external_id, rating_count, rating_total, updated_at)
			VALUES ($1, 1, $2, $3)
			ON CONFLICT (external_id) DO UPDATE SET rating_total = game_rating_summaries.rating_total + $2 - $4, updated_at=$3`,
			externalID, score, n, *existingScore)
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO game_rating_summaries (external_id, rating_count, rating_total, updated_at)
			VALUES ($1, 1, $2, $3)
			ON CONFLICT (external_id) DO UPDATE SET rating_count = game_rating_summaries.rating_count + 1, rating_total = game_rating_summaries.rating_total + $2, updated_at=$3`,
			externalID, score, n)
	}
	if err != nil {
		return nil, nil, err
	}

	// Upsert user rating
	if existingID != "" {
		_, err = tx.Exec(ctx, `UPDATE game_ratings SET score=$1, updated_at=$2 WHERE id=$3`, score, n, existingID)
	} else {
		existingID = uuidStr()
		_, err = tx.Exec(ctx, `INSERT INTO game_ratings (id, user_id, external_id, score, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
			existingID, userID, externalID, score, n)
	}
	if err != nil {
		return nil, nil, err
	}

	// Read back summary
	err = tx.QueryRow(ctx, `SELECT external_id, rating_count, rating_total, updated_at FROM game_rating_summaries WHERE external_id=$1`, externalID).
		Scan(&sum.ExternalID, &sum.RatingCount, &sum.RatingTotal, &sum.UpdatedAt)
	if err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}

	ur := &domain.GameRatingRow{ID: existingID, UserID: userID, ExternalID: externalID, Score: score, CreatedAt: n, UpdatedAt: n}
	return ur, &sum, nil
}

// ─── Sync Jobs ───────────────────────────────────────────────────

func (r *PostgresRepo) CreateSyncJob(ctx context.Context, userID, status, triggeredBy, startedAt string) (*domain.SyncJobRow, error) {
	id := uuidStr()
	t, _ := time.Parse(time.RFC3339, startedAt)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sync_jobs (id, user_id, status, triggered_by, started_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$5)`, id, userID, status, triggeredBy, t)
	if err != nil {
		return nil, err
	}
	return &domain.SyncJobRow{ID: id, UserID: userID, Status: status, TriggeredBy: triggeredBy, StartedAt: t, CreatedAt: t}, nil
}

func (r *PostgresRepo) UpdateSyncJob(ctx context.Context, syncJobID string, status string, finishedAt *string, durationMs *int, errorSummary *string) error {
	_, err := r.pool.Exec(ctx, `UPDATE sync_jobs SET status=$1, finished_at=$2, duration_ms=$3, error_summary=$4 WHERE id=$5`,
		status, finishedAt, durationMs, errorSummary, syncJobID)
	return err
}

func (r *PostgresRepo) GetLatestSyncJobByUserID(ctx context.Context, userID string) (*domain.SyncJobRow, error) {
	var j domain.SyncJobRow
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, status, triggered_by, started_at, finished_at, duration_ms, error_summary, created_at
		FROM sync_jobs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 1`, userID).
		Scan(&j.ID, &j.UserID, &j.Status, &j.TriggeredBy, &j.StartedAt, &j.FinishedAt, &j.DurationMs, &j.ErrorSummary, &j.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &j, err
}

// ─── Audit Log ───────────────────────────────────────────────────

func (r *PostgresRepo) InsertAuditLog(ctx context.Context, userID, action string, details []byte, createdAt string) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO audit_logs (id, user_id, action, details, created_at) VALUES ($1,$2,$3,$4,$5)`,
		uuidStr(), userID, action, details, createdAt)
	return err
}

// ─── Regional Prices ─────────────────────────────────────────────

func (r *PostgresRepo) UpsertRegionalPrices(ctx context.Context, externalID string, prices []byte, fetchedAt string) (*domain.RegionalPriceRow, error) {
	n := now()
	id := uuidStr()
	_, err := r.pool.Exec(ctx, `
		INSERT INTO regional_prices (id, external_id, prices, fetched_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$5)
		ON CONFLICT (external_id) DO UPDATE SET prices=$3, fetched_at=$4, updated_at=$5`,
		id, externalID, prices, fetchedAt, n)
	if err != nil {
		return nil, err
	}
	return &domain.RegionalPriceRow{ID: id, ExternalID: externalID, Prices: prices, CreatedAt: n, UpdatedAt: n}, nil
}

func (r *PostgresRepo) GetRegionalPrices(ctx context.Context, externalID string) (*domain.RegionalPriceRow, error) {
	var rp domain.RegionalPriceRow
	err := r.pool.QueryRow(ctx, `SELECT id, external_id, prices, fetched_at, created_at, updated_at FROM regional_prices WHERE external_id=$1`, externalID).
		Scan(&rp.ID, &rp.ExternalID, &rp.Prices, &rp.FetchedAt, &rp.CreatedAt, &rp.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &rp, err
}

func (r *PostgresRepo) ListRegionalPricesByStaleness(ctx context.Context, staleThreshold string, limit int) ([]domain.RegionalPriceRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, external_id, prices, fetched_at, created_at, updated_at
		FROM regional_prices WHERE fetched_at < $1 ORDER BY fetched_at ASC LIMIT $2`, staleThreshold, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.RegionalPriceRow
	for rows.Next() {
		var rp domain.RegionalPriceRow
		if err := rows.Scan(&rp.ID, &rp.ExternalID, &rp.Prices, &rp.FetchedAt, &rp.CreatedAt, &rp.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, rp)
	}
	return result, rows.Err()
}
