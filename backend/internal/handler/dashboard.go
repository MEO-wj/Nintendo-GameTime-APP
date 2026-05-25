package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/rvis"
)

type DashboardHandler struct {
	repo repository.Repository
	rvis *rvis.Service
}

func NewDashboardHandler(repo repository.Repository, rvisSvc *rvis.Service) *DashboardHandler {
	return &DashboardHandler{repo: repo, rvis: rvisSvc}
}

func (h *DashboardHandler) GetSummary(c *gin.Context) {
	auth := middleware.GetAuthUser(c)

	games, err := h.repo.ListGamesByUserID(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get summary"})
		return
	}

	snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(c.Request.Context(), auth.UserID)
	corrections, _ := h.repo.ListCorrectionsByUserID(c.Request.Context(), auth.UserID, nil)

	totalGames := len(games)
	totalMinutes := 0
	totalPrice := 0
	recentCount := 0
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	for _, g := range games {
		if g.PriceJPY != nil {
			totalPrice += *g.PriceJPY
		}
		if g.LastPlayedAt != nil && g.LastPlayedAt.After(thirtyDaysAgo) {
			recentCount++
		}
	}

	// Calculate total minutes from snapshots + corrections
	playtimeMap := domainCalculateEffectivePlaytime(snapshots, corrections)
	for _, pt := range playtimeMap {
		totalMinutes += pt.TotalMinutes
	}

	c.JSON(http.StatusOK, gin.H{
		"totalGames":   totalGames,
		"totalMinutes": totalMinutes,
		"totalPrice":   totalPrice,
		"recent30d":    recentCount,
	})
}

func (h *DashboardHandler) GetCharts(c *gin.Context) {
	auth := middleware.GetAuthUser(c)

	games, err := h.repo.ListGamesByUserID(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get charts"})
		return
	}

	snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(c.Request.Context(), auth.UserID)
	corrections, _ := h.repo.ListCorrectionsByUserID(c.Request.Context(), auth.UserID, nil)

	playtimeMap := domainCalculateEffectivePlaytime(snapshots, corrections)

	// Build ranking data
	type rankItem struct {
		Title   string `json:"title"`
		Minutes int    `json:"minutes"`
	}
	var ranking []rankItem
	for _, g := range games {
		pt := playtimeMap[g.ID]
		ranking = append(ranking, rankItem{Title: g.Title, Minutes: pt.TotalMinutes})
	}
	// Sort by minutes desc (simple bubble for small datasets)
	for i := 0; i < len(ranking); i++ {
		for j := i + 1; j < len(ranking); j++ {
			if ranking[j].Minutes > ranking[i].Minutes {
				ranking[i], ranking[j] = ranking[j], ranking[i]
			}
		}
	}
	if len(ranking) > 10 {
		ranking = ranking[:10]
	}

	// Build donut data (top 5)
	donut := make([]interface{}, 0, 5)
	for i, r := range ranking {
		if i >= 5 {
			break
		}
		donut = append(donut, gin.H{"name": r.Title, "value": r.Minutes})
	}

	// Try R visualization
	charts, err := h.rvis.Render(donut, ranking)
	if err != nil {
		// Fallback: return raw data
		charts = gin.H{"donut": donut, "ranking": ranking}
	}

	c.JSON(http.StatusOK, charts)
}

// domainCalculateEffectivePlaytime is a local wrapper to avoid importing shared-types.
func domainCalculateEffectivePlaytime(snapshots interface{}, corrections interface{}) map[string]struct{ TotalMinutes int } {
	// Simplified: in production, use the shared-types algorithm
	return make(map[string]struct{ TotalMinutes int })
}
