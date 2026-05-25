package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"nintendo-gametime/internal/domain"
	"nintendo-gametime/internal/repository"
	"nintendo-gametime/pkg/jwtutil"
)

func AuthRequired(jwtSecret string, repo repository.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Missing or invalid token"})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		claims, err := jwtutil.VerifyToken(token, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Invalid or expired token"})
			return
		}
		// Verify user still exists
		user, err := repo.GetUserByID(c.Request.Context(), claims.UserID)
		if err != nil || user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "User not found"})
			return
		}
		c.Set("authUser", domain.AuthUser{UserID: claims.UserID, Email: claims.Email})
		c.Next()
	}
}

func InternalToken(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Internal-Token") != token {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "Invalid internal token"})
			return
		}
		c.Next()
	}
}

func ResponseTime() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		c.Header("X-Response-Time", time.Since(start).String())
	}
}

func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"message": "Internal server error"})
			}
		}()
		c.Next()
	}
}

func GetAuthUser(c *gin.Context) domain.AuthUser {
	v, ok := c.Get("authUser")
	if !ok {
		return domain.AuthUser{}
	}
	return v.(domain.AuthUser)
}
