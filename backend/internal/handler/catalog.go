package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/rvis"
)

type CatalogHandler struct {
	repo repository.Repository
	rvis *rvis.Service
}

func NewCatalogHandler(repo repository.Repository, rvisSvc *rvis.Service) *CatalogHandler {
	return &CatalogHandler{repo: repo, rvis: rvisSvc}
}

func (h *CatalogHandler) ListCatalog(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	query := c.Query("q")
	limit := clampInt(queryInt(c, "limit", 20), 1, 100)
	cursor := c.Query("cursor")

	offset := 0
	if cursor != "" {
		if decoded, err := base64.RawURLEncoding.DecodeString(cursor); err == nil {
			offset, _ = strconv.Atoi(string(decoded))
		}
	}

	games, err := h.repo.ListCatalogGames(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to list catalog"})
		return
	}

	// Get user's owned games for isOwned check
	userGames, _ := h.repo.ListGamesByUserID(c.Request.Context(), auth.UserID)
	ownedMap := make(map[string]string, len(userGames))
	for _, ug := range userGames {
		ownedMap[ug.ExternalID] = ug.ID
	}

	// Filter by query if provided
	var filtered []domain.CatalogGameRow
	if query != "" {
		for _, g := range games {
			if containsIgnoreCase(g.Title, query) {
				filtered = append(filtered, g)
			}
		}
	} else {
		filtered = games
	}

	totalCount := len(filtered)

	// Apply pagination
	if offset >= len(filtered) {
		c.JSON(http.StatusOK, gin.H{"items": []gin.H{}, "nextCursor": nil, "totalCount": totalCount})
		return
	}
	end := offset + limit
	if end > len(filtered) {
		end = len(filtered)
	}
	page := filtered[offset:end]

	// Build CatalogItem response
	items := make([]gin.H, 0, len(page))
	for _, g := range page {
		ownedGameID := ownedMap[g.ExternalID]
		isOwned := ownedGameID != ""

		// Parse localizations
		var localizations gin.H
		if g.Localizations != nil {
			var loc map[string]interface{}
			if err := json.Unmarshal(g.Localizations, &loc); err == nil {
				localizations = gin.H(loc)
			}
		}

		item := gin.H{
			"externalId":    g.ExternalID,
			"title":         g.Title,
			"coverUrl":      g.CoverURL,
			"storeUrl":      g.StoreURL,
			"description":   g.Description,
			"publisher":     g.Publisher,
			"releaseDate":   g.ReleaseDate,
			"priceAmount":   g.PriceAmount,
			"priceCurrency": g.PriceCurrency,
			"platform":      g.Platform,
			"region":        g.Region,
			"localizations": localizations,
			"isOwned":       isOwned,
			"ownedGameId":   ownedGameID,
		}
		items = append(items, item)
	}

	var nextCursor *string
	if end < len(filtered) {
		s := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(end)))
		nextCursor = &s
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "nextCursor": nextCursor, "totalCount": totalCount})
}

func (h *CatalogHandler) GetCatalogGame(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	ctx := c.Request.Context()
	externalID := c.Param("externalId")

	game, err := h.repo.GetCatalogGameByExternalID(ctx, externalID)
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Catalog game not found"})
		return
	}

	// Parse localizations
	var localizations gin.H
	if game.Localizations != nil {
		var loc map[string]interface{}
		if err := json.Unmarshal(game.Localizations, &loc); err == nil {
			localizations = gin.H(loc)
		}
	}

	// Check if user owns this game
	var ownedGame *gin.H
	userGames, _ := h.repo.ListGamesByUserID(ctx, auth.UserID)
	for _, ug := range userGames {
		if ug.ExternalID == game.ExternalID {
			// Build enriched owned game
			snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(ctx, auth.UserID)
			corrections, _ := h.repo.ListCorrectionsByUserID(ctx, auth.UserID, nil)
			playtimeMap := domain.CalculateEffectivePlaytimeMap(snapshots, corrections)
			pt := playtimeMap[ug.ID]
			if pt.TotalMinutes == 0 && pt.Source == "" {
				pt = domain.EffectivePlaytime{GameID: ug.ID, Source: "official"}
			}
			og := gin.H{
				"id":        ug.ID,
				"externalId": ug.ExternalID,
				"title":     ug.Title,
				"coverUrl":  ug.CoverURL,
				"ownedAt":   ug.OwnedAt,
				"lastPlayedAt": ug.LastPlayedAt,
				"platform":      game.Platform,
				"region":        game.Region,
				"localizations": localizations,
				"priceAmount":  ug.PriceJPY,
				"priceCurrency": "JPY",
				"effectivePlaytime": gin.H{
					"totalMinutes":          pt.TotalMinutes,
					"officialMinutes":       pt.OfficialMinutes,
					"correctionDeltaMinutes": pt.CorrectionDeltaMinutes,
					"source":                pt.Source,
					"updatedAt":             pt.UpdatedAt,
				},
			}
			ownedGame = &og
			break
		}
	}

	// Player rating
	ur, sum, _ := h.repo.GetGameRatingSnapshot(ctx, auth.UserID, game.ExternalID)
	playerRating := gin.H{"userScore": 0, "averageScore": 0, "ratingCount": 0}
	if ur != nil {
		playerRating["userScore"] = ur.Score
	}
	if sum != nil && sum.RatingCount > 0 {
		playerRating["averageScore"] = sum.RatingTotal / float64(sum.RatingCount)
		playerRating["ratingCount"] = sum.RatingCount
	}

	result := gin.H{
		"externalId":    game.ExternalID,
		"title":         game.Title,
		"coverUrl":      game.CoverURL,
		"storeUrl":      game.StoreURL,
		"description":   game.Description,
		"publisher":     game.Publisher,
		"releaseDate":   game.ReleaseDate,
		"priceAmount":   game.PriceAmount,
		"priceCurrency": game.PriceCurrency,
		"platform":      game.Platform,
		"region":        game.Region,
		"localizations": localizations,
		"criticScore":   game.CriticScore,
		"playerRating":  playerRating,
		"ownedGame":     ownedGame,
		"corrections":   []gin.H{},
	}

	c.JSON(http.StatusOK, result)
}

func (h *CatalogHandler) RateCatalogGame(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	externalID := c.Param("externalId")
	var req struct {
		Score float64 `json:"score" binding:"required,min=0.1,max=10"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	ur, sum, err := h.repo.UpsertGameRating(c.Request.Context(), auth.UserID, externalID, req.Score, time.Now().UTC().Format(time.RFC3339))
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

func (h *CatalogHandler) GetCatalogStatus(c *gin.Context) {
	count, err := h.repo.CountCatalogGames(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get status"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"totalGames": count, "lastSynced": time.Now().UTC().Format(time.RFC3339)})
}

func (h *CatalogHandler) GetPrices(c *gin.Context) {
	externalID := c.Param("externalId")
	prices, err := h.repo.GetRegionalPrices(c.Request.Context(), externalID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get prices"})
		return
	}
	if prices == nil {
		c.JSON(http.StatusOK, gin.H{"prices": []interface{}{}})
		return
	}
	c.JSON(http.StatusOK, prices)
}

func (h *CatalogHandler) GetPriceMap(c *gin.Context) {
	externalID := c.Param("externalId")
	priceRow, err := h.repo.GetRegionalPrices(c.Request.Context(), externalID)
	if err != nil || priceRow == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "No price data found"})
		return
	}

	// Get game title for the map
	game, _ := h.repo.GetCatalogGameByExternalID(c.Request.Context(), externalID)
	title := "eShop Price Map"
	if game != nil && game.Title != "" {
		title = game.Title
	}

	var prices []domain.RegionalPrice
	if err := json.Unmarshal(priceRow.Prices, &prices); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse price data"})
		return
	}

	html, err := h.rvis.RenderPriceMap(prices, title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to render price map", "error": err.Error()})
		return
	}

	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
}

func containsIgnoreCase(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(len(s) > 0 && len(sub) > 0 && containsLower(s, sub)))
}

func containsLower(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			sc := s[i+j]
			tc := sub[j]
			if sc >= 'A' && sc <= 'Z' {
				sc += 32
			}
			if tc >= 'A' && tc <= 'Z' {
				tc += 32
			}
			if sc != tc {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
