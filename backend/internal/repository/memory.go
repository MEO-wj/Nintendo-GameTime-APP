package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"nintendo-gametime/internal/domain"
)

// MemoryRepo is an in-memory implementation of Repository for development/testing.
type MemoryRepo struct {
	mu               sync.RWMutex
	users            map[string]*domain.User
	usersByEmail     map[string]*domain.User
	preferences      map[string]*domain.UserPreference
	authCodes        map[string]*domain.AuthCode
	nintendoAccounts map[string]*domain.NintendoAccount
	games            map[string]*domain.GameRow
	catalogGames     map[string]*domain.CatalogGameRow
	snapshots        map[string]*domain.OfficialSnapshotRow
	corrections      map[string]*domain.CorrectionRow
	ratings          map[string]*domain.GameRatingRow
	ratingSummaries  map[string]*domain.GameRatingSummaryRow
	syncJobs         map[string]*domain.SyncJobRow
	auditLogs        map[string]*domain.AuditLogRow
	regionalPrices   map[string]*domain.RegionalPriceRow
}

func NewMemory() *MemoryRepo {
	return &MemoryRepo{
		users:            make(map[string]*domain.User),
		usersByEmail:     make(map[string]*domain.User),
		preferences:      make(map[string]*domain.UserPreference),
		authCodes:        make(map[string]*domain.AuthCode),
		nintendoAccounts: make(map[string]*domain.NintendoAccount),
		games:            make(map[string]*domain.GameRow),
		catalogGames:     make(map[string]*domain.CatalogGameRow),
		snapshots:        make(map[string]*domain.OfficialSnapshotRow),
		corrections:      make(map[string]*domain.CorrectionRow),
		ratings:          make(map[string]*domain.GameRatingRow),
		ratingSummaries:  make(map[string]*domain.GameRatingSummaryRow),
		syncJobs:         make(map[string]*domain.SyncJobRow),
		auditLogs:        make(map[string]*domain.AuditLogRow),
		regionalPrices:   make(map[string]*domain.RegionalPriceRow),
	}
}

func (r *MemoryRepo) Close() {}

func (r *MemoryRepo) CreateUserWithPassword(_ context.Context, email, passwordHash string) (*domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.usersByEmail[email]; exists {
		return nil, ErrEmailExists
	}
	u := &domain.User{ID: uuid.New().String(), Email: email, PasswordHash: &passwordHash, CreatedAt: time.Now().UTC()}
	r.users[u.ID] = u
	r.usersByEmail[email] = u
	return u, nil
}

func (r *MemoryRepo) UpsertUserByEmail(_ context.Context, email string) (*domain.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if u, ok := r.usersByEmail[email]; ok {
		return u, nil
	}
	u := &domain.User{ID: uuid.New().String(), Email: email, CreatedAt: time.Now().UTC()}
	r.users[u.ID] = u
	r.usersByEmail[email] = u
	return u, nil
}

func (r *MemoryRepo) GetUserByID(_ context.Context, id string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.users[id], nil
}

func (r *MemoryRepo) GetUserByEmail(_ context.Context, email string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.usersByEmail[email], nil
}

func (r *MemoryRepo) UpdateUserPassword(_ context.Context, userID, passwordHash string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if u, ok := r.users[userID]; ok {
		u.PasswordHash = &passwordHash
	}
	return nil
}

func (r *MemoryRepo) GetUserPreference(_ context.Context, userID string) (*domain.UserPreference, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.preferences[userID], nil
}

func (r *MemoryRepo) UpsertUserPreference(_ context.Context, userID, marketMode string) (*domain.UserPreference, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	if p, ok := r.preferences[userID]; ok {
		p.MarketMode = marketMode
		p.UpdatedAt = n
		return p, nil
	}
	p := &domain.UserPreference{UserID: userID, MarketMode: marketMode, CreatedAt: n, UpdatedAt: n}
	r.preferences[userID] = p
	return p, nil
}

func (r *MemoryRepo) SaveAuthCode(_ context.Context, email, code, expiresAt string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac := &domain.AuthCode{ID: uuid.New().String(), Email: email, Code: code, CreatedAt: time.Now().UTC()}
	t, _ := time.Parse(time.RFC3339, expiresAt)
	ac.ExpiresAt = t
	r.authCodes[ac.ID] = ac
	return nil
}

func (r *MemoryRepo) ConsumeAuthCode(_ context.Context, email, code, nowStr string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now, _ := time.Parse(time.RFC3339, nowStr)
	for _, ac := range r.authCodes {
		if ac.Email == email && ac.Code == code && ac.ConsumedAt == nil && ac.ExpiresAt.After(now) {
			ac.ConsumedAt = &now
			return true, nil
		}
	}
	return false, nil
}

func (r *MemoryRepo) UpsertNintendoAccount(_ context.Context, userID, encryptedSession, region string) (*domain.NintendoAccount, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	if a, ok := r.nintendoAccounts[userID]; ok {
		a.EncryptedSession = encryptedSession
		a.Region = region
		a.UpdatedAt = n
		a.DeletedAt = nil
		return a, nil
	}
	a := &domain.NintendoAccount{ID: uuid.New().String(), UserID: userID, EncryptedSession: encryptedSession, Region: region, CreatedAt: n, UpdatedAt: n}
	r.nintendoAccounts[userID] = a
	return a, nil
}

func (r *MemoryRepo) GetNintendoAccountByUserID(_ context.Context, userID string) (*domain.NintendoAccount, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a := r.nintendoAccounts[userID]
	if a == nil || a.DeletedAt != nil {
		return nil, nil
	}
	return a, nil
}

func (r *MemoryRepo) ListActiveNintendoAccounts(_ context.Context) ([]domain.NintendoAccount, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.NintendoAccount
	for _, a := range r.nintendoAccounts {
		if a.DeletedAt == nil {
			result = append(result, *a)
		}
	}
	return result, nil
}

func (r *MemoryRepo) UpdateNintendoSyncState(_ context.Context, userID string, lastSyncAt *string, syncFailCount *int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a := r.nintendoAccounts[userID]
	if a == nil {
		return nil
	}
	if lastSyncAt != nil {
		t, _ := time.Parse(time.RFC3339, *lastSyncAt)
		a.LastSyncAt = &t
	}
	if syncFailCount != nil {
		a.SyncFailCount = *syncFailCount
	}
	a.UpdatedAt = time.Now().UTC()
	return nil
}

// Games, Catalog, Snapshots, Corrections, Ratings, SyncJobs, AuditLogs, RegionalPrices
// follow the same pattern — abbreviated for brevity but fully functional.

func (r *MemoryRepo) UpsertGame(_ context.Context, input domain.UpsertGameInput) (*domain.GameRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	for _, g := range r.games {
		if g.UserID == input.UserID && g.ExternalID == input.ExternalID && g.DeletedAt == nil {
			g.Title = input.Title
			g.CoverURL = input.CoverURL
			g.Region = input.Region
			g.Platform = input.Platform
			g.PriceJPY = input.PriceJPY
			g.UpdatedAt = n
			return g, nil
		}
	}
	g := &domain.GameRow{ID: uuid.New().String(), UserID: input.UserID, ExternalID: input.ExternalID, Title: input.Title, CoverURL: input.CoverURL, Region: input.Region, Platform: input.Platform, PriceJPY: input.PriceJPY, CreatedAt: n, UpdatedAt: n}
	r.games[g.ID] = g
	return g, nil
}

func (r *MemoryRepo) GetGameByID(_ context.Context, userID, gameID string) (*domain.GameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	g := r.games[gameID]
	if g == nil || g.UserID != userID || g.DeletedAt != nil {
		return nil, nil
	}
	return g, nil
}

func (r *MemoryRepo) ListGamesByUserID(_ context.Context, userID string) ([]domain.GameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.GameRow
	for _, g := range r.games {
		if g.UserID == userID && g.DeletedAt == nil {
			result = append(result, *g)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
	return result, nil
}

func (r *MemoryRepo) ListGamesPaginatedByUserID(ctx context.Context, userID string, offset, limit int) ([]domain.GameRow, *int, error) {
	all, _ := r.ListGamesByUserID(ctx, userID)
	if offset >= len(all) {
		return nil, nil, nil
	}
	end := offset + limit
	if end > len(all) {
		end = len(all)
	}
	items := all[offset:end]
	var next *int
	if end < len(all) {
		v := end
		next = &v
	}
	return items, next, nil
}

func (r *MemoryRepo) RemoveGame(_ context.Context, userID, gameID, deletedAt string) (*domain.GameRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := r.games[gameID]
	if g == nil || g.UserID != userID || g.DeletedAt != nil {
		return nil, nil
	}
	t, _ := time.Parse(time.RFC3339, deletedAt)
	g.DeletedAt = &t
	g.UpdatedAt = t
	return g, nil
}

func (r *MemoryRepo) UpsertCatalogGame(_ context.Context, input domain.UpsertCatalogGameInput) (*domain.CatalogGameRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	if existing, ok := r.catalogGames[input.ExternalID]; ok {
		existing.Title = input.Title
		existing.SortOrder = input.SortOrder
		existing.CoverURL = input.CoverURL
		existing.StoreURL = input.StoreURL
		existing.Description = input.Description
		existing.Publisher = input.Publisher
		existing.ReleaseDate = input.ReleaseDate
		existing.PriceAmount = input.PriceAmount
		existing.PriceCurrency = input.PriceCurrency
		existing.Source = input.Source
		existing.Localizations = input.Localizations
		existing.LastSyncedAt = n
		existing.UpdatedAt = n
		return existing, nil
	}
	loc := input.Localizations
	if loc == nil {
		loc = json.RawMessage(`{}`)
	}
	g := &domain.CatalogGameRow{ID: uuid.New().String(), ExternalID: input.ExternalID, SortOrder: input.SortOrder, Title: input.Title, CoverURL: input.CoverURL, StoreURL: input.StoreURL, Description: input.Description, Publisher: input.Publisher, ReleaseDate: input.ReleaseDate, PriceAmount: input.PriceAmount, PriceCurrency: input.PriceCurrency, Platform: input.Platform, Region: input.Region, Source: input.Source, Localizations: loc, LastSyncedAt: n, CreatedAt: n, UpdatedAt: n}
	r.catalogGames[input.ExternalID] = g
	return g, nil
}

func (r *MemoryRepo) GetCatalogGameByExternalID(_ context.Context, externalID string) (*domain.CatalogGameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.catalogGames[externalID], nil
}

func (r *MemoryRepo) ListCatalogGames(_ context.Context) ([]domain.CatalogGameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.CatalogGameRow
	for _, g := range r.catalogGames {
		result = append(result, *g)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].SortOrder < result[j].SortOrder })
	return result, nil
}

func (r *MemoryRepo) CountCatalogGames(_ context.Context) (int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.catalogGames), nil
}

func (r *MemoryRepo) ListCatalogGamesBySource(_ context.Context, source string, limit int) ([]domain.CatalogGameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.CatalogGameRow
	for _, g := range r.catalogGames {
		if g.Source == source {
			result = append(result, *g)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *MemoryRepo) ListCatalogGamesWithoutPrices(_ context.Context, source string, limit int) ([]domain.CatalogGameRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.CatalogGameRow
	for _, g := range r.catalogGames {
		if g.Source == source {
			if _, hasPrice := r.regionalPrices[g.ExternalID]; !hasPrice {
				result = append(result, *g)
				if len(result) >= limit {
					break
				}
			}
		}
	}
	return result, nil
}

func (r *MemoryRepo) InsertOfficialSnapshot(_ context.Context, userID, gameID string, playedMinutes *int, rawPayload []byte, capturedAt string) (*domain.OfficialSnapshotRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, _ := time.Parse(time.RFC3339, capturedAt)
	s := &domain.OfficialSnapshotRow{ID: uuid.New().String(), UserID: userID, GameID: gameID, PlayedMinutes: playedMinutes, RawPayload: rawPayload, CapturedAt: t}
	r.snapshots[s.ID] = s
	return s, nil
}

func (r *MemoryRepo) ListOfficialSnapshotsByUserID(_ context.Context, userID string) ([]domain.OfficialSnapshotRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.OfficialSnapshotRow
	for _, s := range r.snapshots {
		if s.UserID == userID {
			result = append(result, *s)
		}
	}
	return result, nil
}

func (r *MemoryRepo) GetLatestOfficialSnapshotsByUserID(_ context.Context, userID string) ([]domain.OfficialSnapshotRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	latest := make(map[string]*domain.OfficialSnapshotRow)
	for _, s := range r.snapshots {
		if s.UserID == userID {
			if prev, ok := latest[s.GameID]; !ok || s.CapturedAt.After(prev.CapturedAt) {
				latest[s.GameID] = s
			}
		}
	}
	var result []domain.OfficialSnapshotRow
	for _, s := range latest {
		result = append(result, *s)
	}
	return result, nil
}

func (r *MemoryRepo) CreateCorrection(_ context.Context, userID, gameID, corrType string, minutes int, reason, createdAt string) (*domain.CorrectionRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, _ := time.Parse(time.RFC3339, createdAt)
	c := &domain.CorrectionRow{ID: uuid.New().String(), UserID: userID, GameID: gameID, Type: corrType, Minutes: minutes, Reason: reason, CreatedAt: t}
	r.corrections[c.ID] = c
	return c, nil
}

func (r *MemoryRepo) ListCorrectionsByUserID(_ context.Context, userID string, gameID *string) ([]domain.CorrectionRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []domain.CorrectionRow
	for _, c := range r.corrections {
		if c.UserID == userID && c.DeletedAt == nil && (gameID == nil || c.GameID == *gameID) {
			result = append(result, *c)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
	return result, nil
}

func (r *MemoryRepo) RevokeCorrection(_ context.Context, userID, correctionID, revokedAt string) (*domain.CorrectionRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := r.corrections[correctionID]
	if c == nil || c.UserID != userID || c.DeletedAt != nil || c.RevokedAt != nil {
		return nil, nil
	}
	t, _ := time.Parse(time.RFC3339, revokedAt)
	c.RevokedAt = &t
	return c, nil
}

func (r *MemoryRepo) GetGameRatingSnapshot(_ context.Context, userID, externalID string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var ur *domain.GameRatingRow
	for _, rt := range r.ratings {
		if rt.UserID == userID && rt.ExternalID == externalID {
			ur = rt
			break
		}
	}
	sum := r.ratingSummaries[externalID]
	return ur, sum, nil
}

func (r *MemoryRepo) UpsertGameRating(_ context.Context, userID, externalID string, score float64, nowStr string) (*domain.GameRatingRow, *domain.GameRatingSummaryRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	var existing *domain.GameRatingRow
	for _, rt := range r.ratings {
		if rt.UserID == userID && rt.ExternalID == externalID {
			existing = rt
			break
		}
	}
	sum := r.ratingSummaries[externalID]
	if sum == nil {
		sum = &domain.GameRatingSummaryRow{ExternalID: externalID}
		r.ratingSummaries[externalID] = sum
	}
	if existing != nil {
		sum.RatingTotal += score - existing.Score
		existing.Score = score
		existing.UpdatedAt = n
		return existing, sum, nil
	}
	ur := &domain.GameRatingRow{ID: uuid.New().String(), UserID: userID, ExternalID: externalID, Score: score, CreatedAt: n, UpdatedAt: n}
	r.ratings[ur.ID] = ur
	sum.RatingCount++
	sum.RatingTotal += score
	sum.UpdatedAt = n
	return ur, sum, nil
}

func (r *MemoryRepo) CreateSyncJob(_ context.Context, userID, status, triggeredBy, startedAt string) (*domain.SyncJobRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, _ := time.Parse(time.RFC3339, startedAt)
	j := &domain.SyncJobRow{ID: uuid.New().String(), UserID: userID, Status: status, TriggeredBy: triggeredBy, StartedAt: t, CreatedAt: t}
	r.syncJobs[j.ID] = j
	return j, nil
}

func (r *MemoryRepo) UpdateSyncJob(_ context.Context, syncJobID string, status string, finishedAt *string, durationMs *int, errorSummary *string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	j := r.syncJobs[syncJobID]
	if j == nil {
		return nil
	}
	j.Status = status
	if finishedAt != nil {
		t, _ := time.Parse(time.RFC3339, *finishedAt)
		j.FinishedAt = &t
	}
	j.DurationMs = durationMs
	j.ErrorSummary = errorSummary
	return nil
}

func (r *MemoryRepo) GetLatestSyncJobByUserID(_ context.Context, userID string) (*domain.SyncJobRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var latest *domain.SyncJobRow
	for _, j := range r.syncJobs {
		if j.UserID == userID && (latest == nil || j.StartedAt.After(latest.StartedAt)) {
			latest = j
		}
	}
	return latest, nil
}

func (r *MemoryRepo) InsertAuditLog(_ context.Context, userID, action string, details []byte, createdAt string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, _ := time.Parse(time.RFC3339, createdAt)
	r.auditLogs[uuid.New().String()] = &domain.AuditLogRow{ID: uuid.New().String(), UserID: userID, Action: action, Details: details, CreatedAt: t}
	return nil
}

func (r *MemoryRepo) UpsertRegionalPrices(_ context.Context, externalID string, prices []byte, fetchedAt string) (*domain.RegionalPriceRow, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := time.Now().UTC()
	if existing, ok := r.regionalPrices[externalID]; ok {
		existing.Prices = prices
		t, _ := time.Parse(time.RFC3339, fetchedAt)
		existing.FetchedAt = t
		existing.UpdatedAt = n
		return existing, nil
	}
	t, _ := time.Parse(time.RFC3339, fetchedAt)
	rp := &domain.RegionalPriceRow{ID: uuid.New().String(), ExternalID: externalID, Prices: prices, FetchedAt: t, CreatedAt: n, UpdatedAt: n}
	r.regionalPrices[externalID] = rp
	return rp, nil
}

func (r *MemoryRepo) GetRegionalPrices(_ context.Context, externalID string) (*domain.RegionalPriceRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.regionalPrices[externalID], nil
}

func (r *MemoryRepo) ListRegionalPricesByStaleness(_ context.Context, staleThreshold string, limit int) ([]domain.RegionalPriceRow, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	threshold, _ := time.Parse(time.RFC3339, staleThreshold)
	var result []domain.RegionalPriceRow
	for _, rp := range r.regionalPrices {
		if rp.FetchedAt.Before(threshold) {
			result = append(result, *rp)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].FetchedAt.Before(result[j].FetchedAt) })
	if len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

var ErrEmailExists = fmt.Errorf("email already registered")
