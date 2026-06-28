# Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin UI backup (download .zip) and restore (upload .zip) for all site data.

**Architecture:** BackupHandler exports all database tables via `db.Table("X").Find(&rows)` (map-based, bypasses `json:"-"` tag exclusion) and packages with uploads/ into a zip archive. Restore reverses: parse uploaded zip, truncate tables in GORM transaction, insert via raw SQL with maps, then extract files. Map-based approach ensures ALL fields (including sensitive ones with `json:"-"`) are included.

**Tech Stack:** Go 1.22+, Gin, GORM, `archive/zip`, `encoding/json`; Next.js 16 frontend

## Global Constraints

- Backup handler file: `backend/internal/handler/backup.go`
- Endpoints: `GET /api/v1/admin/backup` (download zip), `POST /api/v1/admin/restore` (upload multipart)
- Frontend: new tab "备份与恢复" in admin settings page
- Import uses `map[string]interface{}` queried via `db.Table("X").Find(&rows)` to capture ALL fields
- Export: `db.Table("X").Find(&rows)` scans into `[]map[string]interface{}` (handles UUID as string, time as time.Time, nil for nulls)
- Restore runs inside a GORM transaction with rollback; files extracted after commit
- 500MB upload limit for restore
- Truncate order drops children first (FK safe), insert order adds parents first

---

### Task 1: Create BackupHandler with Backup/Restore

**Files:**
- Create: `backend/internal/handler/backup.go`

- [ ] **Step 1: Create backup.go**

```go
package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type BackupHandler struct {
	db        *gorm.DB
	uploadDir string
}

func NewBackupHandler(db *gorm.DB, uploadDir string) *BackupHandler {
	return &BackupHandler{db: db, uploadDir: uploadDir}
}

type backupData struct {
	Version   string                              `json:"version"`
	CreatedAt string                              `json:"created_at"`
	Data      map[string][]map[string]interface{} `json:"data"`
}

// all backup tables in insertion-safe order (parents first)
var backupTables = []string{
	"users", "categories", "tags", "media_tags", "site_configs",
	"posts", "post_tags", "comments", "media", "media_tag_links",
	"passkeys", "post_revisions", "access_logs",
}

// truncate order: children first to avoid FK violations
var truncateOrder = []string{
	"post_revisions", "media_tag_links", "post_tags", "comments",
	"media", "media_tags", "posts", "passkeys", "categories", "tags",
	"site_configs", "access_logs", "users",
}

func (h *BackupHandler) Backup(c *gin.Context) {
	data := backupData{
		Version:   "1.0",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      make(map[string][]map[string]interface{}),
	}

	for _, table := range backupTables {
		var rows []map[string]interface{}
		if err := h.db.Table(table).Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("导出 %s 失败", table)})
			return
		}
		data.Data[table] = rows
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	prefix := fmt.Sprintf("backup-%s", time.Now().UTC().Format("2006-01-02"))

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化失败"})
		return
	}
	f, err := zw.Create(prefix + "/data.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建 zip 条目失败"})
		return
	}
	f.Write(jsonBytes)

	// Add uploads/ files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	filepath.Walk(uploadDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(uploadDir, path)
		if err != nil {
			return nil
		}
		f, err := zw.Create(prefix + "/uploads/" + rel)
		if err != nil {
			return nil
		}
		src, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer src.Close()
		io.Copy(f, src)
		return nil
	})

	zw.Close()

	filename := fmt.Sprintf("backup-%s.zip", time.Now().UTC().Format("2006-01-02"))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
```

- [ ] **Step 2: Add Restore method**

```go
func (h *BackupHandler) Restore(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传备份文件"})
		return
	}
	defer file.Close()

	if header.Size > 500*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件过大（最大 500MB）"})
		return
	}

	buf := new(bytes.Buffer)
	io.Copy(buf, file)

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ZIP 文件"})
		return
	}

	// Parse data.json
	var input backupData
	var fileList []*zip.File
	found := false
	for _, f := range zr.File {
		fileList = append(fileList, f)
		if filepath.Base(f.Name) == "data.json" {
			rc, err := f.Open()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "读取 data.json 失败"})
				return
			}
			jsonBytes, _ := io.ReadAll(rc)
			rc.Close()
			if err := json.Unmarshal(jsonBytes, &input); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "解析 data.json 失败"})
				return
			}
			found = true
		}
	}
	if !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "备份文件中缺少 data.json"})
		return
	}
	if input.Version == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的备份文件"})
		return
	}

	tx := h.db.Begin()

	// Truncate all tables (children first)
	for _, t := range truncateOrder {
		if err := tx.Exec(fmt.Sprintf("TRUNCATE TABLE %s CASCADE", t)).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("清空表 %s 失败", t)})
			return
		}
	}

	// Insert in dependency order (parents first)
	for _, table := range backupTables {
		rows, ok := input.Data[table]
		if !ok || len(rows) == 0 {
			continue
		}
		for _, row := range rows {
			cols := make([]string, 0, len(row))
			vals := make([]interface{}, 0, len(row))
			for k, v := range row {
				cols = append(cols, k)
				vals = append(vals, v)
			}
			placeholders := make([]string, len(cols))
			for i := range placeholders {
				placeholders[i] = "?"
			}
			sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table,
				strings.Join(cols, ","), strings.Join(placeholders, ","))
			if err := tx.Exec(sql, vals...).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("恢复 %s 失败: %v", table, err)})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交事务失败"})
		return
	}

	// Extract uploads/ files
	uploadDir := h.uploadDir
	if !filepath.IsAbs(uploadDir) {
		uploadDir, _ = filepath.Abs(uploadDir)
	}
	var fileErrors []string
	for _, f := range fileList {
		parts := strings.SplitN(f.Name, "/uploads/", 2)
		if len(parts) != 2 || parts[1] == "" {
			continue
		}
		rel := parts[1]
		targetPath := filepath.Join(uploadDir, rel)
		os.MkdirAll(filepath.Dir(targetPath), 0755)

		rc, err := f.Open()
		if err != nil {
			fileErrors = append(fileErrors, rel)
			continue
		}
		out, err := os.Create(targetPath)
		if err != nil {
			rc.Close()
			fileErrors = append(fileErrors, rel)
			continue
		}
		io.Copy(out, rc)
		rc.Close()
		out.Close()
	}

	result := gin.H{"message": "恢复完成"}
	if len(fileErrors) > 0 {
		result["warning"] = fmt.Sprintf("%d 个文件恢复失败", len(fileErrors))
	}
	c.JSON(http.StatusOK, result)
}
```

- [ ] **Step 3: Build and verify compilation**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
Expected: no errors
```

---

### Task 2: Register routes in main.go

**File:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add BackupHandler initialization after existing handlers** (after `accessLogHandler := handler.NewAccessLogHandler(db)`)

```go
backupHandler := handler.NewBackupHandler(db, cfg.Upload.Dir)
```

- [ ] **Step 2: Add routes inside the admin group** (after `admin.POST("/access-logs/clear", accessLogHandler.Clear)`)

```go
admin.GET("/backup", backupHandler.Backup)
admin.POST("/restore", backupHandler.Restore)
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/backend && go build ./...
Expected: no errors
```

---

### Task 3: Frontend API methods

**File:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add backup and restore methods inside the `admin` object**, after the accessLogs section, before the closing `},` for admin:

```typescript
backup: () => {
  window.open(`${API_BASE}/api/v1/admin/backup`, '_blank');
},
restore: async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/v1/admin/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': getCSRFToken() },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '恢复失败');
  }
  return res.json();
},
```

---

### Task 4: Frontend settings page — add backup/restore tab

**File:**
- Modify: `frontend/src/app/admin/settings/page.tsx`

- [ ] **Step 1: Add `Database`, `Download`, `Upload` to lucide-react imports**

Change the import line to include these icons:
```typescript
import { Save, Globe, FileText, Palette, MessageSquare, Code, Mail, User, Plus, Trash2, Database, Download, Upload } from 'lucide-react';
```

- [ ] **Step 2: Add `useRef` to React imports**

Change: `import { useState, useEffect } from 'react';` to `import { useState, useEffect, useRef } from 'react';`

- [ ] **Step 3: Add "备份与恢复" tab to the tabs array**

After `{ key: 'injection', label: '代码注入', icon: Code },`:
```typescript
{ key: 'backup', label: '备份与恢复', icon: Database },
```

- [ ] **Step 4: Add state variables** (after `const [testing, setTesting] = useState(false);`)

```typescript
const [restoreFile, setRestoreFile] = useState<File | null>(null);
const [restoring, setRestoring] = useState(false);
const [restoreMessage, setRestoreMessage] = useState('');
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 5: Add handleRestore function** (after `handleTestEmail`)

```typescript
async function handleRestore() {
  if (!restoreFile) return;
  if (!confirm('确定要恢复数据吗？此操作将覆盖所有现有数据！')) return;
  setRestoring(true);
  setRestoreMessage('');
  try {
    const res = await api.admin.restore(restoreFile);
    setRestoreMessage(res.message || '恢复完成');
    setRestoreFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  } catch (e: any) {
    setRestoreMessage(e.message || '恢复失败');
  }
  setRestoring(false);
}
```

- [ ] **Step 6: Add backup/restore tab content** — insert inside the tab content area, before the save button section

```tsx
{activeTab === 'backup' && (
  <div className="space-y-8 max-w-2xl">
    {/* Backup section */}
    <div>
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>下载备份</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        导出所有数据（文章、评论、媒体文件、配置等）为 ZIP 文件。
      </p>
      <button onClick={() => api.admin.backup()}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ background: 'var(--primary)' }}>
        <Download className="w-4 h-4" />
        下载备份
      </button>
    </div>

    <div style={{ borderTop: '1px solid var(--glass-border)' }} />

    {/* Restore section */}
    <div>
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>恢复数据</h3>
      <div className="px-4 py-3 rounded-lg text-sm mb-4"
        style={{ background: 'rgba(255, 100, 100, 0.1)', color: 'hsl(0, 60%, 55%)', border: '1px solid rgba(255, 100, 100, 0.2)' }}>
        警告：恢复操作将覆盖现有所有数据！此操作不可撤销。
      </div>
      <div className="flex items-center gap-3 mb-4">
        <input type="file" accept=".zip" onChange={e => setRestoreFile(e.target.files?.[0] || null)}
          className="flex-1 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:text-sm file:font-medium file:cursor-pointer file:border-none file:text-white"
          style={{ color: 'var(--text-secondary)' }}
          ref={fileInputRef} />
        <button onClick={handleRestore} disabled={!restoreFile || restoring}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ background: 'hsl(0, 60%, 55%)' }}>
          <Upload className="w-4 h-4" />
          {restoring ? '恢复中...' : '恢复'}
        </button>
      </div>
      {restoreMessage && (
        <div className="text-sm" style={{ color: restoreMessage.includes('失败') ? 'hsl(0, 60%, 55%)' : 'hsl(142, 60%, 50%)' }}>
          {restoreMessage}
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 7: Build frontend and verify**

```bash
cd /Users/tano/Documents/GitHub/personal/tano_blog/frontend && npm run build
Expected: no errors
```
