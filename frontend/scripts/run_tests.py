#!/usr/bin/env python3
"""Run Node tests with an independent watchdog on macOS and Linux (Python 3)."""
import argparse
import ctypes
import errno
import fcntl
import json
import math
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import time
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024
DEFAULT_LOCK = Path('/tmp') / f'tano-blog-tests-{os.getuid()}.lock'
requested_signal = 0


def interrupt(signum, _frame):
    # Never throw between spawning the group and entering cleanup, or interrupt
    # cleanup itself. The supervisor checks this flag independently of Node.
    global requested_signal
    requested_signal = requested_signal or signum


def node_command(arguments):
    arguments = list(arguments)
    if arguments[:1] == ['--']:
        arguments.pop(0)
    options, files = [], []
    while arguments:
        arg = arguments.pop(0)
        name, equals, value = arg.partition('=')
        if name in ('--test-name-pattern', '--test-skip-pattern'):
            if not equals:
                if not arguments or arguments[0].startswith('--'):
                    raise ValueError(f'{name} requires a value')
                value = arguments.pop(0)
            options.append(f'{name}={value}')
        elif arg == '--test-only':
            options.append(arg)
        elif arg.startswith('-'):
            raise ValueError(f'unsupported Node option: {name}; safety flags cannot be overridden')
        else:
            files.append(arg)
    if not files:
        files = list(map(str, sorted((ROOT / 'tests').glob('*.test.js'))))
    if not files:
        raise ValueError('no test files found')
    return ['node', '--max-old-space-size=512', '--test', '--test-concurrency=1',
            '--test-timeout=30000', *options, *files]


def mac_footprint_reader():
    # SDK sys/resource.h: rusage_info_v2. phys_footprint includes compressed
    # pages, unlike RSS, which can hide a rapidly growing compressed workload.
    names = ('user_time system_time pkg_idle_wkups interrupt_wkups pageins '
             'wired_size resident_size phys_footprint proc_start_abstime '
             'proc_exit_abstime child_user_time child_system_time '
             'child_pkg_idle_wkups child_interrupt_wkups child_pageins '
             'child_elapsed_abstime diskio_bytesread diskio_byteswritten').split()

    class Usage(ctypes.Structure):
        _fields_ = [('uuid', ctypes.c_uint8 * 16)] + [(name, ctypes.c_uint64) for name in names]

    lib = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    lib.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    lib.proc_pid_rusage.restype = ctypes.c_int

    def read(pid):
        usage = Usage()
        if lib.proc_pid_rusage(pid, 2, ctypes.byref(usage)) != 0:
            error = ctypes.get_errno()
            if error == errno.ESRCH:
                return 0  # Process exited between enumeration and measurement.
            raise OSError(error, 'cannot read test process memory')
        return usage.phys_footprint

    return read


def group_processes(pgid):
    result = subprocess.run(['/bin/ps', '-axo', 'pid=,pgid=,rss=,stat='],
                            capture_output=True, text=True, check=True, timeout=2)
    members = []
    for line in result.stdout.splitlines():
        pid, group, rss, status = line.split()
        if int(group) == pgid and not status.startswith('Z'):
            members.append((int(pid), int(rss)))
    return members


def group_memory(pgid, footprint):
    total = 0
    for pid, rss in group_processes(pgid):
        total += footprint(pid) if footprint else rss * 1024
    return total


class AlreadyRunning(RuntimeError):
    pass


def record_group(lock, pgid=None):
    lock.seek(0)
    lock.truncate()
    if pgid is not None:
        json.dump({'guard_pid': os.getpid(), 'pgid': pgid}, lock)
    lock.flush()


@contextmanager
def test_lock(path=DEFAULT_LOCK):
    # One default lock across clones/worktrees/TMPDIR values on this machine.
    # --lock-file is reserved for bounded watchdog fixtures, never normal tests.
    with open(path, 'a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise AlreadyRunning('another test run is already running; wait for it to exit.') from None
        lock.seek(0)
        raw = lock.read()
        previous = json.loads(raw) if raw.strip() else {}
        # A killed supervisor cannot run finally. Refuse another workload while
        # its recorded group survives; never kill a possibly reused PID here.
        if isinstance(previous, dict) and previous.get('pgid') and group_processes(previous['pgid']):
            raise AlreadyRunning(f'previous test process group {previous["pgid"]} still exists; stop it before retrying.')
        yield lock


def stop_group(child):
    # Send the kill before querying ps: loss of monitoring access must not
    # prevent the only unconditional cleanup of a potentially growing group.
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except PermissionError:
        # Some sandboxes report EPERM for a group that has just exited.
        if group_processes(child.pid):
            raise
    child.wait(timeout=3)
    deadline = time.monotonic() + 3
    while group_processes(child.pid):
        if time.monotonic() >= deadline:
            raise RuntimeError(f'test process group {child.pid} did not stop; refusing to clear its lock record')
        time.sleep(0.05)


def run(args, *, command=None):
    if sys.platform not in ('darwin', 'linux'):
        raise RuntimeError('the test watchdog supports macOS and Linux')
    # Keep this inode: unlinking an advisory lock can permit overlapping owners.
    with test_lock(args.lock_file or DEFAULT_LOCK) as lock:
        # Only trusted Python entry points supply a command. The public unit-test
        # CLI still rejects unsafe Node flags and always serializes test files.
        command = node_command(args.node_args) if command is None else command
        footprint = mac_footprint_reader() if sys.platform == 'darwin' else None
        # Check monitoring access before starting a potentially unsafe workload.
        group_memory(-1, footprint)
        if footprint:
            footprint(os.getpid())
        # A V8 heap abort must not produce a potentially large core file.
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if requested_signal:
            return 128 + requested_signal
        print(f'test guard: serial files, {args.timeout_seconds:g}s deadline, '
              f'{args.memory_mib:g} MiB process-group memory threshold', file=sys.stderr)
        child = None
        peak = 0
        try:
            child = subprocess.Popen(command, cwd=ROOT, start_new_session=True)
            record_group(lock, child.pid)
            started, wall_started = time.monotonic(), time.time()
            while True:
                if requested_signal:
                    return 128 + requested_signal
                if child.poll() is not None:
                    return child.returncode if child.returncode >= 0 else 128 - child.returncode
                # Monotonic protects against clock rollback; wall time also
                # expires on wake where a monotonic clock excludes sleep.
                if max(time.monotonic() - started, time.time() - wall_started) >= args.timeout_seconds:
                    print('test guard: external deadline exceeded; stopping test process group.', file=sys.stderr)
                    return 124
                used = group_memory(child.pid, footprint)
                peak = max(peak, used)
                if used > args.memory_mib * MIB:
                    print(f'test guard: memory threshold exceeded ({used / MIB:.0f} MiB); '
                          'stopping test process group.', file=sys.stderr)
                    return 137
                time.sleep(0.1)
        finally:
            # Also remove descendants left behind by a completed or interrupted runner.
            if child is not None:
                stop_group(child)
                record_group(lock)
                print(f'test guard: peak sampled memory {peak / MIB:.0f} MiB; process group stopped.', file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout-seconds', type=float, default=120)
    parser.add_argument('--memory-mib', type=float, default=1536)
    parser.add_argument('--lock-file', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('node_args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if any(not math.isfinite(value) or value <= 0 for value in (args.timeout_seconds, args.memory_mib)):
        parser.error('timeout and memory threshold must be finite positive numbers')
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, interrupt)
    try:
        return run(args)
    except AlreadyRunning as error:
        print(f'test guard: {error}', file=sys.stderr)
        return 75
    except Exception as error:
        # Never silently run without the memory monitor (e.g. denied ps access).
        print(f'test guard: unable to run safely: {error}', file=sys.stderr)
        return 125


if __name__ == '__main__':
    sys.exit(main())
