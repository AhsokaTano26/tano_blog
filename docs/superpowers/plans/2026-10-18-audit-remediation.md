# 2026-10-18 Audit Remediation Plan

> **For agentic workers:** Use systematic debugging, test-driven development, and verification before completion. Independent file groups may be delegated; the coordinator alone runs tests and builds.

**Goal:** Resolve all 14 findings approved by the user, preserving existing content and keeping test workloads bounded.

**Architecture:** Keep the existing Gin/GORM/PostgreSQL and Next.js/React structure. Bind resource credentials to current password state, make destructive content operations exclusive and recoverable, and make editor transformations follow actual Markdown structure and source ranges.

**Tech Stack:** Go 1.26.9, PostgreSQL 16, Next.js 16, React 19, TypeScript, Node's test runner with the Python watchdog.

**Spec:** User-approved A01–A14 findings from the 2026-10-18 audit, enumerated below.

## Constraints

- Preserve existing AGENTS.md files, unrelated edits, backups, accounts, and credentials.
- Work in the user's existing checkout as in the previous repair turns; no production mutations or deployment.
- Only the coordinator starts test/build workloads; never overlap them.
- Frontend tests use `npm test`; DOM assertions use primitives and register cleanup before rendering.
- Go tests use the dedicated local PostgreSQL container and isolated schemas; record any skipped cases.
- No unprotected reruns of historical failing DOM assertions.
- Commit reviewed repairs separately by domain; push only when requested.

## File ownership and tasks

### 1. Access control and global comment policy

Owner: auth worker. Files: `backend/internal/utils/jwt.go`, `backend/internal/handler/{auth,post,post_mutations,comment,config_accesslog}.go`, `backend/internal/repository/repositories.go` (public search only), `backend/cmd/server/main.go` (music credential issuance only), related tests.

- [x] A01: Reject setup against enabled TOTP without changing its active secret; verify enabled setup and disable behavior through authenticated routes.
- [x] A04: Bind resource JWTs to current protected-resource password state, validating post reads/comments/reactions and music config. Legacy unbound credentials fail closed for protected resources; do not expose hashes/passwords in claims.
- [x] A05: Anonymous search must not match protected body content; public title/summary remain searchable.
- [x] A12: Enforce global `comment_enabled` alongside article policy; missing legacy setting preserves default, query errors fail closed. Frontend policy display belongs to frontend worker.
- [x] Coordinator observes new regression failures before implementation, then reruns green tests.

### 2. Destructive data operations and admin mutations

Owner: data worker. Files: `backend/internal/handler/{backup,backup_restore_files,category_tag,nav_link}.go` plus focused new files/tests, `backend/internal/middleware/standby_readonly.go` and tests. Coordinate before modifying shared model/repository files.

- [x] A02: Clear-all acquires the existing exclusive cancellable write gate for database and filesystem work; middleware must not first hold a shared lease. Recheck primary/standby role after acquiring it.
- [x] A06: Make clear-all preserve recoverable DB/file outcomes and report filesystem failures; avoid silently committing a partial clear. Prefer existing restore/journal facilities where compatible. Preserve users/settings and existing backup behavior.
- [x] A09: Actual tag DELETE handler must use transactional dependent-association cleanup, verified with and without foreign keys.
- [x] A10: Validate all reorder IDs, update atomically, and return an error with no partial ordering on failed updates.
- [x] Add a real concurrency regression for clear-all versus uploads/writers and failure-path coverage.

### 3. Editor and comment UI

Owner: frontend worker. Files: `frontend/src/components/{PostEditor,ArticleMarkdown}.tsx`, `frontend/src/lib/{editor-alignment,article-image}.ts` and focused parser helpers, `frontend/src/app/admin/comments/page.tsx`, `frontend/src/app/posts/[slug]/PostClient.tsx` (global comment policy only), related tests. Do not edit next.config or lockfile without coordination.

- [x] A03: Snapshot saved edit version; only close and clear drafts if no newer edits exist. Preserve pending edits and prevent concurrent keyboard saves.
- [x] A07: Editing existing raw HTML/Markdown/figure images replaces the correct source range, including escaped query URLs and repeated sources. A failed edit lookup cannot insert a duplicate. Preserve image dimensions, captions, links, and click behavior.
- [x] A08: Alignment must leave inline/fenced/indented code and HTML comments untouched, while formatting actual paragraphs and preserving selections and active styles.
- [x] A11: Only the latest comment-list request may update rows, count, selection, loading, or errors.
- [x] A12 UI: Global comments disabled hides/disables submission and explains why; existing comment visibility follows established behavior.

### 4. Coordinator fixes and integration

Files: `backend/internal/middleware/ratelimit.go`, tests; `frontend/next.config.ts` and route regression tests; operational docs and this ledger.

- [x] A13: Use a true fixed time window or token bucket; denied requests cannot extend it. Pin timing with deterministic tests.
- [x] A14: Forward robots.txt to the configured backend and verify the actual production response.

## Review focus

- Password changes, resets to the same password, absent cookies, malformed/legacy claims, and independent resources must all have explicit access outcomes.
- Clear cancellation and commit/rename/delete failures must preserve a recoverable authoritative state, not report success after partial deletion.
- Saved editor state can change while requests or image dialogs are pending; selection identity and newest edits must survive.
- Markdown HTML-looking examples and duplicate image URLs must not be treated as the first matching real node.
- Out-of-order failed requests and default/missing global settings must not overwrite current UI or bypass backend policy.

## Validation and completion

- [x] Focused red/green regressions for all 14 findings.
- [x] Entire frontend suite, watchdog suite, release/entrypoint tests, lint, TypeScript/production build.
- [x] Entire backend PostgreSQL suite, vet, build; run bounded large-backup case if resources allow.
- [x] Production-browser QA for edits/save races, image replacement, alignment, comment policy, and responsive behavior; HTTP robots response.
- [x] Independent final code review and fix any confirmed blockers.
- [x] Confirm process cleanup and clean working tree after focused commits.

## Progress ledger

- Initial state: clean `main` at `09b39fa`; user explicitly requested resolving every finding. No repairs have been claimed complete yet.

- Regression-first verification reproduced each reported path. Independent review also caught stale save metadata/status, delayed comment mutations, reference/mixed image wrappers, and open-dialog edits; these now have passing regression coverage.
- Backend: `TEST_LARGE_BACKUP=1 go test -json -p 1 -parallel 1 ./... -count=1` produced 236 passing test/subtest results, no skipped test cases. The >256 MiB backup roundtrip passed with 37.8 MiB observed Go heap; the bounded run peaked at 142 MiB. `go vet ./...` and build passed.
- Frontend: the full guarded suite passed all 172 tests (323 MiB peak); watchdog checks passed 14 tests; release/entrypoint checks passed 11 tests. After the mobile CSS correction, all 12 affected article/comment tests passed.
- ESLint: zero errors, 460 existing warnings. TypeScript and production builds passed. `npm audit --omit=dev` reported zero production dependency vulnerabilities; the existing development dependency advisory chain remains outside these runtime repairs.
- Chromium production QA passed at 1440x1000 and 390x844: delayed real save/create, duplicate shortcut prevention, image identity/dimensions/link/caption, literal-safe alignment, delayed 1800px image with bidirectional scroll, stale comment filters, global comment policy, and real robots.txt HTTP 200 with the configured sitemap URL. Fixed the discovered mobile fieldset/input minimum-width overflow.
- Browser QA had no unexpected console/page errors or framework overlays; two anonymous `/auth/me` HTTP 401 responses are the existing optional identity probe. Used Playwright because the Browser plugin skill was unavailable. All QA child processes exited and its isolated schema was dropped. Temporary evidence remains under `/tmp/tano-blog-qa/`; no production data was changed.
- Final independent read-only review found no remaining concrete blockers. This validates the identified repairs, not the absence of all future defects. Live production deployment, Safari, and physical sleep/wake were not exercised.
- Repairs committed by domain: `a0a5128` (access/policies/limiting), `7098ca1` (atomic data operations/recovery), `1285b2a` (editor/comments/robots). Operational notes and this ledger are committed separately. Test API/Next/Chromium ports are closed; the dedicated PostgreSQL container is stopped. No push or deployment was performed.
