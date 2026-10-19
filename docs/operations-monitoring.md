# Operational monitoring and isolated recovery drills

The admin dashboard displays request latency/error rates, upload and backup storage capacity, backup health, and actionable alerts. It refreshes every 60 seconds while the page is visible. These values come from the existing `GET /api/v1/admin/metrics` endpoint, which requires an authenticated admin session and now returns `requests`, `storage`, `backup`, `alerts`, and the effective `thresholds`. Existing `database`, `access_log_pending`, and `access_log_dropped` fields are unchanged. The full JSON remains available through the browser's authenticated developer console or an existing local authenticated client. Do not publish session cookies or expose this endpoint through an unauthenticated proxy.

Alerts are computed when this endpoint is requested. They appear in its JSON response; this code does not send messages, call webhooks, install a scheduler, or create backups automatically. Poll every 30–60 seconds with your existing local monitor if continuous observation is needed. An unavailable endpoint must be treated as missing telemetry, rather than an empty alert list.

## Request metrics

`requests` and each entry in `requests.routes` contain completed request counts, `server_errors` (HTTP 5xx), `client_errors` (HTTP 4xx), `error_rate` (5xx / all completed requests, a fraction from 0 to 1), `p95_ms`, and cumulative `latency_buckets`. A latency bucket's `upper_bound_ms: null` means infinity. `p95_ms` is an approximate histogram upper bound, not an exact percentile. If `p95_overflow` is true, it is the largest finite boundary and therefore a lower bound instead.

The fixed histogram boundaries in milliseconds are 5, 10, 25, 50, 100, 250, 500, 1,000, 2,000, 5,000, 10,000, 30,000, 60,000, 300,000, 1,800,000, and infinity. Long uploads and backup operations participate in these totals; consult the route breakdown when investigating latency.

The window contains the current ten-second bucket and the previous 29 buckets: its effective age ranges from 290 to 300 seconds. `window_start` and `window_end` give the actual boundaries. Requests enter the window on completion. After the window expires, both `error_rate` and `p95_ms` are `null` and counts are zero; idle traffic is not evidence of healthy latency. The request currently fetching metrics appears on the next scrape. Recovered panics are counted as 5xx.

At most 256 method/template series are retained for the life of the process, with 30 fixed buckets per series. Requests use Gin route templates such as `/api/v1/posts/:slug`, never concrete URLs. Unmatched paths share `__unmatched__`; excess distinct templates share `__overflow__` without losing global counts. Unknown HTTP methods are `OTHER`. No query strings, bodies, passwords, IPs, user IDs or content are collected here. All request metrics reset on process restart. This aggregation is independent of the existing access-log database and its queue metrics.

## Storage and backup health

`storage.uploads` and `storage.backups` report `available_bytes`, `total_bytes`, and `available_percent` for their filesystem. Available capacity excludes blocks reserved from the service user. If both directories share a volume, the reported capacity is naturally the same. On Linux and macOS, a missing directory, invalid storage path or failed filesystem probe produces `error: "disk_probe_failed"` and a corresponding alert; zero values in an error result are not a successful measurement. Other operating systems report `disk_probe_unsupported`.

`backup` reuses the backup/restore operation lock and exposes the active `kind`, `phase`, `running`, `started_at`, and `last_result`. `last_success` and `last_failure` refer specifically to full, self-contained database-and-media backup attempts; cancellation counts as a failed attempt. A successful restore or database-only replication snapshot does not renew full-backup freshness or clear a later failed backup. Historical failure remains visible after a later successful backup, but stops triggering an alert.

After restart, `last_success` is initialized from the newest nonempty regular `backup-*.zip` file's modification time and labeled `success_source: "archive_mtime"`. Incomplete `.tmp` files, symlinks and replication snapshots are excluded. This timestamp is a discovery hint, not an integrity guarantee. A backup completed in the current process uses `success_source: "completed_operation"`. Last failure and operation history are process-local and reset on restart; existing archives provide the freshness fallback. Failed startup scanning appears as `discovery_error` and an alert. Creating a successful full backup clears that scan error. A missing full backup alerts immediately, including on a new installation.

## Thresholds and actions

Set these optional environment variables on the backend and restart to apply them. The endpoint returns the effective thresholds. Out-of-range or non-finite values fall back to defaults.

| Variable | Default | Unit and accepted range |
| --- | --- | --- |
| `MONITOR_MIN_REQUESTS` | `20` | Completed requests before traffic alerts; 1–1,000,000 (fractional input is rounded down) |
| `MONITOR_ERROR_RATE_PERCENT` | `5` | 5xx percentage; 0.01–100 |
| `MONITOR_P95_MS` | `1000` | Milliseconds; 1–1,800,000 |
| `MONITOR_DISK_MIN_FREE_GIB` | `1` | GiB (1,073,741,824 bytes); 0–1,048,576 |
| `MONITOR_DISK_MIN_FREE_PERCENT` | `10` | Percent; 0–100 |
| `MONITOR_BACKUP_MAX_AGE_HOURS` | `48` | Hours since full backup; 1–87,600 |

Traffic and backup-age alerts fire at or above their thresholds. Storage alerts fire below either its free-byte threshold or its free-percent threshold. A zero storage threshold disables only that individual criterion; probe failures still alert. Each alert includes a stable `code`, `severity`, message, and local action:

- `request_error_rate`: inspect route totals and server logs, database connectivity and recent changes.
- `request_latency`: inspect route histograms, database pool waits, and active backup/upload work before changing limits.
- `disk_low_uploads` / `disk_low_backups`: expand the volume or remove verified expendable files. Preserve a verified backup before deleting archives.
- `disk_probe_uploads` / `disk_probe_backups`: check directory existence, mount state and service-user access. Do not treat a failed probe as healthy storage.
- `backup_missing`, `backup_stale`, `backup_failed`, `backup_probe_failed`: inspect backup status/logs, fix the storage or backup error, create a full backup, and verify restore integrity in isolation.

Replication scheduling already exists separately. Full backups are currently operator-triggered; this monitoring addition does not create a new full-backup schedule. Choose the maximum age to match your actual backup policy and inspect both full backup and replication status.

## Isolated recovery drill

`TestRecoveryDrill` runs the actual admin backup creation and local restore handlers against two distinct `testutil.Database` schemas and temporary upload/backup directories. It checks that both database search paths are test schemas before writing fixtures. It uses synthetic content only and does not read `DB_DSN`, `UPLOAD_DIR`, `BACKUP_DIR` or any production archive.

The drill validates:

- Full archive creation and a full read of every ZIP entry to verify CRCs.
- Restore over a destination containing conflicting database data and damaged media.
- Post content, author/category/tag relationships, and media metadata.
- Restoration of both a missing thumbnail and the damaged original, using SHA-256 comparisons.
- Invalidation of backed-up sessions and an unchanged source schema and media tree.

Schemas are dropped and temporary directories removed by Go test cleanup. Use a disposable local PostgreSQL database and a role authorized only for that database. Do not point integration tests at a production database even though the drill isolates its schemas. Run workloads serially, especially on memory-constrained development machines.

From `backend/`, with the existing disposable test database running:

```sh
TEST_DATABASE_DSN='postgres://postgres:test-only-password@localhost:5432/blog_test?sslmode=disable' \
REQUIRE_TEST_DATABASE=1 GOMAXPROCS=2 GOMEMLIMIT=384MiB \
go test -p 1 ./internal/handler -run '^TestRecoveryDrill$' -count=1 -timeout=6m -v
```

Run monitoring regressions separately:

```sh
GOMAXPROCS=2 go test -p 1 ./internal/monitoring ./internal/middleware \
  -run 'TestRequest|TestHistogram|TestAlerts|TestBackupFreshness|TestDiskProbe|TestConfigRejectsUnsafe' -count=1
```

The **Isolated recovery drill** GitHub Actions workflow runs every Monday at 03:17 UTC (11:17 China time), on relevant pull requests, and manually. It uses a disposable PostgreSQL 16 service, test credentials declared in the workflow, no production secrets, and read-only repository permissions. PostgreSQL is capped at 512 MiB and one CPU; Go is limited to two execution threads, package parallelism one, and a 384 MiB GC target. `GOMEMLIMIT` is a soft Go runtime limit, not an OS hard memory cap. The test has a six-minute deadline, its command an eight-minute external timeout, and the job a fifteen-minute timeout. The workflow keeps a text log for fourteen days as evidence.

The synthetic drill proves that the restore path works for its fixtures. It does not certify a particular production archive or measure a production recovery time objective. Periodically restore a chosen real backup into a separately provisioned disposable environment, verify expected row counts and media checksums, and record its recovery time before relying on it.
