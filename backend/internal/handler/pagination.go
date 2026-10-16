package handler

import (
	"github.com/gin-gonic/gin"
	"strconv"
)

func pagination(c *gin.Context, defaultSize, maxSize int) (int, int) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	size, err := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(defaultSize)))
	if err != nil || size < 1 || size > maxSize {
		size = defaultSize
	}
	// Avoid offset overflow from malformed or hostile page numbers.
	if page > 1_000_000 {
		page = 1_000_000
	}
	return page, size
}
