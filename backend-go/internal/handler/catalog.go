package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
)

type CatalogHandler struct {
	repo repository.Repository
}

func NewCatalogHandler(repo repository.Repository) *CatalogHandler {
	return &CatalogHandler{repo: repo}
}

func (h *CatalogHandler) ListCatalog(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	query := c.Query("query")
	limit := clampInt(queryInt(c, "limit", 20), 1, 100)

	games, err := h.repo.ListCatalogGames(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to list catalog"})
		return
	}

	// Filter by query if provided
	if query != "" {
		var filtered []interface{}
		for _, g := range games {
			if containsIgnoreCase(g.Title, query) {
				// Check if user owns this game
				owned := false
				userGames, _ := h.repo.ListGamesByUserID(c.Request.Context(), auth.UserID)
				for _, ug := range userGames {
					if ug.ExternalID == g.ExternalID {
						owned = true
						break
					}
				}
				filtered = append(filtered, gin.H{"game": g, "owned": owned})
				if len(filtered) >= limit {
					break
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{"items": filtered})
		return
	}

	// Return first N
	items := make([]interface{}, 0, limit)
	for i, g := range games {
		if i >= limit {
			break
		}
		items = append(items, gin.H{"game": g, "owned": false})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *CatalogHandler) GetCatalogGame(c *gin.Context) {
	externalID := c.Param("externalId")
	game, err := h.repo.GetCatalogGameByExternalID(c.Request.Context(), externalID)
	if err != nil || game == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Catalog game not found"})
		return
	}
	c.JSON(http.StatusOK, game)
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
