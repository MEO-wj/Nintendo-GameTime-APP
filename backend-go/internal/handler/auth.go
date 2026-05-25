package handler

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"nintendo-gametime/internal/config"
	"nintendo-gametime/internal/middleware"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/pkg/jwtutil"
)

type AuthHandler struct {
	repo   repository.Repository
	cfg    *config.Config
}

func NewAuthHandler(repo repository.Repository, cfg *config.Config) *AuthHandler {
	return &AuthHandler{repo: repo, cfg: cfg}
}

type sendCodeReq struct {
	Email string `json:"email" binding:"required,email"`
}

type registerReq struct {
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

type loginReq struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) SendCode(c *gin.Context) {
	var req sendCodeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	code, err := generateOTP()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to generate code"})
		return
	}
	expiresAt := time.Now().Add(time.Duration(h.cfg.OTPExpiresMin) * time.Minute)
	if err := h.repo.SaveAuthCode(c.Request.Context(), email, code, expiresAt.Format(time.RFC3339)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save code"})
		return
	}

	emailSent := false
	if h.cfg.SMTPHost != "" && h.cfg.SMTPUser != "" && h.cfg.SMTPPass != "" {
		if err := sendOTPEmail(h.cfg, email, code); err != nil {
			fmt.Printf("[AUTH] Failed to send OTP email to %s: %v\n", email, err)
		} else {
			emailSent = true
		}
	}

	resp := gin.H{
		"message":   "OTP generated",
		"expiresAt": expiresAt.Format(time.RFC3339),
		"emailSent": emailSent,
	}
	if !h.cfg.IsProduction() {
		resp["devCode"] = code
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	code := strings.TrimSpace(req.Code)

	// Verify OTP
	codeOK := false
	if !h.cfg.IsProduction() && code == h.cfg.OTPDevCode {
		codeOK = true
	} else {
		var err error
		codeOK, err = h.repo.ConsumeAuthCode(c.Request.Context(), email, code, time.Now().Format(time.RFC3339))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Verification failed"})
			return
		}
	}
	if !codeOK {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid or expired verification code"})
		return
	}

	// Check email uniqueness
	existing, _ := h.repo.GetUserByEmail(c.Request.Context(), email)
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"message": "Email already registered"})
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to hash password"})
		return
	}

	user, err := h.repo.CreateUserWithPassword(c.Request.Context(), email, string(hash))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user"})
		return
	}

	token, err := jwtutil.SignToken(user.ID, user.Email, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to sign token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "email": user.Email},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payload"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	user, err := h.repo.GetUserByEmail(c.Request.Context(), email)
	if err != nil || user == nil || user.PasswordHash == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid email or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid email or password"})
		return
	}

	token, err := jwtutil.SignToken(user.ID, user.Email, h.cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to sign token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  gin.H{"id": user.ID, "email": user.Email},
	})
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	auth := middleware.GetAuthUser(c)
	c.JSON(http.StatusOK, gin.H{"userId": auth.UserID, "email": auth.Email})
}

func generateOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()+100000), nil
}

// sendOTPEmail sends OTP via SMTP (stub — implement with net/smtp or gomail).
func sendOTPEmail(cfg *config.Config, to, code string) error {
	// TODO: implement SMTP sending
	fmt.Printf("[AUTH] Would send OTP %s to %s via %s:%d\n", code, to, cfg.SMTPHost, cfg.SMTPPort)
	return nil
}
