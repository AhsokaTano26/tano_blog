# Private Entry Animation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Follow the global theme, allow editing every animation caption and welcome icon, and serve animation content only to authenticated administrators.

**Architecture:** Embed the existing choreography, defaults and renderer in the Go backend. Serve a complete private player document through the admin API; the frontend hosts it in a sandboxed frame and synchronizes theme changes. Store overrides and the private raster icon in one SiteConfig record.

**Tech Stack:** Go/Gin/GORM, Next.js/React/TypeScript, existing wrapped form controls.

**Spec:** The user's three requirements, refined below.

## Specification and constraints

- Preserve the approved 12.2-second choreography and existing admin work.
- Both light/dark mode and accent hue follow the global theme without restarting playback.
- All captions have editable overrides. Blank means default; a blank welcome title resolves to the current site title.
- Support `{name}` and `{username}` in text. Treat all text as plain text.
- A PNG/JPEG/WebP/GIF icon, at most 512 KiB and 2048×2048, replaces the welcome mark. Store it privately, never under public uploads.
- Protect configuration, defaults, document and icon with the existing session/admin/CSRF middleware. Public configuration and frontend bundles contain no animation content.
- No browser automation, window activation or global refresh. No commit unless requested.

## Review focus

- Expired, revoked, pending-second-factor and non-admin credentials must not read animation data.
- Slow or failed document loading, reduced motion, unmount and StrictMode must not trap the admin interface.
- Long and hostile text must remain bounded and inert.
- Theme changes must update the running document without replacing it.
- Draft preview must not persist changes; restoring defaults must be an explicit save.

### Task 1: Private backend

Files: `backend/internal/entryanimation/*`, `backend/internal/handler/entry_animation.go`, handler tests, `backend/cmd/server/main.go`, generic config handler.

Interfaces: GET/PUT `/api/v1/admin/entry-animation`; GET `.../player`; POST `.../preview`. Settings carry `overrides`, `icon_data_url`, field descriptors and `site_title`; player carries `html` and `duration_ms`.

- [x] Add tests for defaults, fallback, validation, escaping and authenticated routes; observe failure.
- [x] Move choreography to embedded backend assets; implement persistence and private responses.
- [x] Run package tests with PostgreSQL integration enabled.

### Task 2: Private frontend player and settings

Files: `WelcomeAnimation.tsx`, `EntryAnimationSettings.tsx`, `lib/entry-animation.tsx`, `lib/api.ts`, admin layout/settings, Next CSP, frontend tests.

- [x] Add regression tests for player lifecycle, source checks, theme sync and settings.
- [x] Replace public animation code with sandboxed player loader; wire draft preview through admin layout.
- [x] Add grouped wrapped fields, icon picker, save/default/preview actions.
- [x] Run focused and full frontend tests, lint and production build.

### Task 3: Review and local demo

- [x] Review the change independently; address material findings.
- [x] Run backend tests/vet/build and frontend verification.
- [x] Restart only the owned demo services using their existing data.
- [x] Verify anonymous denial, authenticated rendering and absence of choreography/text in public output and old generated chunks.

## Execution ledger

- Ruling: Continue in the existing workspace because this extends the user's current uncommitted animation and component work. Do not create commits or require another approval for the authorized changes.
- Pre-flight: Backend settings/player shapes are shared by tasks 1 and 2; all animation defaults remain server-side.

- Task 1: complete. Defaults and all SVG/CSS/runtime assets moved into backend embeds; configuration and icons use one private SiteConfig record. The actual auth chain rejects anonymous, invalid, expired, revoked, TOTP-pending, non-admin and forced-password sessions. Public/generic configuration responses exclude the record.
- Task 2: complete. Settings expose 54 text overrides with server defaults, private raster icon, explicit save/default and non-persisting preview. Parent theme changes update an existing sandboxed frame; keyboard, reduced-motion, StrictMode and failure escapes are covered.
- Final independent review: two P2 findings fixed. Long custom text now fits bounded scene regions; malformed restored configuration exposes recoverable defaults and does not block valid preview/update. Both regressions were observed failing before the corrections, then passed.
- Review scope rulings: no live browser, CSP engine rendering or visual-font review was performed because the user prohibited browser/window interference. Checked the sandbox/CSP structure, DOM/runtime behavior and local HTTP responses instead. Current generated public chunks were rebuilt, scanned and replaced; external CDN caches are outside this local Demo.
- Validation: 311 frontend tests pass; final auth/layout follow-up 10/10; production build passes; ESLint has 0 errors and the same 298 existing warnings. Backend isolated PostgreSQL tests, vet and build pass (final totals recorded below).
- Demo: restarted only the owned API on 18080 and frontend on 3097, preserving the schema, uploads and session secret. Eight anonymous HTTP attempts denied; authenticated settings/player and draft preview pass; site-title fallback passes; preview leaves saved data unchanged; public build/API scan reports zero animation-content matches.
- No commit created. Existing unrelated uncommitted work preserved.
- Final backend verification: 272 tests passed, 1 pre-existing large JSON test intentionally skipped; `go vet` and production server build passed. Temporary verification database removed.
