package rawg

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// GameResult represents a game from the RAWG API.
type GameResult struct {
	ID             int     `json:"id"`
	Name           string  `json:"name"`
	Slug           string  `json:"slug"`
	Released       string  `json:"released"`
	BackgroundImage string `json:"background_image"`
	Metacritic     *int    `json:"metacritic"`
	Rating         float64 `json:"rating"`
	RatingsCount   int     `json:"ratings_count"`
	Platforms      []struct {
		Platform struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
			Slug string `json:"slug"`
		} `json:"platform"`
	} `json:"platforms"`
	Genres []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"genres"`
	Stores []struct {
		Store struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
			Slug string `json:"slug"`
		} `json:"store"`
	} `json:"stores"`
	ShortScreenshots []struct {
		ID  int    `json:"id"`
		Image string `json:"image"`
	} `json:"short_screenshots"`
}

// SearchResponse is the RAWG API search response.
type SearchResponse struct {
	Count    int          `json:"count"`
	Next     string       `json:"next"`
	Previous string       `json:"previous"`
	Results  []GameResult `json:"results"`
}

// Client is a rate-limited HTTP client for the RAWG API.
type Client struct {
	httpClient *http.Client
	apiKey     string
	rateLimit  time.Duration
	mu         sync.Mutex
	lastReq    time.Time
}

// NewClient creates a new RAWG API client.
func NewClient(apiKey string, rateLimit time.Duration) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		apiKey:     apiKey,
		rateLimit:  rateLimit,
	}
}

// IsConfigured returns true if the API key is set.
func (c *Client) IsConfigured() bool {
	return c.apiKey != ""
}

func (c *Client) waitRateLimit(ctx context.Context) error {
	c.mu.Lock()
	sleepFor := time.Duration(0)
	elapsed := time.Since(c.lastReq)
	if elapsed < c.rateLimit {
		sleepFor = c.rateLimit - elapsed
	}
	c.lastReq = time.Now().Add(sleepFor)
	c.mu.Unlock()

	if sleepFor > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(sleepFor):
		}
	}
	return nil
}

func (c *Client) doGet(ctx context.Context, fullURL string) ([]byte, error) {
	if err := c.waitRateLimit(ctx); err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("User-Agent", "NintendoGameTime/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("rawg request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("rawg read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("rawg API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	return body, nil
}

// ListGames fetches Nintendo Switch games with pagination.
func (c *Client) ListGames(ctx context.Context, page, pageSize int) (*SearchResponse, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("RAWG API key not configured")
	}

	u := "https://api.rawg.io/api/games"
	params := url.Values{
		"key":        {c.apiKey},
		"platforms":  {"7"}, // Nintendo Switch
		"ordering":   {"-metacritic,-rating"},
		"page":       {fmt.Sprintf("%d", page)},
		"page_size":  {fmt.Sprintf("%d", pageSize)},
	}
	fullURL := u + "?" + params.Encode()

	body, err := c.doGet(ctx, fullURL)
	if err != nil {
		return nil, err
	}

	var sr SearchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		return nil, fmt.Errorf("rawg parse error: %w", err)
	}
	return &sr, nil
}

// SearchAndScore searches for a game by title and returns its MetaCritic score.
func (c *Client) SearchAndScore(ctx context.Context, title string) (*int, error) {
	if !c.IsConfigured() {
		return nil, nil
	}

	u := "https://api.rawg.io/api/games"
	params := url.Values{
		"key":       {c.apiKey},
		"search":    {title},
		"platforms": {"7"},
		"page_size": {"3"},
	}
	fullURL := u + "?" + params.Encode()

	body, err := c.doGet(ctx, fullURL)
	if err != nil {
		return nil, err
	}

	var sr SearchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		return nil, fmt.Errorf("rawg parse error: %w", err)
	}

	for _, g := range sr.Results {
		if g.Metacritic != nil {
			return g.Metacritic, nil
		}
	}
	return nil, nil
}
