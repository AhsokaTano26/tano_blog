package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"tano_blog/backend/internal/model"
	"tano_blog/backend/internal/repository"
)

type CommenterHandler struct {
	blockRepo *repository.CommenterBlockRepo
	db        *gorm.DB
}

func NewCommenterHandler(db *gorm.DB) *CommenterHandler {
	return &CommenterHandler{
		blockRepo: repository.NewCommenterBlockRepo(db),
		db:        db,
	}
}

func (h *CommenterHandler) Block(c *gin.Context) {
	var input struct {
		Email     string `json:"email"`
		IPAddress string `json:"ip_address"`
		Reason    string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if input.Email == "" && input.IPAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供邮箱或IP地址"})
		return
	}

	adminID, _ := c.Get("user_id")
	uid, _ := uuid.Parse(adminID.(string))

	block := model.CommenterBlock{
		Email:     input.Email,
		IPAddress: input.IPAddress,
		Reason:    input.Reason,
		CreatedBy: uid,
	}
	if err := h.blockRepo.Create(&block); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已封禁"})
}

func (h *CommenterHandler) Unblock(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.blockRepo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已解封"})
}

func (h *CommenterHandler) ListBlocks(c *gin.Context) {
	page := parseInt(c.Query("page"), 1)
	pageSize := parseInt(c.Query("page_size"), 20)
	items, total, err := h.blockRepo.List(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}

func (h *CommenterHandler) ListCommenterComments(c *gin.Context) {
	email := c.Query("email")
	ip := c.Query("ip_address")
	if email == "" && ip == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供邮箱或IP地址"})
		return
	}
	page := parseInt(c.Query("page"), 1)
	pageSize := parseInt(c.Query("page_size"), 20)
	items, total, err := h.blockRepo.ListCommentsByEmailOrIP(email, ip, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": total,
		"page":  page,
		"size":  pageSize,
	})
}
