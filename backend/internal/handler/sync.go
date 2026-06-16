package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/internal/services/nintendo"
	"nintendo-gametime/pkg/crypto"
)

type SyncHandler struct {
	repo repository.Repository
	cfg  *config.Config
	nc   *nintendo.Client
}

func NewSyncHandler(repo repository.Repository, cfg *config.Config) *SyncHandler {
	return &SyncHandler{repo: repo, cfg: cfg, nc: nintendo.NewClient()}
}

// RunSync triggers a full Nintendo account sync.
func (h *SyncHandler) RunSync(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	ctx := c.Request.Context()

	// Find the user's bound Nintendo account
	account, err := h.repo.GetNintendoAccountByUserID(ctx, auth.UserID)
	if err != nil || account == nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "未绑定 Nintendo 账号，请先在个人中心绑定"})
		return
	}

	// Decrypt session token
	sessionToken, err := crypto.DecryptAES256GCM(h.cfg.EncryptionKey, account.EncryptedSession)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "无法解密会话令牌，请重新绑定账号"})
		return
	}

	// Create sync job
	job, err := h.repo.CreateSyncJob(ctx, auth.UserID, "RUNNING", "MANUAL", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "无法创建同步任务"})
		return
	}

	// Run sync in background
	go h.performSync(auth.UserID, job.ID, sessionToken)

	c.JSON(http.StatusOK, gin.H{"jobId": job.ID, "status": "RUNNING"})
}

func (h *SyncHandler) performSync(userID, jobID, sessionToken string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	startTime := time.Now().UTC()

	// Step 1: Exchange session_token for access_token
	tokens, err := h.nc.ExchangeSessionToken(ctx, sessionToken)
	if err != nil {
		h.failJob(ctx, jobID, "token exchange failed: "+err.Error(), startTime)
		log.Printf("[Sync] Token exchange failed for user %s: %v", userID, err)
		return
	}

	// Step 2: Get user info (region, nickname)
	userInfo, err := h.nc.GetUserInfo(ctx, tokens.AccessToken)
	if err != nil {
		h.failJob(ctx, jobID, "user info fetch failed: "+err.Error(), startTime)
		log.Printf("[Sync] User info fetch failed for user %s: %v", userID, err)
		return
	}

	// Update Nintendo account region
	region := mapRegion(userInfo.Country)
	nowStr := time.Now().UTC().Format(time.RFC3339)
	if updateErr := h.repo.UpdateNintendoSyncState(ctx, userID, &nowStr, nil); updateErr != nil {
		log.Printf("[Sync] Failed to update sync state: %v", updateErr)
	}
	// Re-bind with updated region
	encrypted, encErr := crypto.EncryptAES256GCM(h.cfg.EncryptionKey, sessionToken)
	if encErr == nil {
		h.repo.UpsertNintendoAccount(ctx, userID, encrypted, region)
	}

	// Step 3: Get play history
	games, err := h.nc.GetPlayHistory(ctx, tokens.AccessToken)
	if err != nil {
		h.failJob(ctx, jobID, "play history fetch failed: "+err.Error(), startTime)
		log.Printf("[Sync] Play history fetch failed for user %s: %v", userID, err)
		return
	}

	log.Printf("[Sync] Fetched %d played games for user %s", len(games), userID)

	// Step 4: Upsert games and create snapshots
	now := time.Now().UTC().Format(time.RFC3339)
	syncedCount := 0
	for _, g := range games {
		coverURL := g.ImageURL
		if coverURL == "" {
			coverURL = ""
		}
		coverPtr := &coverURL
		if coverURL == "" {
			coverPtr = nil
		}

		game, err := h.repo.UpsertGame(ctx, repository.UpsertGameInput{
			UserID:       userID,
			ExternalID:   g.TitleID,
			Title:        g.TitleName,
			CoverURL:     coverPtr,
			Region:       region,
			Platform:     "SWITCH",
			OwnedAt:      strPtr(g.FirstPlayedAt),
			LastPlayedAt: strPtr(g.LastPlayedAt),
		})
		if err != nil {
			log.Printf("[Sync] Failed to upsert game %s: %v", g.TitleID, err)
			continue
		}

		// Create a snapshot record
		rawPayload, _ := json.Marshal(g)
		_, snapErr := h.repo.InsertOfficialSnapshot(ctx, userID, game.ID, &g.TotalPlayTime, rawPayload, now)
		if snapErr != nil {
			log.Printf("[Sync] Failed to insert snapshot for %s: %v", g.TitleID, snapErr)
		}
		syncedCount++
	}

	log.Printf("[Sync] Synced %d/%d games for user %s", syncedCount, len(games), userID)

	// Mark job as successful
	durationMs := int(time.Since(startTime).Milliseconds())
	finishedAt := time.Now().UTC().Format(time.RFC3339)
	if err := h.repo.UpdateSyncJob(ctx, jobID, "SUCCESS", &finishedAt, &durationMs, nil); err != nil {
		log.Printf("[Sync] Failed to update job status: %v", err)
	}
}

func (h *SyncHandler) failJob(ctx context.Context, jobID, errMsg string, startTime time.Time) {
	errSummary := errMsg
	durationMs := int(time.Since(startTime).Milliseconds())
	finishedAt := time.Now().UTC().Format(time.RFC3339)
	if err := h.repo.UpdateSyncJob(ctx, jobID, "FAILED", &finishedAt, &durationMs, &errSummary); err != nil {
		log.Printf("[Sync] Failed to update job status: %v", err)
	}
}

func (h *SyncHandler) GetStatus(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	job, err := h.repo.GetLatestSyncJobByUserID(c.Request.Context(), auth.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to get status"})
		return
	}
	if job == nil {
		c.JSON(http.StatusOK, gin.H{"status": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": job})
}

func mapRegion(country string) string {
	jpCountries := map[string]bool{"JP": true}
	if jpCountries[country] {
		return "JP"
	}
	return "GLOBAL"
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
