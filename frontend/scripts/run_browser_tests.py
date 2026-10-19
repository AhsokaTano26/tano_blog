#!/usr/bin/env python3
"""Run the isolated real-browser suite using the unit-test watchdog and lock."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import uuid

import run_tests as guard


def write_artifacts(directory, state):
    temporary = directory / 'results.json.tmp'
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(directory / 'results.json')


def begin_artifacts(root, run_id, browser):
    directory = root / run_id
    directory.mkdir(parents=True, exist_ok=False)
    write_artifacts(directory, {
        'run_id': run_id, 'browser': browser, 'status': 'running',
        'exit_code': None, 'checks': [], 'failure': None,
    })
    return directory


def finish_artifacts(directory, run_id, browser, result, failure=None):
    try:
        state = json.loads((directory / 'results.json').read_text())
        if not isinstance(state, dict):
            state = {}
    except (OSError, ValueError):
        state = {}
    # Only Python can finalize success, after the watchdog and schema cleanup.
    if result == 0 and state.get('browser_status') != 'passed':
        result = 1
        failure = failure or 'Browser runner exited without a completed result.'
    reasons = {
        75: 'Another test workload is running; this browser run did not start.',
        124: 'Browser watchdog deadline exceeded.',
        125: 'Browser watchdog could not run safely.',
        137: 'Browser workload exceeded the memory threshold or was killed.',
    }
    state.update({
        'run_id': run_id, 'browser': browser,
        'status': 'passed' if result == 0 else 'failed', 'exit_code': result,
        'completed_at': datetime.now(timezone.utc).isoformat(),
        'failure': None if result == 0 else (
            failure or state.get('failure') or reasons.get(result, f'Browser runner exited with code {result}.')
        ),
    })
    write_artifacts(directory, state)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', choices=['chromium', 'webkit', 'all'], default='all')
    args = parser.parse_args()
    fixture = guard.ROOT.parent / 'backend/browserfixture'
    if not fixture.is_file() or not (guard.ROOT.parent / 'backend/server').is_file():
        parser.error('build backend/server and backend/browserfixture first; see docs/browser-tests.md')
    if not os.environ.get('TEST_DATABASE_DSN'):
        parser.error('TEST_DATABASE_DSN must point to a disposable loopback PostgreSQL database')
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, guard.interrupt)
    scratch = Path(tempfile.mkdtemp(prefix='tano-browser-'))
    schema = 'e2e_' + uuid.uuid4().hex
    os.environ['TANO_BROWSER_RUN_DIR'] = str(scratch)
    os.environ['TANO_BROWSER_SCHEMA'] = schema
    os.environ['TANO_BROWSER_ENGINE'] = args.browser
    os.environ['NODE_OPTIONS'] = '--max-old-space-size=512'
    os.environ['GOMAXPROCS'] = '2'
    os.environ['GOMEMLIMIT'] = '384MiB'
    result = 125
    failure = None
    artifacts = None
    try:
        artifacts = begin_artifacts(guard.ROOT / 'test-results/browser', schema, args.browser)
        print(f'browser guard: run {schema}; evidence: {artifacts}', file=sys.stderr)
        result = guard.run(argparse.Namespace(lock_file=None, node_args=[], timeout_seconds=300, memory_mib=3072),
                           command=['node', '--max-old-space-size=512', 'scripts/browser-regressions.cjs'])
    except guard.AlreadyRunning as error:
        print(f'browser guard: {error}', file=sys.stderr)
        result = 75
    except Exception as error:
        print(f'browser guard: unable to run safely: {error}', file=sys.stderr)
    finally:
        # The watchdog has stopped its entire process group before DB cleanup.
        # Only this invocation's randomly named schema can ever be dropped.
        if (scratch / 'schema-created').exists():
            try:
                cleanup = subprocess.run([str(fixture), 'drop', schema], capture_output=True, timeout=15)
                if cleanup.returncode:
                    raise RuntimeError('isolated schema cleanup failed')
            except Exception:
                print(f'browser guard: cleanup failed; isolated schema {schema} retained for inspection', file=sys.stderr)
                result = result or 1
                failure = 'Isolated schema cleanup failed; see runner output.'
        try:
            shutil.rmtree(scratch)
        except OSError:
            print('browser guard: temporary file cleanup failed', file=sys.stderr)
            result = result or 1
            failure = 'Temporary file cleanup failed; see runner output.'
        if artifacts is not None:
            result = finish_artifacts(artifacts, schema, args.browser, result, failure)
    return result


if __name__ == '__main__':
    sys.exit(main())
