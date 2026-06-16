package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/services/crawler"
)

// CrawlerHandler exposes HTTP endpoints for the crawler.
type CrawlerHandler struct {
	crawler *crawler.Crawler
}

// NewCrawlerHandler creates a new CrawlerHandler.
func NewCrawlerHandler(c *crawler.Crawler) *CrawlerHandler {
	return &CrawlerHandler{crawler: c}
}

func (h *CrawlerHandler) triggerAsync(c *gin.Context, name string, fn func(context.Context) error) {
	status := h.crawler.GetStatus()
	if status.Running {
		c.JSON(http.StatusConflict, gin.H{"message": "Crawler is already running"})
		return
	}

	go func() {
		if err := fn(context.Background()); err != nil {
			// Error is logged inside the crawler methods
			_ = err
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{"message": name + " triggered"})
}

// TriggerDiscover starts the HK eShop game discovery.
func (h *CrawlerHandler) TriggerDiscover(c *gin.Context) {
	h.triggerAsync(c, "Game discovery", h.crawler.DiscoverGames)
}

// TriggerPrices starts the price refresh.
func (h *CrawlerHandler) TriggerPrices(c *gin.Context) {
	h.triggerAsync(c, "Price refresh", h.crawler.RefreshPrices)
}

// TriggerMetaCritic starts the MetaCritic score fetch.
func (h *CrawlerHandler) TriggerMetaCritic(c *gin.Context) {
	h.triggerAsync(c, "MetaCritic fetch", h.crawler.FetchMetaCriticScores)
}

// TriggerCatalogRefresh starts a full catalog refresh (discover + prices + MetaCritic).
func (h *CrawlerHandler) TriggerCatalogRefresh(c *gin.Context) {
	h.triggerAsync(c, "Catalog refresh", h.crawler.TriggerCatalogRefresh)
}

// GetStatus returns the current crawler status.
func (h *CrawlerHandler) GetStatus(c *gin.Context) {
	c.JSON(http.StatusOK, h.crawler.GetStatus())
}
