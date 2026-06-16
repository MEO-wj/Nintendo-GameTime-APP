package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
)

type GamesHandler struct {
	repo repository.Repository
}

func NewGamesHandler(repo repository.Repository) *GamesHandler {
	return &GamesHandler{repo: repo}
}

// enrichGames adds effectivePlaytime, localizations, priceAmount, priceCurrency to game rows.
func (h *GamesHandler) enrichGames(c *gin.Context, userID string, games []domain.GameRow) []gin.H {
	ctx := c.Request.Context()
	snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(ctx, userID)
	corrections, _ := h.repo.ListCorrectionsByUserID(ctx, userID, nil)
	playtimeMap := domain.CalculateEffectivePlaytimeMap(snapshots, corrections)

	result := make([]gin.H, 0, len(games))
	for _, g := range games {
		pt := playtimeMap[g.ID]
		if pt.TotalMinutes == 0 && pt.Source == "" {
			pt = domain.EffectivePlaytime{GameID: g.ID, Source: "official"}
		}

		// Look up localizations from catalog
		var localizations gin.H
		if catalog, _ := h.repo.GetCatalogGameByExternalID(ctx, g.ExternalID); catalog != nil && catalog.Localizations != nil {
			var loc map[string]interface{}
			if err := json.Unmarshal(catalog.Localizations, &loc); err == nil {
				localizations = gin.H(loc)
			}
		}

		priceAmount := (*int)(nil)
		if g.PriceJPY != nil {
			priceAmount = g.PriceJPY
		}

		item := gin.H{
			"id":               g.ID,
			"externalId":       g.ExternalID,
			"title":            g.Title,
			"coverUrl":         g.CoverURL,
			"ownedAt":          g.OwnedAt,
			"lastPlayedAt":     g.LastPlayedAt,
			"platform":         g.Platform,
			"region":           g.Region,
			"priceAmount":      priceAmount,
			"priceCurrency":    "JPY",
			"effectivePlaytime": gin.H{
				"totalMinutes":          pt.TotalMinutes,
				"officialMinutes":       pt.OfficialMinutes,
				"correctionDeltaMinutes": pt.CorrectionDeltaMinutes,
				"source":                pt.Source,
				"updatedAt":             pt.UpdatedAt,
			},
			"localizations": localizations,
		}
		result = append(result, item)
	}
	return result
}

func (h *GamesHandler) ListGames(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	tab := c.DefaultQuery("tab", "owned")
	cursor := c.Query("cursor")
	limit := clampInt(queryInt(c, "limit", 20), 1, 100)

	offset := 0
	if cursor != "" {
		if decoded, err := base64.RawURLEncoding.DecodeString(cursor); err == nil {
			offset, _ = strconv.Atoi(string(decoded))
		}
	}

	items, next, err := h.repo.ListGamesPaginatedByUserID(c.Request.Context(), auth.UserID, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to list games"})
		return
	}
	if items == nil {
		items = []domain.GameRow{}
	}

	// Apply tab-based sorting
	if tab == "top" {
		snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(c.Request.Context(), auth.UserID)
		corrections, _ := h.repo.ListCorrectionsByUserID(c.Request.Context(), auth.UserID, nil)
		ptMap := domain.CalculateEffectivePlaytimeMap(snapshots, corrections)
		sort.Slice(items, func(i, j int) bool {
			return ptMap[items[i].ID].TotalMinutes > ptMap[items[j].ID].TotalMinutes
		})
	} else if tab == "recent" {
		sort.Slice(items, func(i, j int) bool {
			if items[i].LastPlayedAt == nil && items[j].LastPlayedAt == nil {
				return items[i].CreatedAt.After(items[j].CreatedAt)
			}
			if items[i].LastPlayedAt == nil {
				return false
			}
			if items[j].LastPlayedAt == nil {
				return true
			}
			return items[i].LastPlayedAt.After(*items[j].LastPlayedAt)
		})
	}

	enriched := h.enrichGames(c, auth.UserID, items)

	var nextCursor *string
	if next != nil {
		s := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(*next)))
		nextCursor = &s
	}

	c.JSON(http.StatusOK, gin.H{"items": enriched, "nextCursor": nextCursor})
}

func (h *GamesHandler) GetGame(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	gameID := c.Param("id")
	game, err := h.repo.GetGameByID(c.Request.Context(), auth.UserID, gameID)
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Game not found"})
		return
	}

	enriched := h.enrichGames(c, auth.UserID, []domain.GameRow{*game})
	if len(enriched) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"message": "Game not found"})
		return
	}

	// Add rating info for detail view
	ur, sum, _ := h.repo.GetGameRatingSnapshot(c.Request.Context(), auth.UserID, game.ExternalID)
	playerRating := gin.H{"userScore": 0, "averageScore": 0, "ratingCount": 0}
	if ur != nil {
		playerRating["userScore"] = ur.Score
	}
	if sum != nil && sum.RatingCount > 0 {
		playerRating["averageScore"] = sum.RatingTotal / float64(sum.RatingCount)
		playerRating["ratingCount"] = sum.RatingCount
	}
	enriched[0]["playerRating"] = playerRating

	// Add catalog details
	if catalog, _ := h.repo.GetCatalogGameByExternalID(c.Request.Context(), game.ExternalID); catalog != nil {
		enriched[0]["description"] = catalog.Description
		enriched[0]["publisher"] = catalog.Publisher
		enriched[0]["releaseDate"] = catalog.ReleaseDate
		enriched[0]["storeUrl"] = catalog.StoreURL
		enriched[0]["criticScore"] = catalog.CriticScore
	}

	// Add corrections
	corrections, _ := h.repo.ListCorrectionsByUserID(c.Request.Context(), auth.UserID, &game.ID)
	corrItems := make([]gin.H, 0, len(corrections))
	for _, corr := range corrections {
		corrItems = append(corrItems, gin.H{
			"id":        corr.ID,
			"gameId":    corr.GameID,
			"type":      corr.Type,
			"minutes":   corr.Minutes,
			"reason":    corr.Reason,
			"date":      corr.Date,
			"createdAt": corr.CreatedAt,
			"revokedAt": corr.RevokedAt,
		})
	}
	enriched[0]["corrections"] = corrItems

	c.JSON(http.StatusOK, enriched[0])
}

func (h *GamesHandler) AddToLibrary(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	ctx := c.Request.Context()
	var req struct {
		ExternalID string `json:"externalId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	catalog, err := h.repo.GetCatalogGameByExternalID(ctx, req.ExternalID)
	if err != nil || catalog == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Catalog game not found"})
		return
	}

	// Resolve price_jpy from regional_prices or catalog fallback
	priceJPY := resolvePriceJPYFromCatalog(ctx, h.repo, catalog)

	game, err := h.repo.UpsertGame(ctx, repository.UpsertGameInput{
		UserID:     auth.UserID,
		ExternalID: catalog.ExternalID,
		Title:      catalog.Title,
		CoverURL:   catalog.CoverURL,
		Region:     catalog.Region,
		Platform:   catalog.Platform,
		PriceJPY:   priceJPY,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to add game"})
		return
	}

	// Return enriched game data matching frontend GameDetail interface
	enriched := h.enrichGames(c, auth.UserID, []domain.GameRow{*game})
	if len(enriched) == 0 {
		c.JSON(http.StatusOK, game)
		return
	}

	// Add catalog details
	if catalog.Description != nil {
		enriched[0]["description"] = catalog.Description
	}
	if catalog.Publisher != nil {
		enriched[0]["publisher"] = catalog.Publisher
	}
	if catalog.ReleaseDate != nil {
		enriched[0]["releaseDate"] = catalog.ReleaseDate
	}
	if catalog.StoreURL != "" {
		enriched[0]["storeUrl"] = catalog.StoreURL
	}
	enriched[0]["criticScore"] = catalog.CriticScore

	// Player rating
	ur, sum, _ := h.repo.GetGameRatingSnapshot(c.Request.Context(), auth.UserID, game.ExternalID)
	playerRating := gin.H{"userScore": 0, "averageScore": 0, "ratingCount": 0}
	if ur != nil {
		playerRating["userScore"] = ur.Score
	}
	if sum != nil && sum.RatingCount > 0 {
		playerRating["averageScore"] = sum.RatingTotal / float64(sum.RatingCount)
		playerRating["ratingCount"] = sum.RatingCount
	}
	enriched[0]["playerRating"] = playerRating
	enriched[0]["corrections"] = []gin.H{}

	c.JSON(http.StatusOK, enriched[0])
}

func (h *GamesHandler) RemoveFromLibrary(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	gameID := c.Param("id")
	game, err := h.repo.RemoveGame(c.Request.Context(), auth.UserID, gameID, time.Now().UTC().Format(time.RFC3339))
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Game not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Game removed"})
}

func (h *GamesHandler) RateGame(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	gameID := c.Param("id")
	var req struct {
		Score float64 `json:"score" binding:"required,min=0.1,max=10"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	game, err := h.repo.GetGameByID(c.Request.Context(), auth.UserID, gameID)
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Game not found"})
		return
	}

	ur, sum, err := h.repo.UpsertGameRating(c.Request.Context(), auth.UserID, game.ExternalID, req.Score, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to rate game"})
		return
	}
	rating := gin.H{"userScore": 0, "averageScore": 0, "ratingCount": 0}
	if ur != nil {
		rating["userScore"] = ur.Score
	}
	if sum != nil && sum.RatingCount > 0 {
		rating["averageScore"] = sum.RatingTotal / float64(sum.RatingCount)
		rating["ratingCount"] = sum.RatingCount
	}
	c.JSON(http.StatusOK, gin.H{"rating": rating})
}

func queryInt(c *gin.Context, key string, fallback int) int {
	if v := c.Query(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// resolvePriceJPYFromCatalog extracts the JPY-equivalent price for a catalog game.
// It first checks regional_prices for a JP entry, then falls back to converting the
// catalog price_amount (assumed USD) to JPY at an approximate rate of 150.
func resolvePriceJPYFromCatalog(ctx context.Context, repo repository.Repository, catalog *domain.CatalogGameRow) *int {
	// Try regional prices for explicit JPY entry
	if rp, err := repo.GetRegionalPrices(ctx, catalog.ExternalID); err == nil && rp != nil {
		var prices []domain.RegionalPrice
		if err := json.Unmarshal(rp.Prices, &prices); err == nil {
			for _, p := range prices {
				if p.Currency == "JPY" {
					jpyPrice := int(p.Price)
					return &jpyPrice
				}
			}
		}
	}

	// Fallback: convert catalog price_amount to JPY
	if catalog.PriceAmount != nil {
		// Approximate conversion: USD→JPY ≈ 150, EUR→JPY ≈ 163
		rate := 150.0
		if catalog.PriceCurrency == "EUR" {
			rate = 163.0
		} else if catalog.PriceCurrency == "GBP" {
			rate = 190.0
		} else if catalog.PriceCurrency == "HKD" {
			rate = 19.0
		} else if catalog.PriceCurrency == "KRW" {
			rate = 0.11
		} else if catalog.PriceCurrency == "AUD" {
			rate = 98.0
		}
		jpyPrice := int(*catalog.PriceAmount * rate)
		return &jpyPrice
	}

	return nil
}
