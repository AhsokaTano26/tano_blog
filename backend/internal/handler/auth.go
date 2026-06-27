package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/utils"
)

type AuthHandler struct {
	db  *gorm.DB
	cfg *config.JWTConfig
}

func NewAuthHandler(db *gorm.DB, cfg *config.JWTConfig) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type TOTPVerifyRequest struct {
	Code string `json:"code" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名和密码"})
		return
	}

	var user model.User
	if err := h.db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	if !utils.CheckPassword(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	// If TOTP is enabled, require TOTP verification code
	if user.TOTPEnabled {
		c.JSON(http.StatusOK, gin.H{
			"totp_required": true,
			"user_id":       user.ID.String(),
		})
		return
	}

	token, err := utils.GenerateJWT(user.ID, user.Username, user.Role, h.cfg.Secret, h.cfg.Expiration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, h.cfg.Expiration)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"avatar_url":   user.AvatarURL,
			"role":         user.Role,
		},
	})
}

func (h *AuthHandler) LoginWithTOTP(c *gin.Context) {
	var req struct {
		UserID string `json:"user_id" binding:"required"`
		Code   string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
		return
	}

	if !user.TOTPEnabled || user.TOTPSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未启用 TOTP"})
		return
	}

	if !utils.VerifyTOTP(user.TOTPSecret, req.Code) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码错误"})
		return
	}

	token, err := utils.GenerateJWT(user.ID, user.Username, user.Role, h.cfg.Secret, h.cfg.Expiration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, h.cfg.Expiration)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"avatar_url":   user.AvatarURL,
			"role":         user.Role,
		},
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.SetCookie("jwt", "", -1, "/", "", true, true)
	c.JSON(http.StatusOK, gin.H{"message": "已退出登录"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":           user.ID,
		"username":     user.Username,
		"email":        user.Email,
		"display_name": user.DisplayName,
		"avatar_url":   user.AvatarURL,
		"bio":          user.Bio,
		"role":         user.Role,
		"totp_enabled": user.TOTPEnabled,
	})
}

func (h *AuthHandler) TOTPSetup(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	secret, qrURL, err := utils.GenerateTOTPSecret(user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成 TOTP 密钥失败"})
		return
	}

	// Store secret temporarily (not enabled yet)
	h.db.Model(&user).Update("totp_secret", secret)

	c.JSON(http.StatusOK, gin.H{
		"secret":  secret,
		"qr_code": qrURL,
	})
}

func (h *AuthHandler) TOTPVerify(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var req TOTPVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入验证码"})
		return
	}

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	if !utils.VerifyTOTP(user.TOTPSecret, req.Code) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码错误"})
		return
	}

	h.db.Model(&user).Update("totp_enabled", true)
	c.JSON(http.StatusOK, gin.H{"message": "TOTP 已启用"})
}

func (h *AuthHandler) TOTPDisable(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	h.db.Model(&model.User{}).Where("id = ?", uid).
		Updates(map[string]interface{}{"totp_secret": "", "totp_enabled": false})

	c.JSON(http.StatusOK, gin.H{"message": "TOTP 已禁用"})
}

func (h *AuthHandler) PasskeyRegisterOptions(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	options, err := utils.BeginPasskeyRegistration(h.db, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建注册选项失败"})
		return
	}

	c.JSON(http.StatusOK, options)
}

func (h *AuthHandler) PasskeyRegisterVerify(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var credential map[string]interface{}
	if err := c.ShouldBindJSON(&credential); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := utils.VerifyPasskeyRegistration(h.db, uid, credential); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Passkey 注册成功"})
}

func (h *AuthHandler) PasskeyLoginOptions(c *gin.Context) {
	options, err := utils.BeginPasskeyLogin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建登录选项失败"})
		return
	}
	c.JSON(http.StatusOK, options)
}

func (h *AuthHandler) PasskeyLoginVerify(c *gin.Context) {
	var credential map[string]interface{}
	if err := c.ShouldBindJSON(&credential); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	userID, err := utils.VerifyPasskeyLogin(h.db, credential)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Passkey 验证失败"})
		return
	}

	var user model.User
	h.db.First(&user, userID)

	token, err := utils.GenerateJWT(user.ID, user.Username, user.Role, h.cfg.Secret, h.cfg.Expiration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, h.cfg.Expiration)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"avatar_url":   user.AvatarURL,
			"role":         user.Role,
		},
	})
}

func (h *AuthHandler) ListPasskeys(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)

	var passkeys []model.Passkey
	h.db.Where("user_id = ?", uid).Select("id, nickname, created_at").Find(&passkeys)
	c.JSON(http.StatusOK, passkeys)
}

func (h *AuthHandler) DeletePasskey(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, _ := uuid.Parse(userID)
	passkeyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := h.db.Where("id = ? AND user_id = ?", passkeyID, uid).Delete(&model.Passkey{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Passkey 不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func setJWTCookie(c *gin.Context, token string, expiration time.Duration) {
	secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
	c.SetCookie("jwt", token, int(expiration.Seconds()), "/", "", secure, true)
}
