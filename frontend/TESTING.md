# Safe frontend testing

Use Node.js 22 (matching CI) and Python 3 on macOS or Linux. All frontend tests
must go through the watchdog, including a single test or a failing regression:

```sh
npm test
npm test -- -- tests/audit-regressions.test.js
npm test -- -- --test-name-pattern=media
npm run test:guard
```

Production builds use two page-generation workers (`experimental.cpus: 2`) to
bound parallel memory use on developer machines and CI. The default previously
started 13 workers on the audit machine and exceeded a 2 GiB sampling threshold.

Do not invoke `node --test` directly. Keep tracking a running tool session until
it has exited; partial output is not a completion result. Never start a second
run to diagnose a silent first run. Resolve monitoring permission errors instead
of bypassing the watchdog.

## Protections and limits

The independent Python supervisor runs files serially, applies a 512 MiB V8
old-space limit per Node process and a 30-second Node test timeout, and stops
the process group at a 120-second external deadline or a sampled 1536 MiB memory
threshold. Wall time is checked as well as monotonic time, so an expired deadline
is detected after wake even if the monotonic clock paused. Core dumps are disabled.

The default `flock` is shared by this user's repository clones/worktrees and
`test:guard`, regardless of `TMPDIR`. Do not delete its inode while tests run.
A stale recorded process group blocks a new run after an abruptly killed
supervisor. Inspect the reported group and stop only the verified test processes
before retrying. The internal `--lock-file` option is only for bounded watchdog
fixtures; it must not be used to run concurrent project tests.

macOS measurement uses `phys_footprint`, including compressed memory. Linux uses
summed RSS, which excludes swapped-out pages. Sampling occurs about every 100 ms
(plus process inspection time): **this is not a hard OS memory quota**, and brief
overshoot is possible. V8's heap cap does not cap Buffer/TypedArray/native memory.
Normal child processes remain in the monitored group; tests must not use
`detached: true`, `setsid`, or otherwise escape it. SIGKILL of the supervisor,
OS suspension or a system-wide stall cannot be handled by a userspace watchdog.
Use a Linux cgroup/container with explicit memory, swap and PID limits if a hard
resource ceiling is required. Do not replay the historical unsafe failure on
the host just to test this threshold.

Exit codes: `75` overlapping/residual run; `124` external timeout; `125` monitoring
or cleanup failure; `137` memory threshold; `128 + signal` interruption. Normal
Node test success/failure codes are preserved. Cleanup kills the process group,
waits for the runner and checks for remaining live members before clearing its
record. Watchdog tests use finite probes (at most 96 MiB explicit allocation),
their own external deadline and independent cleanup.

## Assertions must have bounded diagnostics

Compare DOM presence and identity as booleans, or compare specific primitive
fields. Keep messages short and textual:

```js
assert.equal(button('加载更多') === undefined, true);
assert.equal(document.querySelector('audio') === previousAudio, true);
assert.equal(element.textContent, 'Expected text');
```

Never pass DOM elements, React roots/Fibers, or collections of nodes directly to
equality assertions. In the observed Node 26.0.0 implementation, assertion
formatting inspects objects at depth 1000 and builds a Myers diff before truncating
displayed output. A custom message or a short terminal output limit does not
remove that allocation path. Register React cleanup before the first awaited
render, including when a mount fails.

`assertion-safety.test.js` exercises intentional failures on a real mounted React
button using primitive assertions; it verifies short diagnostics and no DOM
inspection. It does not execute the original dangerous assertion.
