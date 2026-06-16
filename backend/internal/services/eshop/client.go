package eshop

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SearchResult represents a single game from the Nintendo search API.
type SearchResult struct {
	NSUID       string  `json:"nsuid"`
	Title       string  `json:"title"`
	ProductCode string  `json:"product_code"`
	Slug        string  `json:"url"`
	BoxArt      string  `json:"box_art_image_url"`
	SalePrice   float64 `json:"sale_price"`
	OnSale      bool    `json:"on_sale"`
	ReleaseDate string  `json:"release_date"`
	Platform    string  `json:"platform"`
	Genre       string  `json:"genre"`
	Publisher   string  `json:"publisher"`
}

// SearchResponse is the inner response from Nintendo's search API.
type SearchResponse struct {
	Results []SearchResult `json:"docs"`
	Total   int            `json:"numFound"`
}

// PriceInfo represents price data for a game in a specific region.
type PriceInfo struct {
	NSUID        string
	Region       string
	Country      string
	Label        string
	Currency     string
	Price        float64
	SalePrice    *float64
	OnSale       bool
	DiscountPerc *int
}

// Client is a rate-limited HTTP client for the Nintendo eShop API.
type Client struct {
	httpClient *http.Client
	rateLimit  time.Duration
	mu         sync.Mutex
	lastReq    time.Time
}

// NewClient creates a new eShop API client.
func NewClient(rateLimit time.Duration) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		rateLimit:  rateLimit,
	}
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

func (c *Client) doRequest(ctx context.Context, req *http.Request) ([]byte, error) {
	if err := c.waitRateLimit(ctx); err != nil {
		return nil, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("User-Agent", "NintendoGameTime/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("eshop request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("eshop read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("eshop API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	return body, nil
}

// SearchGames searches for games in a specific region.
// Uses the Nintendo search API: https://search.nintendo.com/search/v1/games
func (c *Client) SearchGames(ctx context.Context, region, lang, keyword string, offset, limit int) (*SearchResponse, error) {
	u := "https://search.nintendo.com/search/v1/games"
	params := url.Values{}
	params.Set("country", region)
	params.Set("lang", lang)
	params.Set("limit", strconv.Itoa(limit))
	params.Set("offset", strconv.Itoa(offset))
	params.Set("fq", "platform:Nintendo Switch")
	if keyword != "" {
		params.Set("q", keyword)
	}
	fullURL := u + "?" + params.Encode()

	req, err := http.NewRequest(http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	body, err := c.doRequest(ctx, req)
	if err != nil {
		return nil, err
	}

	// Nintendo API returns double-wrapped: {"response": {"response": {"docs": [...], "numFound": N}}}
	// Try double unwrap first
	var doubleWrapper struct {
		Response struct {
			Response SearchResponse `json:"response"`
		} `json:"response"`
	}
	if err := json.Unmarshal(body, &doubleWrapper); err == nil && len(doubleWrapper.Response.Response.Results) > 0 {
		return &doubleWrapper.Response.Response, nil
	}

	// Try single unwrap
	var singleWrapper struct {
		Response SearchResponse `json:"response"`
	}
	if err := json.Unmarshal(body, &singleWrapper); err == nil && len(singleWrapper.Response.Results) > 0 {
		return &singleWrapper.Response, nil
	}

	// Try direct parsing
	var direct SearchResponse
	if err := json.Unmarshal(body, &direct); err == nil && len(direct.Results) > 0 {
		return &direct, nil
	}

	return nil, fmt.Errorf("eshop: unable to parse search response (body: %s)", string(body[:min(len(body), 500)]))
}

// stringFloat is a float64 that can be unmarshalled from a JSON string like "49.99".
type stringFloat float64

func (f *stringFloat) UnmarshalJSON(data []byte) error {
	// Try number first
	var num float64
	if err := json.Unmarshal(data, &num); err == nil {
		*f = stringFloat(num)
		return nil
	}
	// Try string
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("cannot parse %s as float or string", string(data))
	}
	if s == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fmt.Errorf("cannot parse %q as float: %w", s, err)
	}
	*f = stringFloat(parsed)
	return nil
}

// FetchPrices fetches prices for a list of NSUIDs in a specific region.
func (c *Client) FetchPrices(ctx context.Context, region, lang string, nsuids []string) ([]PriceInfo, error) {
	if len(nsuids) == 0 {
		return nil, nil
	}

	u := "https://ec.nintendo.com/api/" + region + "/" + lang + "/price"
	params := url.Values{}
	params.Set("nsuids", strings.Join(nsuids, ","))
	fullURL := u + "?" + params.Encode()

	req, err := http.NewRequest(http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	body, err := c.doRequest(ctx, req)
	if err != nil {
		return nil, err
	}

	// Price API returns amounts as strings ("49.99"), not numbers
	var priceResp struct {
		Prices []struct {
			NSUID        string      `json:"nsuid"`
			RegularPrice struct {
				Amount   stringFloat `json:"amount"`
				Currency string      `json:"currency"`
			} `json:"regular_price"`
			DiscountPrice *struct {
				Amount   stringFloat `json:"amount"`
				Currency string      `json:"currency"`
			} `json:"discount_price,omitempty"`
		} `json:"prices"`
	}
	if err := json.Unmarshal(body, &priceResp); err != nil {
		return nil, fmt.Errorf("eshop price parse error: %w (body: %s)", err, string(body[:min(len(body), 300)]))
	}

	// Find region info
	var regionInfo struct {
		Country  string
		Label    string
		Currency string
	}
	for _, r := range []struct{ Code, Country, Label, Currency string }{
		{"HK", "香港", "港区", "HKD"}, {"JP", "日本", "日区", "JPY"},
		{"US", "美国", "美区", "USD"}, {"GB", "英国", "英区", "GBP"},
		{"DE", "德国", "德区", "EUR"}, {"AU", "澳大利亚", "澳区", "AUD"},
		{"KR", "韩国", "韩区", "KRW"}, {"BR", "巴西", "巴西区", "BRL"},
		{"MX", "墨西哥", "墨区", "MXN"},
	} {
		if r.Code == region {
			regionInfo = struct{ Country, Label, Currency string }{r.Country, r.Label, r.Currency}
			break
		}
	}

	var results []PriceInfo
	for _, p := range priceResp.Prices {
		regularAmt := float64(p.RegularPrice.Amount)
		info := PriceInfo{
			NSUID:    p.NSUID,
			Region:   region,
			Country:  regionInfo.Country,
			Label:    regionInfo.Label,
			Currency: regionInfo.Currency,
			Price:    regularAmt,
		}
		if p.DiscountPrice != nil {
			saleAmt := float64(p.DiscountPrice.Amount)
			info.SalePrice = &saleAmt
			info.OnSale = true
			if regularAmt > 0 {
				pct := int((1 - saleAmt/regularAmt) * 100)
				info.DiscountPerc = &pct
			}
		}
		results = append(results, info)
	}
	return results, nil
}
