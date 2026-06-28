# Backup & Restore Feature

## Overview

Full site backup and restore for the blog system. Exports all database records and uploaded media files into a single `.zip` archive for download, and supports restoring from that archive via the admin UI.

## Backup File Format

Single `.zip` archive with the following structure:

```
backup-YYYY-MM-DD/
├── data.json
└── uploads/
    ├── xxx.jpg
    └── yyy.png
```

### `data.json` schema

```json
{
  "version": "1.0",
  "created_at": "2026-06-29T12:00:00Z",
  "data": {
    "users":              [{ "id": "uuid", "username": "...", ... }],
    "categories":         [{ "id": "uuid", "name": "...", ... }],
    "tags":               [{ "id": "uuid", "name": "...", ... }],
    "posts":              [{ "id": "uuid", "title": "...", ... }],
    "post_tags":          [{ "post_id": "uuid", "tag_id": "uuid" }],
    "comments":           [{ "id": "uuid", "nickname": "...", ... }],
    "media":              [{ "id": "uuid", "filename": "...", ... }],
    "media_tag_links":    [{ "media_id": "uuid", "media_tag_id": "uuid" }],
    "media_tags":         [{ "id": "uuid", "name": "...", ... }],
    "site_configs":       [{ "key": "...", "value": "...", ... }],
    "passkeys":           [{ "id": "uuid", "user_id": "uuid", ... }],
    "post_revisions":     [{ "id": "uuid", "post_id": "uuid", ... }],
    "access_logs":        [{ "id": "uuid", "ip_address": "...", ... }]
  }
}
```

All tables are included. Excludes `post_tags` join table model since it's part of the `Post.Tags` many2many — but the join records (`post_tags`) are exported separately for reliable restoration.

## Data to Include

All models in `AutoMigrate`:
- `User`, `Passkey`, `Category`, `Tag`, `Post`, `PostTag` (join table), `Comment`, `Media`, `MediaTag`, `MediaTagLink` (join table), `SiteConfig`, `AccessLog`, `PostRevision`

## API Endpoints

### `GET /api/v1/admin/backup` — Download backup

- Authentication: Admin required
- Response: `application/zip` binary download
- Content-Disposition: `attachment; filename="backup-2026-06-29.zip"`
- Process:
  1. Query all tables
  2. Serialize to JSON
  3. Collect all files from `uploads/` directory
  4. Build in-memory zip archive
  5. Stream as download

### `POST /api/v1/admin/restore` — Restore from backup

- Authentication: Admin required
- Content-Type: `multipart/form-data`
- Body: `file` field with `.zip` archive
- Process:
  1. Parse uploaded zip
  2. Read `data.json`
  3. Validate format and version
  4. Truncate all tables (disable FK checks temporarily)
  5. Import data in dependency order
  6. Extract `uploads/` files to upload directory
  7. Return success/failure with summary

## Restore Order (dependency-aware)

1. `users` (no dependencies)
2. `categories` (no dependencies)
3. `tags` (no dependencies)
4. `media_tags` (no dependencies)
5. `site_configs` (no dependencies)
6. `posts` (depends on users, categories)
7. `post_tags` (depends on posts, tags)
8. `comments` (depends on posts, users)
9. `media` (depends on users)
10. `media_tag_links` (depends on media, media_tags)
11. `passkeys` (depends on users)
12. `post_revisions` (depends on posts, users)
13. `access_logs` (no dependencies, last)

### Concurrency safety

All operations run within a single GORM transaction. If any step fails, the entire restore is rolled back. File extraction runs after the transaction commits — if file extraction fails, the database is already restored and a partial failure warning is returned.

## Frontend UI

New tab in the Settings page (`/admin/settings`):

### "备份与恢复" tab

**备份（导出）区域**：
- 标题 "备份"
- 说明文字
- "下载备份" 按钮 → 触发浏览器下载

**恢复（导入）区域**：
- 标题 "恢复"
- 警告文字（数据将被覆盖）
- 文件选择器（接受 `.zip`）
- "恢复" 按钮（需要二次确认对话框）
- 进度/状态提示

## Implementation Plan

### Backend

1. Create new file `backend/internal/handler/backup.go`
   - `BackupHandler` struct with `db *gorm.DB` and `uploadDir string`
   - `Backup()` handler — generate zip and stream download
   - `Restore()` handler — accept multipart upload, validate, restore

2. Register routes in `main.go`
   - `admin.GET("/backup", backupHandler.Backup)`
   - `admin.POST("/restore", backupHandler.Restore)`

### Frontend

3. Add "备份与恢复" tab to `settings/page.tsx`
   - Tab definition
   - Backup button
   - Restore upload + confirm dialog

4. Add API methods in `lib/api.ts`
   - `admin.backup()` — triggers download
   - `admin.restore(file)` — uploads zip for restore

## Files to Modify/Create

| File | Action |
|------|--------|
| `backend/internal/handler/backup.go` | **Create** |
| `backend/cmd/server/main.go` | Add routes |
| `frontend/src/app/admin/settings/page.tsx` | Add backup/restore tab |
| `frontend/src/lib/api.ts` | Add API methods |
