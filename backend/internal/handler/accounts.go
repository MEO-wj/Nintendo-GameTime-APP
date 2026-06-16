package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/services/nintendo"
	"nintendo-gametime/pkg/crypto"
)

type AccountsHandler struct {
	repo repository.Repository
	cfg  *config.Config
	nc   *nintendo.Client
}

func NewAccountsHandler(repo repository.Repository, cfg *config.Config) *AccountsHandler {
	return &AccountsHandler{repo: repo, cfg: cfg, nc: nintendo.NewClient()}
}

func (h *AccountsHandler) GetNintendo(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	account, err := h.repo.GetNintendoAccountByUserID(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get account"})
		return
	}
	if account == nil {
		c.JSON(http.StatusOK, gin.H{"bound": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"bound":         true,
		"region":        account.Region,
		"lastSyncAt":    account.LastSyncAt,
		"syncFailCount": account.SyncFailCount,
	})
}

func (h *AccountsHandler) BindNintendo(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	ctx := c.Request.Context()

	var req struct {
		// For new PKCE flow: frontend extracts session_token_code + state from redirect URL
		SessionTokenCode string `json:"sessionTokenCode"`
		State            string `json:"state"`
		// For backward compatibility: already has session_token
		SessionToken string `json:"sessionToken"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	var sessionToken string

	if req.SessionTokenCode != "" {
		// New PKCE flow: exchange session_token_code → session_token
		verifier := decodeState(req.State)
		if verifier == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "缺少验证码 (verifier)，请重新登录并复制完整 URL"})
			return
		}

		log.Printf("[Nintendo] Exchanging session_token_code (verifier prefix: %s...)", verifier[:10])
		st, err := h.nc.ExchangeSessionTokenCode(ctx, req.SessionTokenCode, verifier)
		if err != nil {
			log.Printf("[Nintendo] session_token_code exchange failed: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"message": "令牌交换失败，请确认复制了登录后的完整 URL: " + err.Error()})
			return
		}
		sessionToken = st
		log.Printf("[Nintendo] Successfully obtained session_token")
	} else if req.SessionToken != "" {
		// Legacy: user already has a session_token (or pasted it directly)
		sessionToken = req.SessionToken
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"message": "请粘贴 Nintendo 登录成功后的回调 URL"})
		return
	}

	// Encrypt and store the session_token
	encrypted, err := crypto.EncryptAES256GCM(h.cfg.EncryptionKey, sessionToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to encrypt session"})
		return
	}

	// Determine region: try a quick token exchange to get user info
	region := "UNKNOWN"
	tokens, tokErr := h.nc.ExchangeSessionToken(ctx, sessionToken)
	if tokErr == nil {
		userInfo, uiErr := h.nc.GetUserInfo(ctx, tokens.AccessToken)
		if uiErr == nil && userInfo != nil {
			if userInfo.Country == "JP" {
				region = "JP"
			} else {
				region = "GLOBAL"
			}
		}
	} else {
		log.Printf("[Nintendo] Could not determine region during bind: %v", tokErr)
	}

	_, err = h.repo.UpsertNintendoAccount(ctx, auth.UserID, encrypted, region)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to bind account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Nintendo account bound successfully", "region": region})
}

func (h *AccountsHandler) GetPreferences(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	pref, err := h.repo.GetUserPreference(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get preferences"})
		return
	}
	if pref == nil {
		pref = &domain.UserPreference{UserID: auth.UserID, MarketMode: "DOMESTIC"}
	}
	// ECB exchange rates (EUR-based)
	fx := gin.H{
		"base": "EUR",
		"rates": gin.H{
			"EUR": 1,
			"USD": 1.08,
			"GBP": 0.86,
			"JPY": 162.5,
			"CNY": 7.72,
			"HKD": 8.45,
			"KRW": 1430,
			"AUD": 1.65,
			"CAD": 1.47,
			"NZD": 1.78,
			"CHF": 0.94,
		},
	}
	c.JSON(http.StatusOK, gin.H{"preference": pref, "fx": fx})
}

func (h *AccountsHandler) UpdatePreferences(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	var req struct {
		MarketMode string `json:"marketMode" binding:"required,oneof=GLOBAL DOMESTIC"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	pref, err := h.repo.UpsertUserPreference(c.Request.Context(), auth.UserID, req.MarketMode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update preferences"})
		return
	}

	// Audit log
	details := `{"action":"update_market_mode","marketMode":"` + req.MarketMode + `"}`
	_ = h.repo.InsertAuditLog(c.Request.Context(), auth.UserID, "preference.update", []byte(details), time.Now().UTC().Format(time.RFC3339))

	c.JSON(http.StatusOK, pref)
}

// ─── PKCE helpers ───────────────────────────────────────────────

func generatePKCE() (verifier, challenge string, err error) {
	// Generate 32 random bytes for the code verifier
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	// Base64url-encode the verifier (without padding)
	verifier = base64.RawURLEncoding.EncodeToString(raw)

	// SHA-256 hash of the verifier for the challenge
	h := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(h[:])

	return verifier, challenge, nil
}

// encodeState packages a random state prefix with the PKCE verifier.
// Format: <random-8bytes>.<verifier>
func encodeState(verifier string) (string, error) {
	raw := make([]byte, 8)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	prefix := base64.RawURLEncoding.EncodeToString(raw)
	return prefix + "." + verifier, nil
}

// decodeState extracts the PKCE verifier from the state string.
func decodeState(state string) string {
	parts := strings.SplitN(state, ".", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return ""
}

// ─── Nintendo OAuth handlers ─────────────────────────────────────

// NintendoLogin redirects to Nintendo's OAuth authorization page.
// Uses PKCE + session_token_code flow as required by Nintendo.
func (h *AccountsHandler) NintendoLogin(c *gin.Context) {
	verifier, challenge, err := generatePKCE()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to generate PKCE"})
		return
	}

	state, err := encodeState(verifier)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to generate state"})
		return
	}

	log.Printf("[Nintendo] PKCE state=%s verifier=%s challenge=%s", state, verifier[:10]+"...", challenge[:10]+"...")

	u, _ := url.Parse("https://accounts.nintendo.com/connect/1.0.0/authorize")
	q := u.Query()
	q.Set("client_id", "71b963c1b7b6d119")
	q.Set("redirect_uri", "npf71b963c1b7b6d119://auth")
	q.Set("response_type", "session_token_code")
	q.Set("scope", "openid user user.birthday user.mii user.screenName")
	q.Set("session_token_code_challenge", challenge)
	q.Set("session_token_code_challenge_method", "S256")
	q.Set("state", state)
	q.Set("theme", "login_form")
	u.RawQuery = q.Encode()

	c.Redirect(http.StatusFound, u.String())
}

// NintendoCallback handles the OAuth redirect from Nintendo.
// Since we use npf71b963c1b7b6d119://auth (custom scheme), browsers
// can't reach this endpoint directly. The user copies the redirect URL
// and pastes it into the frontend, which calls BindNintendo.
func (h *AccountsHandler) NintendoCallback(c *gin.Context) {
	sessionTokenCode := c.Query("session_token_code")
	state := c.Query("state")

	if sessionTokenCode == "" {
		c.Redirect(http.StatusFound, "/#/account?nintendo_error=no_token")
		return
	}

	// The browser can only reach this endpoint if redirect_uri is changed
	// to a server URL, which Nintendo does not allow for this client_id.
	c.Redirect(http.StatusFound, "/#/account?nintendo_code="+sessionTokenCode+"&nintendo_state="+state)
}
