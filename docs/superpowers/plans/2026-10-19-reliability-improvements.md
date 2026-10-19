# Blog Reliability Improvements Implementation Plan

**Goal:** Complete the six improvements approved in the conversation: resilient drafts, concurrent edit protection, actionable admin feedback, browser CI, focused frontend maintainability, and operational monitoring/recovery drills.

**Architecture:** Extend existing editor, API transactions, request helpers, watchdog and metrics. Keep production data out of tests. Use isolated PostgreSQL schemas and temporary media directories for recovery drills. Preserve existing access controls and public API behavior.

**Tech Stack:** Next.js/React/TypeScript, Gin/GORM/PostgreSQL, Python watchdog, browser automation.

**Authorization:** The user approved all six proposals with “全部完成”; routine implementation decisions and validation proceed in this session.

## Global Constraints

- Preserve root AGENTS.md and unrelated work. Starting tree is clean at 69f1e3f.
- Coordinator alone runs tests, builds, browsers and database services, serially. Agents may edit disjoint files and request validation.
- Frontend tests use npm test. Never assert equality of DOM/React objects. Keep independent timeout, memory monitoring, shared test lock and process-group cleanup for browser tests.
- No production data, deployment, notifications to third parties or push. Use local disposable fixtures for all destructive checks.
- Keep credentials and content out of metrics. Bound metric cardinality and memory.

## Review Focus

- Storage quota/security errors, rapid navigation, fresh drafts in two tabs and successful-save cleanup.
- Concurrent saves, restored revisions and server versions after a conflict; local content must survive.
- Failed optimistic operations and out-of-order responses; UI must reflect confirmed state.
- Browser runner failures, early server exits and descendants; no orphaned workload or duplicate start.
- Metrics under idle/failed disks and recovery of actual media plus database content in isolated drills.

## Tasks

### 1. Editor persistence and conflict UX
- [x] Add behavior regressions for debounced/exit draft saves, storage failures, isolated new drafts, and version conflicts.
- [x] Extract typed draft persistence logic; preserve legacy drafts, protect unsaved navigation, show persistence state.
- [x] Send expected_updated_at on updates; keep local edits and offer explicit comparison/reload after HTTP 409 post_conflict.
- [x] Validate editor regressions and existing save-race tests.

### 2. Atomic optimistic concurrency
- [x] Add handler/repository tests for stale, concurrent, invalid versions and rollback of revisions/associations.
- [x] Compare expected_updated_at inside the existing row-lock transaction; return HTTP 409 with code post_conflict and current_post, without mutating on conflict.
- [x] Preserve legacy callers omitting the precondition; document that browser writes always use it. Ensure new updated_at strictly advances and restore paths invalidate old baselines.
- [x] Run PostgreSQL-backed regressions.

### 3. Admin request feedback and frontend maintainability
- [x] Add regression coverage for errors, retries, duplicate submissions and failed reorders.
- [x] Introduce typed reusable request/mutation feedback and apply to admin CRUD plus public list failure states.
- [x] Extract focused modules in touched large components and replace unsafe API/page types in these flows; repair meaningful hook/accessibility warnings.
- [x] Validate behavior and record lint delta without weakening rules.

### 4. Bounded browser regression suite
- [x] Add committed production-build browser tests for login, save/conflict/drafts, upload, image size, scrolling, and access policies at desktop/mobile sizes.
- [x] Run Chromium and WebKit serially under the existing watchdog principles; share its lock and clean the entire server/browser process group.
- [x] Integrate into CI, pin browser dependency, document local commands and retained failure artifacts.
- [x] Exercise runner failure/timeout cleanup and run the actual browser suite.

### 5. Operational monitoring and recovery drills
- [x] Add bounded request latency/error metrics, disk-capacity and backup-health alerts to the authenticated metrics endpoint.
- [x] Add isolated end-to-end backup/restore drill covering database and media, and a weekly CI workflow.
- [x] Add tests for alert thresholds, bounded cardinality and restore integrity; update operations guide with actionable thresholds and commands.

### 6. Integrated verification and review
- [x] Run all frontend tests/guard tests, backend tests/vet, lint, type checking and production builds serially.
- [x] Review all changes against the six approved outcomes and fix material findings.
- [x] Record exact results, limitations and working-tree state. Do not claim live deployment or physical sleep/wake verification.

## Completed verification

Completed on 2026-10-19. See [validation evidence](../../reliability-validation-2026-10-19.md): 225 frontend tests, 19 guard tests, 11 release/process tests, 267 backend tests with one explicit large-backup skip, and 16 real-browser checks across Chromium/WebKit. Builds, types and vet passed; lint has zero errors and 333 warnings (460 before). Temporary schemas/processes and the local test database were cleaned up. Prepared for local commit at the user's request; no push or deployment.
