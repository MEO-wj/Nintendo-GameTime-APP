package crawler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/services/eshop"
	"nintendo-gametime/internal/services/rawg"
)

// Status tracks the current state of the crawler.
type Status struct {
	LastDiscoverAt   *time.Time `json:"lastDiscoverAt"`
	LastPriceRefresh *time.Time `json:"lastPriceRefresh"`
	LastMetaRefresh  *time.Time `json:"lastMetaRefresh"`
	GamesDiscovered  int        `json:"gamesDiscovered"`
	PricesRefreshed  int        `json:"pricesRefreshed"`
	MetaScoresFound  int        `json:"metaScoresFound"`
	Errors           int        `json:"errors"`
	Running          bool       `json:"running"`
	LastError        string     `json:"lastError,omitempty"`
}

// Crawler orchestrates catalog discovery, price refresh, and MetaCritic fetching.
type Crawler struct {
	repo   repository.Repository
	eShop  *eshop.Client
	rawg   *rawg.Client
	cfg    *config.Config
	mu     sync.Mutex
	status Status
}

// New creates a new Crawler instance.
func New(repo repository.Repository, cfg *config.Config) *Crawler {
	return &Crawler{
		repo:  repo,
		eShop: eshop.NewClient(cfg.EshopRateLimit),
		rawg:  rawg.NewClient(cfg.RAWGAPIKey, cfg.EshopRateLimit),
		cfg:   cfg,
	}
}

// GetStatus returns the current crawler status.
func (c *Crawler) GetStatus() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

func (c *Crawler) setStatus(fn func(*Status)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	fn(&c.status)
}

// DiscoverGames uses RAWG API to discover Nintendo Switch games and upserts them into the catalog.
func (c *Crawler) DiscoverGames(ctx context.Context) error {
	if !c.rawg.IsConfigured() {
		log.Println("[Crawler] RAWG API key not configured, skipping game discovery")
		return nil
	}

	c.setStatus(func(s *Status) { s.Running = true; s.Errors = 0 })
	defer c.setStatus(func(s *Status) { s.Running = false })
	now := time.Now().UTC()

	log.Println("[Crawler] Starting Nintendo Switch game discovery via RAWG...")
	discovered := 0
	page := 1
	pageSize := 40 // RAWG max is 40

	for {
		resp, err := c.rawg.ListGames(ctx, page, pageSize)
		if err != nil {
			c.setStatus(func(s *Status) { s.Errors++; s.LastError = err.Error() })
			return fmt.Errorf("list games page=%d: %w", page, err)
		}

		if len(resp.Results) == 0 {
			break
		}

		for _, g := range resp.Results {
			if ctx.Err() != nil {
				return ctx.Err()
			}

			// Use RAWG ID as external ID (prefixed to distinguish from NSUID)
			externalID := fmt.Sprintf("rawg-%d", g.ID)

			// Build store URL from slug
			storeURL := fmt.Sprintf("https://www.nintendo.com/us/store/products/%s-switch/", g.Slug)

			// Cover image
			coverURL := g.BackgroundImage

			// Localizations: use name as both English and Chinese (RAWG doesn't have Chinese names)
			locMap := map[string]interface{}{
				"en":    map[string]interface{}{"title": g.Name},
				"zhHans": map[string]interface{}{"title": g.Name},
			}
			locJSON, err := json.Marshal(locMap)
			if err != nil {
				log.Printf("[Crawler] Failed to marshal localizations for %s: %v", g.Slug, err)
				locJSON = []byte(`{}`)
			}

			// Genre
			genre := ""
			if len(g.Genres) > 0 {
				genre = g.Genres[0].Name
			}

			// Publisher (not available from RAWG in basic response)
			publisher := ""

			_, err = c.repo.UpsertCatalogGame(ctx, domain.UpsertCatalogGameInput{
				ExternalID:    externalID,
				Title:         g.Name,
				SortOrder:     discovered,
				CoverURL:      &coverURL,
				StoreURL:      storeURL,
				Description:   nil,
				Publisher:     &publisher,
				ReleaseDate:   &g.Released,
				PriceAmount:   nil,
				PriceCurrency: "USD",
				Platform:      "Nintendo Switch",
				Region:        "US",
				Source:        "rawg",
				Localizations: json.RawMessage(locJSON),
				CriticScore:   g.Metacritic,
			})
			if err != nil {
				c.setStatus(func(s *Status) { s.Errors++ })
				log.Printf("[Crawler] Failed to upsert game %s: %v", g.Slug, err)
				continue
			}
			discovered++

			if genre != "" {
				_ = genre // available for future use
			}
		}

		log.Printf("[Crawler] Page %d: %d games (total: %d)", page, len(resp.Results), discovered)

		// Stop after collecting enough games or no more pages
		if resp.Next == "" || discovered >= 500 {
			break
		}
		page++
	}

	c.setStatus(func(s *Status) {
		s.GamesDiscovered = discovered
		t := now
		s.LastDiscoverAt = &t
	})
	log.Printf("[Crawler] Discovery complete: %d games found", discovered)
	return nil
}

// RefreshPrices refreshes regional prices for catalog games.
func (c *Crawler) RefreshPrices(ctx context.Context) error {
	c.setStatus(func(s *Status) { s.Running = true; s.Errors = 0 })
	defer c.setStatus(func(s *Status) { s.Running = false })
	now := time.Now().UTC()

	log.Println("[Crawler] Starting price refresh...")
	games, err := c.repo.ListCatalogGames(ctx)
	if err != nil {
		return fmt.Errorf("list catalog games: %w", err)
	}

	totalRefreshed := 0
	for _, g := range games {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := c.refreshSingleGamePrices(ctx, g.ExternalID); err != nil {
			c.setStatus(func(s *Status) { s.Errors++ })
			log.Printf("[Crawler] Failed to refresh prices for %s: %v", g.ExternalID, err)
			continue
		}
		totalRefreshed++
	}

	c.setStatus(func(s *Status) {
		s.PricesRefreshed = totalRefreshed
		t := now
		s.LastPriceRefresh = &t
	})
	log.Printf("[Crawler] Price refresh complete: %d games updated", totalRefreshed)
	return nil
}

// RefreshStalePrices refreshes prices that are older than the stale threshold.
func (c *Crawler) RefreshStalePrices(ctx context.Context) error {
	staleThreshold := time.Now().UTC().Add(-c.cfg.CrawlerStalePrice).Format(time.RFC3339)
	stale, err := c.repo.ListRegionalPricesByStaleness(ctx, staleThreshold, c.cfg.CrawlerBatchLimit)
	if err != nil {
		return fmt.Errorf("list stale prices: %w", err)
	}
	if len(stale) == 0 {
		log.Println("[Crawler] No stale prices to refresh")
		return nil
	}

	log.Printf("[Crawler] Refreshing %d stale prices...", len(stale))
	refreshed := 0
	for _, rp := range stale {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := c.refreshSingleGamePrices(ctx, rp.ExternalID); err != nil {
			c.setStatus(func(s *Status) { s.Errors++ })
			log.Printf("[Crawler] Failed to refresh stale price for %s: %v", rp.ExternalID, err)
			continue
		}
		refreshed++
	}

	c.setStatus(func(s *Status) {
		s.PricesRefreshed += refreshed
		t := time.Now().UTC()
		s.LastPriceRefresh = &t
	})
	log.Printf("[Crawler] Stale price refresh complete: %d updated", refreshed)
	return nil
}

func (c *Crawler) refreshSingleGamePrices(ctx context.Context, externalID string) error {
	// Try to extract NSUID from external ID for eShop price lookup
	// For RAWG games, we don't have NSUIDs, so skip eShop price fetch
	if strings.HasPrefix(externalID, "rawg-") {
		return nil
	}

	var prices []domain.RegionalPrice
	for _, region := range domain.SupportedRegions {
		lang := domain.RegionLangMap[region.Code]
		priceInfos, err := c.eShop.FetchPrices(ctx, region.Code, lang, []string{externalID})
		if err != nil {
			log.Printf("[Crawler] Price fetch error for %s in %s: %v", externalID, region.Code, err)
			continue
		}
		for _, pi := range priceInfos {
			prices = append(prices, domain.RegionalPrice{
				Region:          pi.Region,
				Country:         pi.Country,
				Label:           pi.Label,
				Currency:        pi.Currency,
				Price:           pi.Price,
				SalePrice:       pi.SalePrice,
				OnSale:          pi.OnSale,
				DiscountPercent: pi.DiscountPerc,
				FetchedAt:       time.Now().UTC().Format(time.RFC3339),
			})
		}
	}

	if len(prices) == 0 {
		return nil
	}

	pricesJSON, err := json.Marshal(prices)
	if err != nil {
		return fmt.Errorf("marshal prices: %w", err)
	}

	_, err = c.repo.UpsertRegionalPrices(ctx, externalID, pricesJSON, time.Now().UTC().Format(time.RFC3339))
	return err
}

// FetchMetaCriticScores fetches MetaCritic scores for catalog games without them.
func (c *Crawler) FetchMetaCriticScores(ctx context.Context) error {
	if !c.rawg.IsConfigured() {
		log.Println("[Crawler] RAWG API key not configured, skipping MetaCritic fetch")
		return nil
	}

	c.setStatus(func(s *Status) { s.Running = true; s.Errors = 0 })
	defer c.setStatus(func(s *Status) { s.Running = false })
	now := time.Now().UTC()

	log.Println("[Crawler] Starting MetaCritic score fetch...")
	games, err := c.repo.ListCatalogGames(ctx)
	if err != nil {
		return fmt.Errorf("list catalog games: %w", err)
	}

	found := 0
	for _, g := range games {
		if g.CriticScore != nil {
			continue
		}

		if ctx.Err() != nil {
			return ctx.Err()
		}

		score, err := c.rawg.SearchAndScore(ctx, g.Title)
		if err != nil {
			c.setStatus(func(s *Status) { s.Errors++ })
			log.Printf("[Crawler] MetaCritic fetch error for %s: %v", g.Title, err)
			continue
		}
		if score == nil {
			continue
		}

		coverURL := g.CoverURL
		if coverURL == nil {
			empty := ""
			coverURL = &empty
		}
		loc := g.Localizations
		if loc == nil {
			loc = json.RawMessage(`{}`)
		}

		_, err = c.repo.UpsertCatalogGame(ctx, domain.UpsertCatalogGameInput{
			ExternalID:    g.ExternalID,
			Title:         g.Title,
			SortOrder:     g.SortOrder,
			CoverURL:      coverURL,
			StoreURL:      g.StoreURL,
			Description:   g.Description,
			Publisher:     g.Publisher,
			ReleaseDate:   g.ReleaseDate,
			PriceAmount:   g.PriceAmount,
			PriceCurrency: g.PriceCurrency,
			Platform:      g.Platform,
			Region:        g.Region,
			Source:        g.Source,
			Localizations: loc,
			CriticScore:   score,
		})
		if err != nil {
			c.setStatus(func(s *Status) { s.Errors++ })
			log.Printf("[Crawler] Failed to update MetaCritic for %s: %v", g.ExternalID, err)
			continue
		}
		found++
	}

	c.setStatus(func(s *Status) {
		s.MetaScoresFound = found
		t := now
		s.LastMetaRefresh = &t
	})
	log.Printf("[Crawler] MetaCritic fetch complete: %d scores found", found)
	return nil
}

// StartScheduler runs the crawler on a schedule until the context is cancelled.
func (c *Crawler) StartScheduler(ctx context.Context) {
	log.Println("[Crawler] Scheduler starting...")

	// Initial run
	if err := c.DiscoverGames(ctx); err != nil {
		log.Printf("[Crawler] Initial discover failed: %v", err)
	}
	if err := c.RefreshPrices(ctx); err != nil {
		log.Printf("[Crawler] Initial price refresh failed: %v", err)
	}
	if err := c.FetchMetaCriticScores(ctx); err != nil {
		log.Printf("[Crawler] Initial MetaCritic fetch failed: %v", err)
	}

	discoverTicker := time.NewTicker(c.cfg.CrawlerDiscoverInt)
	priceTicker := time.NewTicker(c.cfg.CrawlerPriceRefreshInt)
	metaTicker := time.NewTicker(c.cfg.CatalogRefreshInt)
	defer discoverTicker.Stop()
	defer priceTicker.Stop()
	defer metaTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Crawler] Scheduler stopping")
			return
		case <-discoverTicker.C:
			if err := c.DiscoverGames(ctx); err != nil {
				log.Printf("[Crawler] Scheduled discover failed: %v", err)
			}
		case <-priceTicker.C:
			if err := c.RefreshStalePrices(ctx); err != nil {
				log.Printf("[Crawler] Scheduled price refresh failed: %v", err)
			}
		case <-metaTicker.C:
			if err := c.FetchMetaCriticScores(ctx); err != nil {
				log.Printf("[Crawler] Scheduled MetaCritic fetch failed: %v", err)
			}
		}
	}
}

// TriggerCatalogRefresh triggers a full catalog + price + MetaCritic refresh.
func (c *Crawler) TriggerCatalogRefresh(ctx context.Context) error {
	if err := c.DiscoverGames(ctx); err != nil {
		return err
	}
	if err := c.RefreshPrices(ctx); err != nil {
		return err
	}
	return c.FetchMetaCriticScores(ctx)
}
