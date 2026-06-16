package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/domain"
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
	ctx := c.Request.Context()

	games, err := h.repo.ListGamesByUserID(ctx, auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get summary"})
		return
	}

	snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(ctx, auth.UserID)
	corrections, _ := h.repo.ListCorrectionsByUserID(ctx, auth.UserID, nil)

	totalGames := len(games)
	totalPrice := 0
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	for _, g := range games {
		price := resolveGamePriceJPY(ctx, h.repo, &g)
		if price != nil {
			totalPrice += *price
		}
	}

	// Calculate playtime
	playtimeMap := domain.CalculateEffectivePlaytimeMap(snapshots, corrections)
	totalMinutes := 0
	dataSource := map[string]int{"official": 0, "corrected": 0, "manual-only": 0}
	for _, pt := range playtimeMap {
		totalMinutes += pt.TotalMinutes
		dataSource[pt.Source]++
	}

	// Recent 30 days playtime — delta-based from snapshots + corrections
	allSnapshots, _ := h.repo.ListOfficialSnapshotsByUserID(ctx, auth.UserID)
	recent30Minutes := calculateRecentPlaytime(allSnapshots, corrections, thirtyDaysAgo)

	// Last sync time
	var lastSyncAt *string
	if syncJob, _ := h.repo.GetLatestSyncJobByUserID(ctx, auth.UserID); syncJob != nil && syncJob.FinishedAt != nil {
		s := syncJob.FinishedAt.Format("2006-01-02T15:04:05Z")
		lastSyncAt = &s
	}

	c.JSON(http.StatusOK, gin.H{
		"totalGames":       totalGames,
		"totalMinutes":     totalMinutes,
		"totalPriceAmount": totalPrice,
		"priceCurrency":    "JPY",
		"recent30Minutes":  recent30Minutes,
		"lastSyncAt":       lastSyncAt,
		"dataSource":       dataSource,
	})
}

func (h *DashboardHandler) GetCharts(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	ctx := c.Request.Context()

	games, err := h.repo.ListGamesByUserID(ctx, auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get charts"})
		return
	}

	snapshots, _ := h.repo.GetLatestOfficialSnapshotsByUserID(ctx, auth.UserID)
	corrections, _ := h.repo.ListCorrectionsByUserID(ctx, auth.UserID, nil)

	playtimeMap := domain.CalculateEffectivePlaytimeMap(snapshots, corrections)

	// Build ranking data
	type rankItem struct {
		GameID  string `json:"gameId"`
		Title   string `json:"title"`
		Minutes int    `json:"minutes"`
	}
	var ranking []rankItem
	for _, g := range games {
		pt := playtimeMap[g.ID]
		ranking = append(ranking, rankItem{GameID: g.ExternalID, Title: g.Title, Minutes: pt.TotalMinutes})
	}
	// Sort by minutes desc
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
	type donutItem struct {
		Name    string `json:"name"`
		Value   int    `json:"value"`
		GameID  string `json:"gameId"`
	}
	donut := make([]donutItem, 0, 5)
	for i, r := range ranking {
		if i >= 5 {
			break
		}
		donut = append(donut, donutItem{Name: r.Title, Value: r.Minutes, GameID: r.GameID})
	}

	// Try R visualization
	charts, err := h.rvis.Render(donut, ranking)
	if err != nil {
		// Fallback: return raw data matching frontend DashboardCharts interface
		charts = gin.H{"donut": donut, "ranking": ranking}
	}

	c.JSON(http.StatusOK, charts)
}

// resolveGamePriceJPY returns the best available JPY price for a game.
// It first uses the game's own price_jpy, then falls back to regional_prices (JP region),
// then the catalog price_amount converted to JPY.
func resolveGamePriceJPY(ctx context.Context, repo repository.Repository, g *domain.GameRow) *int {
	if g.PriceJPY != nil {
		return g.PriceJPY
	}

	// Try regional_prices for explicit JPY entry
	if rp, err := repo.GetRegionalPrices(ctx, g.ExternalID); err == nil && rp != nil {
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
	if catalog, err := repo.GetCatalogGameByExternalID(ctx, g.ExternalID); err == nil && catalog != nil && catalog.PriceAmount != nil {
		jpyPrice := catalogPriceToJPY(*catalog.PriceAmount, catalog.PriceCurrency)
		return &jpyPrice
	}

	return nil
}

// catalogPriceToJPY converts a catalog price from its native currency to JPY (approximate).
func catalogPriceToJPY(amount float64, currency string) int {
	rate := 150.0 // USD → JPY default
	switch currency {
	case "EUR":
		rate = 163.0
	case "GBP":
		rate = 190.0
	case "HKD":
		rate = 19.0
	case "KRW":
		rate = 0.11
	case "AUD":
		rate = 98.0
	case "JPY":
		rate = 1.0
	}
	return int(amount * rate)
}

// calculateRecentPlaytime computes playtime in the last 30 days.
// It combines two sources:
//  1. Snapshot deltas — the difference in cumulative playtime between the latest
//     snapshot and the baseline snapshot from before the 30-day window.
//  2. Active corrections created within 30 days — these represent user-manual
//     playtime tracking when Nintendo sync is unavailable or incomplete.
func calculateRecentPlaytime(allSnapshots []domain.OfficialSnapshotRow, corrections []domain.CorrectionRow, thirtyDaysAgo time.Time) int {
	total := 0

	// ── Part 1: Snapshot deltas ──────────────────────────────────
	byGame := make(map[string][]domain.OfficialSnapshotRow)
	for _, s := range allSnapshots {
		if s.PlayedMinutes == nil {
			continue
		}
		byGame[s.GameID] = append(byGame[s.GameID], s)
	}

	for _, snaps := range byGame {
		// Sort by captured_at descending (newest first)
		sort.Slice(snaps, func(i, j int) bool {
			return snaps[i].CapturedAt.After(snaps[j].CapturedAt)
		})

		latest := snaps[0]
		if !latest.CapturedAt.After(thirtyDaysAgo) {
			continue
		}

		// Find the most recent snapshot from before the 30-day window
		var baselineMinutes int
		hasBaseline := false
		for i := 1; i < len(snaps); i++ {
			if snaps[i].CapturedAt.Before(thirtyDaysAgo) || snaps[i].CapturedAt.Equal(thirtyDaysAgo) {
				baselineMinutes = *snaps[i].PlayedMinutes
				hasBaseline = true
				break
			}
		}

		if hasBaseline {
			delta := *latest.PlayedMinutes - baselineMinutes
			if delta > 0 {
				total += delta
			}
		} else if len(snaps) >= 2 {
			earliest := snaps[len(snaps)-1]
			if earliest.CapturedAt.After(thirtyDaysAgo) {
				delta := *latest.PlayedMinutes - *earliest.PlayedMinutes
				if delta > 0 {
					total += delta
				}
			}
		} else {
			total += *latest.PlayedMinutes
		}
	}

	// ── Part 2: Corrections created within 30 days ───────────────
	// Track which games we already counted via snapshot deltas to avoid
	// double-counting: if a game has snapshot data, the correction is an
	// accuracy adjustment, not new playtime. Corrections matter most when
	// Nintendo sync is unavailable (no snapshots exist).
	hasSnapshotData := make(map[string]bool)
	for gid := range byGame {
		hasSnapshotData[gid] = true
	}

	for _, c := range corrections {
		if c.RevokedAt != nil || c.DeletedAt != nil {
			continue
		}
		if !c.CreatedAt.After(thirtyDaysAgo) {
			continue
		}

		switch c.Type {
		case "ADD_DELTA":
			// ADD_DELTA corrections explicitly add playtime — always count them
			total += c.Minutes
		case "SET_TOTAL":
			// SET_TOTAL sets a new cumulative baseline.
			// If we have snapshot data, the correction is an adjustment, not new playtime.
			// If no snapshot data, the full value represents the user's tracked time.
			if !hasSnapshotData[c.GameID] {
				// No snapshots — the SET_TOTAL IS the playtime
				// Only count what exceeds previously counted corrections for this game
				// (within the same 30-day window to avoid double-counting)
				prevTotal := 0
				for _, c2 := range corrections {
					if c2.GameID == c.GameID && c2.ID != c.ID &&
						c2.RevokedAt == nil && c2.DeletedAt == nil &&
						c2.CreatedAt.After(thirtyDaysAgo) && c2.CreatedAt.Before(c.CreatedAt) {
						prevTotal += c2.Minutes
					}
				}
				delta := c.Minutes - prevTotal
				if delta > 0 {
					total += delta
				}
			}
		}
	}

	return total
}
