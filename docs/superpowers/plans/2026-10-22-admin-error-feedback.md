# Admin Error Feedback Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Expose actionable reasons for backend failures throughout the existing admin interface, including standby restrictions, without discarding drafts or misreporting confirmed mutations.

**Architecture:** Keep server access controls unchanged. Format HTTP errors consistently at the fetch/XHR boundary, reuse existing request feedback hooks for reads and writes, and repair page-level branches that suppress errors or confuse mutation and refresh failures. Display a standby notice from the existing authenticated sync-status endpoint.

**Tech Stack:** Next.js/React/TypeScript, existing Gin API, existing JSDOM tests and Python test watchdog.

**Spec:** User request “类似错误都标出来”, following the diagnosed standby-only config rejection and settings feedback fix.

## Global Constraints

- Continue in the current workspace and preserve prior uncommitted privacy/settings fixes.
- No browser automation, browser refresh, window activation, online writes, deployment, commit or push.
- Preserve admin/CSRF/standby restrictions; notices are informational, never authorization.
- Read the installed Next.js guides before changing frontend code; use `npm test` for tests.
- Failed loads must remain distinguishable from empty data. Failed writes preserve entered values.
- HTTP errors retain status and a useful server-provided reason; non-JSON proxy failures receive a safe fallback.
- Only read requests can be retried automatically. Confirmed writes are never repeated to refresh the UI.

## Review Focus

- HTML/empty 503 and 413 responses must expose status and an actionable message, without injecting proxy HTML.
- Initial config failure must not enable blank/default settings to overwrite existing values.
- A successful write followed by a failed read must remain visibly successful, with a separate refresh error.
- Notification/auth/status failures must not appear as empty inboxes, zero badges, or expired sessions.
- Read-only notices and errors must remain visible without reloading the browser or modifying server roles.

### Task 1: Shared HTTP diagnostics

Files: `frontend/src/lib/http-error.ts`, `api.ts`, `upload.ts`; `frontend/tests/api-errors.test.js`, upload regression tests.

- [x] Add behavioral regressions for JSON/non-JSON HTTP failures and observe RED.
- [x] Add pure status formatting shared by fetch and XHR; retain explicit backend reasons.
- [x] Verify existing API error fields, upload cancellation and frontend feedback tests.

### Task 2: Admin read/write feedback coverage

Files: admin settings, music, backup, profile, notifications, calendar, layout; PostEditor and related admin components as required by the inventory.

- [x] Reproduce hidden initial loads, swallowed metadata errors and falsely failed saves in JSDOM.
- [x] Add visible errors/retry to missing read paths and preserve drafts on write rejection.
- [x] Distinguish completed mutations from subsequent refresh/clipboard failures.
- [x] Show standby status and expose logout/auth/badge failures in the admin shell.
- [x] Audit all remaining admin catch branches and record intentionally handled cancellations/parsing fallbacks.

### Task 3: Verification and acceptance record

- [x] Run the complete frontend suite through the watchdog, then lint and an isolated production build.
- [x] Review the final diff and update the coverage ledger below.
- [x] Report changed behavior, remaining limits and uncommitted/local-only state.

## Execution ledger

- Baseline: `d5d3bf9`; prior auth privacy fix, settings feedback fix and their tests/docs remain uncommitted and are preserved.
- Scope: existing admin failure paths only. Backend read-only behavior was confirmed correct on the user's standby; no server role changes are authorized or needed.
- Documentation: installed Next.js Error Handling and Server/Client Components guidance already read in this session.

- Task 1: fetch and XHR retain status + server reason; malformed/non-JSON upstream errors have safe actionable fallbacks. All new cases observed RED then GREEN.
- Task 2: config/music/profile reads, calendar, notification reads/writes, backup reads/progress, editor metadata/history/preview, media upload/tags, auth/logout/counts, and version/clipboard failures now have visible feedback. Existing list/CRUD controls already preserve server reasons.
- Independent requesting-code-review found four P2 issues: non-string XHR reasons hanging transfers; refresh overwriting later edits; settings errors colored as success; terminal backup failure hidden behind HTTP 200. All four reproduced with regression tests and fixed.
- Additional timer regression: older success timeouts erased newer failures. Settings/music/profile messages now remain until replaced by a subsequent action.
- Existing exact-message editor regression updated to require both the original reason and the newly intentional HTTP status.
- Native navigation/download exports keep browser-owned response handling to avoid buffering large backups in JavaScript. Decorative parsing fallbacks and explicit user cancellations remain distinct from request failures.
- The standby notice supports its own status refresh after local role edits without reloading the workbench; verified with DOM identity and retained-input regression coverage.
- Final validation: complete frontend suite 356/356 passing (362 MiB sampled peak); lint exit 0 with 0 errors and 293 warnings; isolated production build exit 0. Existing dashboard test `act` warnings remain. The first build caught a missing `must_change_password` field in the frontend `getMe` type; it now matches the existing backend response.
- Acceptance record: `docs/admin-error-feedback-validation-2026-10-22.md`. No browser interaction, live writes, deployment, commit or push performed.
