package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/pkg/crypto"
)

type AccountsHandler struct {
	repo repository.Repository
	cfg  *config.Config
}

func NewAccountsHandler(repo repository.Repository, cfg *config.Config) *AccountsHandler {
	return &AccountsHandler{repo: repo, cfg: cfg}
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
		"bound":        true,
		"region":       account.Region,
		"lastSyncAt":   account.LastSyncAt,
		"syncFailCount": account.SyncFailCount,
	})
}

func (h *AccountsHandler) BindNintendo(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	var req struct {
		SessionToken string `json:"sessionToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	encrypted, err := crypto.EncryptAES256GCM(h.cfg.EncryptionKey, req.SessionToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to encrypt session"})
		return
	}

	_, err = h.repo.UpsertNintendoAccount(c.Request.Context(), auth.UserID, encrypted, "UNKNOWN")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to bind account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Nintendo account bound successfully"})
}

func (h *AccountsHandler) GetPreferences(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	pref, err := h.repo.GetUserPreference(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get preferences"})
		return
	}
	if pref == nil {
		pref = &domain.UserPreference{UserID: auth.UserID, MarketMode: "GLOBAL"}
	}
	c.JSON(http.StatusOK, pref)
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
