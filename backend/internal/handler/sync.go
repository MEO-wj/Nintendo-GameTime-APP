package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
)

type SyncHandler struct {
	repo repository.Repository
}

func NewSyncHandler(repo repository.Repository) *SyncHandler {
	return &SyncHandler{repo: repo}
}

func (h *SyncHandler) RunSync(c *gin.Context) {
	auth := middleware.GetAuthUser(c)

	job, err := h.repo.CreateSyncJob(c.Request.Context(), auth.UserID, "RUNNING", "MANUAL", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create sync job"})
		return
	}

	// TODO: trigger actual Nintendo sync in background goroutine
	go func() {
		time.Sleep(2 * time.Second) // simulate sync
		now := time.Now().UTC().Format(time.RFC3339)
		_ = h.repo.UpdateSyncJob(c.Request.Context(), job.ID, "SUCCESS", &now, nil, nil)
	}()

	c.JSON(http.StatusOK, gin.H{"jobId": job.ID, "status": "RUNNING"})
}

func (h *SyncHandler) GetStatus(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	job, err := h.repo.GetLatestSyncJobByUserID(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get status"})
		return
	}
	if job == nil {
		c.JSON(http.StatusOK, gin.H{"status": "NO_SYNC"})
		return
	}
	c.JSON(http.StatusOK, job)
}
