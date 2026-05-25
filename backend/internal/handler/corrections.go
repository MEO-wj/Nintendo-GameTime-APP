package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
)

type CorrectionsHandler struct {
	repo repository.Repository
}

func NewCorrectionsHandler(repo repository.Repository) *CorrectionsHandler {
	return &CorrectionsHandler{repo: repo}
}

func (h *CorrectionsHandler) CreateCorrection(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	var req struct {
		GameID  string `json:"gameId" binding:"required"`
		Type    string `json:"type" binding:"required,oneof=SET_TOTAL ADD_DELTA"`
		Minutes int    `json:"minutes" binding:"required"`
		Reason  string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}

	corr, err := h.repo.CreateCorrection(c.Request.Context(), auth.UserID, req.GameID, req.Type, req.Minutes, req.Reason, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create correction"})
		return
	}
	c.JSON(http.StatusOK, corr)
}

func (h *CorrectionsHandler) ListCorrections(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	var gameID *string
	if gid := c.Query("gameId"); gid != "" {
		gameID = &gid
	}

	corrs, err := h.repo.ListCorrectionsByUserID(c.Request.Context(), auth.UserID, gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to list corrections"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": corrs})
}

func (h *CorrectionsHandler) RevokeCorrection(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	corrID := c.Param("id")

	corr, err := h.repo.RevokeCorrection(c.Request.Context(), auth.UserID, corrID, time.Now().UTC().Format(time.RFC3339))
	if err != nil || corr == nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Correction not found or already revoked"})
		return
	}
	c.JSON(http.StatusOK, corr)
}
