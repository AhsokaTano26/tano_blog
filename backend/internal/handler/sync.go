package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"tano_blog/backend/internal/service"
	"tano_blog/backend/internal/utils"
)

type SyncHandler struct {
	service *service.ReplicationService
}

func NewSyncHandler(syncService *service.ReplicationService) *SyncHandler {
	return &SyncHandler{service: syncService}
}

func (h *SyncHandler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, h.service.GetStatus())
}

// Run triggers a single sync in the background. A full transfer can take much
// longer than an HTTP request, so progress is exposed through Status instead.
func (h *SyncHandler) Run(c *gin.Context) {
	if h.service.GetStatus().Running {
		c.JSON(http.StatusConflict, gin.H{"error": "已有同步任务正在运行"})
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Hour)
		defer cancel()
		if err := h.service.RunNow(ctx); err != nil {
			utils.LogWarn("manual replication failed", "error", err)
		}
	}()
	c.JSON(http.StatusAccepted, gin.H{"message": "同步任务已启动"})
}
