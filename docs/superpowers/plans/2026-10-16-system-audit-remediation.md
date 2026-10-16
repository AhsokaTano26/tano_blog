# System audit remediation

Baseline: `b96b709`. The user approved fixing the complete 2026-10-16 audit. Preserve existing AGENTS.md files. Work in the shared checkout with exclusive file ownership; no deployment or production database changes. Temporary audit repros are in `/tmp/tano-blog-system-audit-20261016/`.

## Contracts and decisions

- Separate `Post.ScheduledAt` (`scheduled_at`, nullable RFC3339) from historical `PublishedAt`. Explicit null/empty values clear editable fields; omitted PATCH values preserve them. Legacy datetime-local is interpreted in Asia/Shanghai. Migrate only future draft publication times to scheduling.
- Add `User.SessionEpoch` (`session_epoch`, hidden from JSON). JWT claims carry the epoch; restore rotates it unpredictably, including accounts absent from the current database. Legacy session tokens with empty epoch remain valid only until the first epoch change. Authentication rejects TOTP/reset token purposes.
- Root owns auth/JWT, AI, main.go, dependencies, CI/container lifecycle, integration and documentation. Content work owns post/feed/media handlers, repositories and models. Frontend work owns src, tests and Next config. Backup work owns backup/replication and restore tests.
- Local deletion jobs are excluded from backup exports but invalidated during restore. The content worker validates that files are no longer referenced before cleanup.
- Do not alter the workspace's unrelated services. All database regression work uses random schemas in the dedicated audit PostgreSQL container.

## Tasks and verification ledger

### 1. Content and data correctness

- [x] Convert the ten audit repros to failing regression tests against real PostgreSQL.
- [x] Fix password/RSS leakage, schedules/withdrawal/timezones, zero-value and association updates, admin search, media file cleanup, bulk tags and dependent deletion.
- [x] Expose `PostRepo.PublishScheduled(now time.Time) (int64, error)` and `MediaHandler.CleanupDeletedFiles(ctx context.Context)`; root wires both with standby checks.
- [x] Run handler/repository/model tests with TEST_DATABASE_DSN; record results.

### 2. Frontend behavior

- [x] Turn the thirteen real-component repros into failing regression assertions.
- [x] Fix public auth pages, editor state/settings/password/summary/restore, reliable autosave, pagination and search, series selection/loading, Turnstile, music failures, media CSP, Markdown previews and keyboard controls.
- [x] Cover nullable schedule/field contracts and selectors spanning multiple pages.
- [x] Run frontend tests and TypeScript checks; root owns the final production build.

### 3. Restore and replication

- [x] Reproduce old-session revival, extraction failure and old-source deletion with tests.
- [x] Rotate session epochs; stage and validate uploads before any DB mutation; coordinate swap/rollback and interrupted restore recovery.
- [x] Retain sources across in-flight snapshot transfer; bound transfer time and retention or use leases. Verify cancellation and legacy archive compatibility.
- [x] Run backup/replication integration tests and document recovery assumptions.

### 4. Authentication, lifecycle and integration

- [x] Test required/optional auth reject intermediate tokens; verify current session epochs, password changes and pending TOTP.
- [x] Propagate AI cancellation and bound provider response bodies with local HTTP tests.
- [x] Release one verified SHA without rebasing after tests; make release reruns repair missing artifacts; run PostgreSQL tests in CI.
- [x] Forward container signals and wait for both children; verify through process lifecycle tests and a production image build.
- [x] Upgrade affected production dependencies/toolchain using upstream versions, preserve renderer behavior, rerun production vulnerability scans. Development-only upstream advisory limitations are recorded below.
- [x] Run full backend tests; frontend tests/TypeScript/lint/build; independent final review and fixes. Final backend vet/build and guard validation are recorded in the closing ledger.

## Review focus

Legacy/partial backups and first-start migrations; old versus absent auth epochs; failed transactions and shared media paths; cancelled and out-of-order requests; timezone/nullable schedule roundtrips; late async editor settings; slow series selection; rerunning a partially published release; SIGTERM during startup and shutdown. Verification must test observable outcomes, not merely implementation text.

## Progress

- Initial audit evidence reviewed; independent implementation tasks dispatched. Authentication/backup shared epoch and post scheduling contracts agreed before edits.
- Ruling: no additional approval gate is needed; the user explicitly approved all audit fixes. Keep migrations, test fixtures and runtime checks local until a deployment is separately requested.

## Closing review: 2026-10-16

The memory incident investigation interrupted the system audit. The resumed pass
reproduced each outstanding bug before changing its implementation:

- First migration erased past withdrawn publication dates; now only future draft
  dates move to `scheduled_at`, and restarts preserve historical publication time.
- Restored session epochs made reset JWTs exceed `varchar(500)` for a 50-character
  Chinese username; `text` migration and complete reset consumption pass on both
  fresh and legacy schemas.
- Ordinary restore admitted writes after the server changed to standby while
  waiting for its exclusive gate; it now checks the role inside that gate.
- Restore recovery callbacks were not wired into the server's replication gate;
  unresolved outcomes now block writers until recovery succeeds.
- A docs-only main advance blocked `latest`; planning now compares all stable
  reserved tags under the publish lock and prevents older retries overwriting a
  newer version. Tests also preserve the verified SHA and repair missing artifacts.
- Role-query errors admitted writes in middleware and the configuration endpoint;
  both fail closed with 503. Configuration/SSH key changes commit together or
  return 500 and roll back; success is no longer reported after a failed update.
- A real partial journal write poisoned startup recovery. The complete, fsynced
  temporary journal is now published atomically without replacing an existing
  journal. The 8-byte file limit is exercised only in a bounded helper process.
- Default frontend builds launched 13 page workers and exceeded a 2 GiB sampling
  threshold. `experimental.cpus: 2` reduced the verified build peak to 541 MiB.

Final local evidence:

- Full Go suite with PostgreSQL and `REQUIRE_TEST_DATABASE=1`: exit 0, including
  the new failure-path regressions. The opt-in >256 MiB backup fixture was not run.
- Final `go vet -p 1 ./...` and API `go build`: both exit 0. Watchdog validation:
  14/14 passed with finite, independently cleaned probes.
- Protected frontend suite: 120/120, 20.81 seconds, peak sampled group memory
  326 MiB. Release/entrypoint suite: 11/11, peak 68 MiB.
- Normal `npm run build` (Turbopack), including TypeScript and all 40 static
  pages: exit 0 with two workers; no webpack fallback required.
- Full frontend lint: exit 0, zero errors and 468 existing warnings; it is not
  warning-free. Its sampled process-group peak was 580 MiB.
- `npm audit --omit=dev`: zero production advisories. The earlier full scan still
  identified five development-only advisory paths through `braces`/Next ESLint;
  no compatible patched upstream version was available in that check. The
  suggested Next ESLint 14 downgrade was not applied to Next 16.
- Independent final review found no remaining blockers after the configuration
  and journal fixes. No production deployment, external publication, real
  close-lid/wake test, or new browser visual pass was performed.

Test and build commands ran sequentially. Frontend/script tests used the committed
watchdog. Final local build/lint used a temporary supervisor reusing its lock,
memory measurement and verified process-group cleanup primitives, with a
180-second deadline and 2 GiB sampling threshold. Sampling remains a userspace
protection, not an OS-enforced memory quota; see `frontend/TESTING.md`.

Changes are grouped into backend/data/recovery, frontend/test safety, and
release/lifecycle commits, following the user's earlier request to commit all
repairs. Production deployment and remote publication remain separate actions.
