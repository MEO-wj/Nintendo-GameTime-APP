package handler

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
)

type GamesHandler struct {
	repo repository.Repository
}

func NewGamesHandler(repo repository.Repository) *GamesHandler {
	return &GamesHandler{repo: repo}
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

	var nextCursor *string
	if next != nil {
		s := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(*next)))
		nextCursor = &s
	}

	_ = tab // TODO: apply tab-based sorting (owned/recent/top)
	c.JSON(http.StatusOK, gin.H{"items": items, "nextCursor": nextCursor})
}

func (h *GamesHandler) GetGame(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	gameID := c.Param("id")
	game, err := h.repo.GetGameByID(c.Request.Context(), auth.UserID, gameID)
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Game not found"})
		return
	}
	c.JSON(http.StatusOK, game)
}

func (h *GamesHandler) AddToLibrary(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	var req struct {
		ExternalID string `json:"externalId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	catalog, err := h.repo.GetCatalogGameByExternalID(c.Request.Context(), req.ExternalID)
	if err != nil || catalog == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Catalog game not found"})
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	game, err := h.repo.UpsertGame(c.Request.Context(), repository.UpsertGameInput{
		UserID:     auth.UserID,
		ExternalID: catalog.ExternalID,
		Title:      catalog.Title,
		CoverURL:   catalog.CoverURL,
		Region:     catalog.Region,
		Platform:   catalog.Platform,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to add game"})
		return
	}
	_ = now
	c.JSON(http.StatusOK, game)
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
	c.JSON(http.StatusOK, gin.H{"userRating": ur, "summary": sum})
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
