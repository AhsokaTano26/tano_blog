package handler

import (
	"net/http"
	"net/mail"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/config"
	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
)

type AuthHandler struct {
	db           *gorm.DB
	cfg          *config.JWTConfig
	emailService *service.EmailService
}

func NewAuthHandler(db *gorm.DB, cfg *config.JWTConfig, emailService *service.EmailService) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg, emailService: emailService}
}

type LoginRequest struct {
	Username   string `json:"username" binding:"required"`
	Password   string `json:"password" binding:"required"`
	RememberMe bool   `json:"remember_me"`
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

	expiration := h.cfg.Expiration
	if req.RememberMe {
		expiration = h.cfg.RememberMeExpiration
	}

	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, h.cfg.Secret, expiration, user.TokenVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, expiration)

	// Notify user of new login (fire-and-forget)
	h.sendLoginNotify(c, user)

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
		UserID     string `json:"user_id" binding:"required"`
		Code       string `json:"code" binding:"required"`
		RememberMe bool   `json:"remember_me"`
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

	expiration := h.cfg.Expiration
	if req.RememberMe {
		expiration = h.cfg.RememberMeExpiration
	}

	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, h.cfg.Secret, expiration, user.TokenVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, expiration)

	// Notify user of new login (fire-and-forget)
	h.sendLoginNotify(c, user)

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
	// Increment token_version to invalidate all existing JWTs
	userID := c.GetString("user_id")
	if uid, err := uuid.Parse(userID); err == nil {
		h.db.Model(&model.User{}).Where("id = ?", uid).
			Update("token_version", gorm.Expr("token_version + 1"))
	}

	secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("jwt", "", -1, "/", "", secure, true)
	c.JSON(http.StatusOK, gin.H{"message": "已退出登录"})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

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

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		DisplayName *string `json:"display_name"`
		Email       *string `json:"email"`
		AvatarURL   *string `json:"avatar_url"`
		Bio         *string `json:"bio"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if input.DisplayName != nil {
		if len(*input.DisplayName) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "显示名称不能超过100个字符"})
			return
		}
		updates["display_name"] = *input.DisplayName
	}
	if input.Email != nil {
		if len(*input.Email) > 255 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱不能超过255个字符"})
			return
		}
		if *input.Email != "" {
			if _, err := mail.ParseAddress(*input.Email); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱格式不正确"})
				return
			}
		}
		updates["email"] = *input.Email
	}
	if input.AvatarURL != nil {
		if len(*input.AvatarURL) > 500 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "头像链接不能超过500个字符"})
			return
		}
		updates["avatar_url"] = *input.AvatarURL
	}
	if input.Bio != nil {
		updates["bio"] = *input.Bio
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有需要更新的内容"})
		return
	}

	if err := h.db.Model(&model.User{}).Where("id = ?", uid).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	var user model.User
	h.db.First(&user, uid)
	c.JSON(http.StatusOK, gin.H{
		"id":           user.ID,
		"username":     user.Username,
		"email":        user.Email,
		"display_name": user.DisplayName,
		"avatar_url":   user.AvatarURL,
		"bio":          user.Bio,
		"role":         user.Role,
	})
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入旧密码和新密码"})
		return
	}

	if len(input.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码不能少于8个字符"})
		return
	}

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	if !utils.CheckPassword(input.OldPassword, user.PasswordHash) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "旧密码错误"})
		return
	}

	hash, err := utils.HashPassword(input.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	if err := h.db.Model(&user).Update("password_hash", hash).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}

func (h *AuthHandler) TOTPSetup(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

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
	if err := h.db.Model(&user).Update("totp_secret", secret).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存密钥失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"secret":  secret,
		"qr_code": qrURL,
	})
}

func (h *AuthHandler) TOTPVerify(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

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
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Password string `json:"password"`
		TOTPCode string `json:"totp_code"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var user model.User
	if err := h.db.First(&user, uid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// Require password OR valid TOTP code to disable
	if input.Password != "" {
		if !utils.CheckPassword(input.Password, user.PasswordHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
			return
		}
	} else if input.TOTPCode != "" {
		if !utils.VerifyTOTP(user.TOTPSecret, input.TOTPCode) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码错误"})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入密码或验证码"})
		return
	}

	h.db.Model(&model.User{}).Where("id = ?", uid).
		Updates(map[string]interface{}{"totp_secret": "", "totp_enabled": false})

	c.JSON(http.StatusOK, gin.H{"message": "TOTP 已禁用"})
}

func (h *AuthHandler) PasskeyRegisterOptions(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	options, err := utils.BeginPasskeyRegistration(h.db, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建注册选项失败"})
		return
	}

	c.JSON(http.StatusOK, options)
}

func (h *AuthHandler) PasskeyRegisterVerify(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	rawBody, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求数据失败"})
		return
	}

	if err := utils.VerifyPasskeyRegistration(h.db, uid, rawBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Passkey 注册成功"})
}

func (h *AuthHandler) PasskeyLoginOptions(c *gin.Context) {
	options, err := utils.BeginPasskeyLogin(h.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建登录选项失败"})
		return
	}
	c.JSON(http.StatusOK, options)
}

func (h *AuthHandler) PasskeyLoginVerify(c *gin.Context) {
	rawBody, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求数据失败"})
		return
	}

	userID, err := utils.VerifyPasskeyLogin(h.db, rawBody)
	if err != nil {
		utils.LogError("passkey login verify failed", "error", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Passkey 验证失败"})
		return
	}

	var user model.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户失败"})
		return
	}

	token, err := utils.GenerateJWTWithVersion(user.ID, user.Username, user.Role, h.cfg.Secret, h.cfg.Expiration, user.TokenVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	setJWTCookie(c, token, h.cfg.Expiration)

	// Notify user of new login (fire-and-forget)
	h.sendLoginNotify(c, user)

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
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var passkeys []model.Passkey
	h.db.Where("user_id = ?", uid).Select("id, nickname, created_at").Find(&passkeys)
	c.JSON(http.StatusOK, passkeys)
}

func (h *AuthHandler) ListUsers(c *gin.Context) {
	var users []model.User
	h.db.Select("id, username, display_name, avatar_url").Find(&users)
	c.JSON(http.StatusOK, gin.H{"items": users})
}

func (h *AuthHandler) DeletePasskey(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
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

func (h *AuthHandler) RenamePasskey(c *gin.Context) {
	userID := c.GetString("user_id")
	uid, err := uuid.Parse(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	passkeyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var input struct {
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Nickname == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "昵称不能为空"})
		return
	}

	result := h.db.Model(&model.Passkey{}).Where("id = ? AND user_id = ?", passkeyID, uid).Update("nickname", input.Nickname)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Passkey 不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入邮箱"})
		return
	}

	var user model.User
	if err := h.db.Where("email = ?", input.Email).First(&user).Error; err != nil {
		// Don't reveal if email exists
		c.JSON(http.StatusOK, gin.H{"message": "如果该邮箱已注册，重置链接将发送到您的邮箱"})
		return
	}

	// Generate reset token (valid for 1 hour)
	token, err := utils.GenerateJWT(user.ID, user.Username, "reset", h.cfg.Secret, 1*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成重置令牌失败"})
		return
	}

	// Store reset token in dedicated column (separate from TOTP secret)
	h.db.Model(&user).Update("reset_token", token)

	// Try to send email with reset link
	if h.emailService != nil && user.Email != "" {
		var cfg model.SiteConfig
		if err := h.db.Where("key = ?", "site_url").First(&cfg).Error; err == nil && cfg.Value != "" {
			resetLink := cfg.Value + "/admin/reset-password?token=" + token
			go h.emailService.SendPasswordResetEmail(user.Email, resetLink)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "如果该邮箱已注册，重置链接将发送到您的邮箱"})
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var input struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if len(input.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码不能少于8个字符"})
		return
	}

	// Parse token to get user ID
	claims, err := utils.ParseJWT(input.Token, h.cfg.Secret)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "重置链接无效或已过期"})
		return
	}

	if claims.Role != "reset" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的重置令牌"})
		return
	}

	var user model.User
	if err := h.db.First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	hash, err := utils.HashPassword(input.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	h.db.Model(&user).Updates(map[string]interface{}{
		"password_hash": hash,
		"reset_token":   "",
	})

	c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
}

// sendLoginNotify sends a login notification email to the user (fire-and-forget)
func (h *AuthHandler) sendLoginNotify(c *gin.Context, user model.User) {
	if h.emailService == nil || user.Email == "" {
		return
	}
	loginIP := c.ClientIP()
	loginTime := time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")
	go func() {
		defer func() {
			if r := recover(); r != nil {
				utils.LogError("panic in login notify", "error", r)
			}
		}()
		h.emailService.SendLoginNotifyEmail(user.Email, user.Username, loginIP, loginTime)
	}()
}

func setJWTCookie(c *gin.Context, token string, expiration time.Duration) {
	secure := c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie("jwt", token, int(expiration.Seconds()), "/", "", secure, true)
}
