"""Integration checks for the test runner's process and memory protections."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
from types import SimpleNamespace

import run_tests as guard
import run_browser_tests as browser_guard

RUNNER = Path(__file__).with_name('run_tests.py')
suite_lock = None
suite_lock_file = None


def setUpModule():
    # Validation of the watchdog must not overlap the real frontend suite.
    global suite_lock, suite_lock_file
    suite_lock = guard.test_lock()
    suite_lock_file = suite_lock.__enter__()


def tearDownModule():
    if suite_lock is not None:
        suite_lock.__exit__(None, None, None)


class CommandTests(unittest.TestCase):
    def test_explicit_browser_command_uses_same_guard_and_working_directory(self):
        args = SimpleNamespace(lock_file=None, node_args=[], timeout_seconds=1, memory_mib=96)
        child = mock.Mock(pid=12345)
        child.poll.return_value = 7
        child.returncode = 7
        with tempfile.TemporaryDirectory() as directory:
            args.lock_file = Path(directory) / 'browser.lock'
            with mock.patch.object(guard, 'group_memory', return_value=0), \
                    mock.patch.object(guard, 'mac_footprint_reader', return_value=lambda _pid: 0), \
                    mock.patch.object(guard.subprocess, 'Popen', return_value=child) as spawn, \
                    mock.patch.object(guard, 'stop_group') as stop:
                self.assertEqual(guard.run(args, command=['node', 'browser.cjs']), 7)
                spawn.assert_called_once_with(['node', 'browser.cjs'], cwd=guard.ROOT, start_new_session=True)
                stop.assert_called_once_with(child)

    def test_forwarded_options_cannot_override_safety_flags(self):
        for option in ('--test-concurrency=8', '--test-concurrency',
                       '--max-old-space-size=8192', '--max_old_space_size=8192',
                       '--test-timeout=0', '--eval=while(true){}'):
            with self.subTest(option=option), self.assertRaises(ValueError):
                guard.node_command([option])

    def test_name_pattern_value_is_not_mistaken_for_a_filename(self):
        command = guard.node_command(['--test-name-pattern', 'media'])
        self.assertIn('--test-name-pattern=media', command)
        self.assertTrue(any(path.endswith('audit-regressions.test.js') for path in command))

    def test_signals_only_request_shutdown(self):
        previous = guard.requested_signal
        try:
            guard.interrupt(signal.SIGTERM, None)
            self.assertEqual(guard.requested_signal, signal.SIGTERM)
        finally:
            guard.requested_signal = previous

    def test_monitor_permission_failure_does_not_launch_node(self):
        args = SimpleNamespace(lock_file=None, node_args=[], timeout_seconds=1, memory_mib=96)
        with tempfile.TemporaryDirectory() as directory:
            args.lock_file = Path(directory) / 'permission.lock'
            with mock.patch.object(guard, 'group_memory', side_effect=PermissionError), \
                    mock.patch.object(guard.subprocess, 'Popen') as spawn:
                with self.assertRaises(PermissionError):
                    guard.run(args)
                spawn.assert_not_called()

    def test_cleanup_sends_kill_even_when_monitoring_stops_working(self):
        child = mock.Mock(pid=12345)
        with mock.patch.object(guard, 'group_processes', side_effect=PermissionError), \
                mock.patch.object(guard.os, 'killpg') as kill:
            with self.assertRaises(PermissionError):
                guard.stop_group(child)
            kill.assert_called_once_with(child.pid, signal.SIGKILL)
            child.wait.assert_called_once()

    def test_memory_is_summed_across_the_process_group(self):
        with mock.patch.object(guard, 'group_processes', return_value=[(123, 40), (456, 70)]):
            self.assertEqual(guard.group_memory(1, None), 110 * 1024)
            self.assertEqual(guard.group_memory(1, lambda pid: {123: 150, 456: 250}[pid]), 400)

    def test_wall_clock_deadline_expires_even_if_monotonic_paused(self):
        args = SimpleNamespace(node_args=[], timeout_seconds=120, memory_mib=96)
        child = mock.Mock(pid=12345)
        child.poll.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            args.lock_file = Path(directory) / 'wake.lock'
            with mock.patch.object(guard, 'group_memory', return_value=0), \
                    mock.patch.object(guard, 'mac_footprint_reader', return_value=lambda _pid: 0), \
                    mock.patch.object(guard.subprocess, 'Popen', return_value=child), \
                    mock.patch.object(guard.time, 'monotonic', return_value=1), \
                    mock.patch.object(guard.time, 'time', side_effect=[1, 1000]), \
                    mock.patch.object(guard, 'stop_group') as stop:
                self.assertEqual(guard.run(args), 124)
                stop.assert_called_once_with(child)

    def test_signal_during_spawn_still_cleans_up(self):
        previous = guard.requested_signal
        child = mock.Mock(pid=12345)
        args = SimpleNamespace(node_args=[], timeout_seconds=1, memory_mib=96)
        def spawn(*_args, **_kwargs):
            guard.interrupt(signal.SIGTERM, None)
            guard.interrupt(signal.SIGINT, None)  # repeated signals never throw
            return child
        try:
            with tempfile.TemporaryDirectory() as directory:
                args.lock_file = Path(directory) / 'spawn.lock'
                with mock.patch.object(guard, 'group_memory', return_value=0), \
                        mock.patch.object(guard, 'mac_footprint_reader', return_value=lambda _pid: 0), \
                        mock.patch.object(guard.subprocess, 'Popen', side_effect=spawn), \
                        mock.patch.object(guard, 'stop_group') as stop:
                    self.assertEqual(guard.run(args), 143)
                    stop.assert_called_once_with(child)
        finally:
            guard.requested_signal = previous


class BrowserArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def read_result(self, directory):
        import json
        return json.loads((directory / 'results.json').read_text())

    def test_runs_keep_separate_artifacts_and_begin_as_running(self):
        first = browser_guard.begin_artifacts(self.root, 'e2e_first', 'chromium')
        second = browser_guard.begin_artifacts(self.root, 'e2e_second', 'webkit')
        self.assertNotEqual(first, second)
        self.assertEqual(first, self.root / 'e2e_first')
        self.assertEqual(self.read_result(first)['run_id'], 'e2e_first')
        self.assertEqual(self.read_result(second)['status'], 'running')
        self.assertIsNone(self.read_result(second)['exit_code'])

    def test_watchdog_failure_preserves_completed_checks_and_records_exit(self):
        import json
        directory = browser_guard.begin_artifacts(self.root, 'e2e_killed', 'all')
        (directory / 'results.json').write_text(json.dumps({
            'status': 'running', 'checks': [{'name': 'login', 'passed': True}],
        }))
        self.assertEqual(browser_guard.finish_artifacts(directory, 'e2e_killed', 'all', 137), 137)
        result = self.read_result(directory)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['exit_code'], 137)
        self.assertEqual(result['checks'], [{'name': 'login', 'passed': True}])
        self.assertIn('memory', result['failure'])

    def test_zero_exit_requires_explicit_pass_and_cleanup_failure_overrides_pass(self):
        import json
        directory = browser_guard.begin_artifacts(self.root, 'e2e_complete', 'chromium')
        self.assertEqual(browser_guard.finish_artifacts(directory, 'e2e_complete', 'chromium', 0), 1)
        self.assertEqual(self.read_result(directory)['status'], 'failed')
        (directory / 'results.json').write_text(json.dumps({'status': 'running', 'browser_status': 'passed', 'checks': []}))
        self.assertEqual(browser_guard.finish_artifacts(directory, 'e2e_complete', 'chromium', 0), 0)
        self.assertEqual(self.read_result(directory)['status'], 'passed')
        self.assertEqual(browser_guard.finish_artifacts(directory, 'e2e_complete', 'chromium', 1), 1)
        self.assertEqual(self.read_result(directory)['status'], 'failed')


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.fixture = self.directory / 'fixture.test.cjs'
        self.lock = self.directory / 'runner.lock'
        self.addCleanup(self.stop_recorded_group)

    def stop_recorded_group(self):
        # Independent outer cleanup: even a broken/killed watchdog cannot leave
        # its probe running. Every probe is also finite and bounded in memory.
        import json
        if not self.lock.exists() or not self.lock.read_text().strip():
            return
        record = json.loads(self.lock.read_text())
        if isinstance(record, dict) and record.get('pgid'):
            if guard.group_processes(record['pgid']):
                try:
                    os.killpg(record['pgid'], signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    if guard.group_processes(record['pgid']):
                        raise

    def command(self, source, *options):
        self.fixture.write_text(source)
        return [sys.executable, str(RUNNER), '--lock-file', str(self.lock),
                *options, '--', str(self.fixture)]

    def start_fixture(self, command, **kwargs):
        # Keep the outer admission lock held even if unittest itself is killed:
        # the inner watchdog releases this inherited FD only after its cleanup.
        process = subprocess.Popen(command, pass_fds=(suite_lock_file.fileno(),), **kwargs)
        deadline = time.monotonic() + 2
        while process.poll() is None and time.monotonic() < deadline:
            try:
                import json
                record = json.loads(self.lock.read_text())
                if record.get('pgid'):
                    # Also preserve the group if the fixture deliberately kills
                    # its inner watchdog and the outer runner then dies.
                    guard.record_group(suite_lock_file, record['pgid'])
                    break
            except (FileNotFoundError, ValueError):
                pass
            time.sleep(0.01)
        return process

    def run_fixture(self, source, *options):
        process = self.start_fixture(self.command(source, *options), stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True)
        try:
            stdout, stderr = process.communicate(timeout=8)
            return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.communicate(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate(timeout=3)
            self.stop_recorded_group()

    def test_preserves_success_and_failure(self):
        for source, expected in [("require('node:test')('ok', () => {});", 0),
                                 ("require('node:test')('bad', () => { throw Error('probe failure'); });", 1)]:
            with self.subTest(expected=expected):
                result = self.run_fixture(source)
                self.assertEqual(result.returncode, expected, result.stderr)

    def test_external_deadline_stops_synchronous_test_and_descendant(self):
        marker = self.directory / 'descendant.pid'
        source = f"""
const {{ spawn }} = require('node:child_process');
const fs = require('node:fs');
require('node:test')('blocked', () => {{
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 4000)'], {{ stdio: 'ignore' }});
  fs.writeFileSync({str(marker)!r}, String(child.pid));
  const end = Date.now() + 4000;
  while (Date.now() < end) {{}}
}});
"""
        result = self.run_fixture(source, '--timeout-seconds', '0.8')
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertIn('deadline', result.stderr)
        self.assertTrue(marker.exists(), 'fixture must have started its descendant')
        pid = int(marker.read_text())
        self.assert_stopped(pid)

    def test_browser_scope_keeps_detached_launch_inside_cleanup_group(self):
        marker = self.directory / 'browser-child.pid'
        scope = RUNNER.with_name('browser-process-scope.cjs')
        source = f"""
require({str(scope)!r});
const {{ spawn }} = require('node:child_process');
const fs = require('node:fs');
require('node:test')('browser launch scope', () => {{
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 4000)'], {{ detached: true, stdio: 'ignore' }});
  fs.writeFileSync({str(marker)!r}, String(child.pid));
  const end = Date.now() + 4000;
  while (Date.now() < end) {{}}
}});
"""
        result = self.run_fixture(source, '--timeout-seconds', '0.8')
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertTrue(marker.exists())
        self.assert_stopped(int(marker.read_text()))

    def assert_stopped(self, pid):
        for _ in range(30):
            result = subprocess.run(['/bin/ps', '-o', 'stat=', '-p', str(pid)],
                                    capture_output=True, text=True)
            if not result.stdout.strip() or result.stdout.strip().startswith('Z'):
                return
            time.sleep(0.05)
        self.fail(f'guard left descendant {pid} running')

    def test_memory_guard_counts_array_buffers(self):
        source = """
require('node:test')('buffer', async () => {
  global.retained = Buffer.alloc(96 * 1024 * 1024, 1);
  await new Promise(resolve => setTimeout(resolve, 4000));
});
"""
        result = self.run_fixture(source, '--memory-mib', '96')
        self.assertEqual(result.returncode, 137, result.stderr)
        self.assertIn('memory', result.stderr)

    def test_duplicate_run_is_rejected_and_lock_recovers_after_interrupt(self):
        marker = self.directory / 'ready'
        source = f"require('node:fs').writeFileSync({str(marker)!r}, 'ready'); setTimeout(() => process.exit(0), 5000);"
        command = self.command(source)
        first = self.start_fixture(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 4
            while not marker.exists() and first.poll() is None and time.monotonic() < deadline:
                time.sleep(0.03)
            self.assertTrue(marker.exists(), 'first run did not start')
            second = subprocess.run(command, capture_output=True, text=True, timeout=3)
            self.assertEqual(second.returncode, 75, second.stderr)
            self.assertIn('already running', second.stderr)
            first.send_signal(signal.SIGTERM)
            first.communicate(timeout=3)
            self.assertEqual(first.returncode, 143)
            result = self.run_fixture("require('node:test')('ok', () => {});")
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            if first.poll() is None:
                first.terminate()
            try:
                first.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                first.kill()
                first.communicate(timeout=3)
            self.stop_recorded_group()

    def test_successful_runner_also_cleans_remaining_descendants(self):
        marker = self.directory / 'remaining.pid'
        source = f"""
const child = require('node:child_process').spawn(process.execPath,
  ['-e', 'setTimeout(() => process.exit(0), 4000)'], {{ stdio: 'ignore' }});
require('node:fs').writeFileSync({str(marker)!r}, String(child.pid));
child.unref();
"""
        result = self.run_fixture(source)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_stopped(int(marker.read_text()))

    def test_stale_record_refuses_duplicate_after_watchdog_is_killed(self):
        marker = self.directory / 'ready'
        source = f"require('node:fs').writeFileSync({str(marker)!r}, 'ready'); setTimeout(() => process.exit(0), 4000);"
        command = self.command(source)
        first = self.start_fixture(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 3
            while not marker.exists() and first.poll() is None and time.monotonic() < deadline:
                time.sleep(0.03)
            self.assertTrue(marker.exists(), 'fixture did not start')
            first.kill()
            first.wait(timeout=3)
            result = subprocess.run(command, capture_output=True, text=True, timeout=3)
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertIn('previous test process group', result.stderr)
        finally:
            if first.poll() is None:
                first.kill()
            first.wait(timeout=3)
            self.stop_recorded_group()


if __name__ == '__main__':
    unittest.main()
