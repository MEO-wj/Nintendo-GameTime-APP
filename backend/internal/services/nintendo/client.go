package nintendo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client calls Nintendo's web API to fetch play history.
// Based on community-documented API endpoints used by the Nintendo Switch Online app.
type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{httpClient: &http.Client{Timeout: 20 * time.Second}}
}

// Tokens holds the OAuth tokens returned by Nintendo after session_token exchange.
type Tokens struct {
	AccessToken  string `json:"access_token"`
	IDToken      string `json:"id_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
}

// UserInfo holds basic Nintendo Account profile data.
type UserInfo struct {
	ID         string `json:"id"`
	NintendoID string `json:"nintendoId"`
	Nickname   string `json:"nickname"`
	Country    string `json:"country"`
	Language   string `json:"language"`
	Birthday   string `json:"birthday"`
	Region     string `json:"region"`
}

// PlayedGame represents a game entry from Nintendo's play history API.
type PlayedGame struct {
	TitleID       string `json:"title_id"`
	TitleName     string `json:"title_name"`
	ImageURL      string `json:"image_url"`
	TotalPlayTime int    `json:"total_play_time"` // in minutes
	FirstPlayedAt string `json:"first_played_at"`
	LastPlayedAt  string `json:"last_played_at"`
}

// ─── Token exchange ────────────────────────────────────────────

// ExchangeSessionTokenCode swaps a session_token_code (from OAuth callback)
// plus its PKCE verifier for a session_token.
func (c *Client) ExchangeSessionTokenCode(ctx context.Context, sessionTokenCode, verifier string) (string, error) {
	form := url.Values{
		"client_id":                     {"71b963c1b7b6d119"},
		"session_token_code":           {sessionTokenCode},
		"session_token_code_verifier":  {verifier},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://accounts.nintendo.com/connect/1.0.0/api/session_token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "OnlineLounge/2.2.0 NASDKAPI Android")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Platform", "Android")
	req.Header.Set("X-ProductVersion", "2.2.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("session_token_code exchange: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("session_token_code exchange returned %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var out struct {
		SessionToken string `json:"session_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("parse session_token response: %w", err)
	}
	if out.SessionToken == "" {
		return "", fmt.Errorf("session_token not found in response: %s", truncate(string(body), 200))
	}
	return out.SessionToken, nil
}

// ExchangeSessionToken swaps a session_token for OAuth tokens (access_token + id_token).
// sessionToken is obtained by exchanging the session_token_code first.
func (c *Client) ExchangeSessionToken(ctx context.Context, sessionToken string) (*Tokens, error) {
	form := url.Values{
		"client_id":     {"71b963c1b7b6d119"},
		"session_token": {sessionToken},
		"grant_type":    {"urn:ietf:params:oauth:grant-type:jwt-bearer-session-token"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://accounts.nintendo.com/connect/1.0.0/api/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "com.nintendo.znca/2.2.0 (Android/14)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange returned %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var tok Tokens
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}
	return &tok, nil
}

// ─── User info ─────────────────────────────────────────────────

// GetUserInfo fetches the authenticated user's profile.
func (c *Client) GetUserInfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.accounts.nintendo.com/2.0.0/users/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("User-Agent", "com.nintendo.znca/2.2.0 (Android/14)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("user info request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("user info returned %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var u UserInfo
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("parse user info: %w", err)
	}
	return &u, nil
}

// ─── Play history ──────────────────────────────────────────────

type playHistoryResp struct {
	PlayHistories []struct {
		TitleID       string `json:"titleId"`
		TitleName     string `json:"titleName"`
		ImageURL      string `json:"imageUrl"`
		TotalPlayTime int    `json:"totalPlayTime"`
		FirstPlayedAt string `json:"firstPlayedAt"`
		LastPlayedAt  string `json:"lastPlayedAt"`
	} `json:"playHistories"`
}

// GetPlayHistory fetches the user's recently played games with playtime.
// Uses the Nintendo Switch Online app's internal API.
func (c *Client) GetPlayHistory(ctx context.Context, accessToken string) ([]PlayedGame, error) {
	// First, get a "web service" token for the Nintendo API gateway
	webToken, err := c.getWebServiceToken(ctx, accessToken)
	if err != nil {
		return nil, fmt.Errorf("web service token: %w", err)
	}

	// Call the play history endpoint
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api-lp1.znc.srv.nintendo.net/v3/Game/ListPlayedGames",
		strings.NewReader(`{"language":"en-US"}`))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+webToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "com.nintendo.znca/2.2.0 (Android/14)")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Platform", "Android")
	req.Header.Set("X-ProductVersion", "2.2.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("play history request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("play history returned %d: %s", resp.StatusCode, truncate(string(body), 300))
	}

	var hist playHistoryResp
	if err := json.Unmarshal(body, &hist); err != nil {
		return nil, fmt.Errorf("parse play history: %w", err)
	}

	var games []PlayedGame
	for _, h := range hist.PlayHistories {
		games = append(games, PlayedGame{
			TitleID:       h.TitleID,
			TitleName:     h.TitleName,
			ImageURL:      h.ImageURL,
			TotalPlayTime: h.TotalPlayTime,
			FirstPlayedAt: h.FirstPlayedAt,
			LastPlayedAt:  h.LastPlayedAt,
		})
	}
	return games, nil
}

// getWebServiceToken exchanges the OAuth access_token for a service-specific token
// that can access Nintendo's game-data API gateway.
func (c *Client) getWebServiceToken(ctx context.Context, accessToken string) (string, error) {
	form := url.Values{
		"client_id":    {"71b963c1b7b6d119"},
		"grant_type":   {"urn:ietf:params:oauth:grant-type:jwt-bearer-session-token"},
		"id_token":     {accessToken},
		"scope":        {"openid user user.birthday user.mii user.screenName"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://accounts.nintendo.com/connect/1.0.0/api/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "com.nintendo.znca/2.2.0 (Android/14)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("web token request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("web token returned %d: %s", resp.StatusCode, truncate(string(body), 200))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("parse web token: %w", err)
	}

	// The web service token is stored in id_token or access_token
	if tok.AccessToken != "" {
		return tok.AccessToken, nil
	}
	return tok.IDToken, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
