/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node integration probe. */
// Opt-in real Next transport test: node tests/upload-proxy.integration.js
// Uses an isolated app so it never touches the project's .next build directory.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const project = path.resolve(__dirname, '..');
const MiB = 1024 * 1024;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function sendUpload(port, route, filename, size, cancelAt) {
  const boundary = 'stream-test-boundary';
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  let responseStarted = false;
  let releaseResponse;
  const responseStart = new Promise((resolve) => { releaseResponse = resolve; });
  const req = http.request({
    hostname: '127.0.0.1', port, path: route, method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': prefix.length + size + suffix.length,
      Cookie: 'test_auth=present', 'X-CSRF-Token': 'test-csrf',
    },
  });
  req.setTimeout(30000, () => req.destroy(new Error('Upload timeout')));
  const result = new Promise((resolve, reject) => {
    req.on('response', (res) => {
      responseStarted = true;
      releaseResponse();
      const body = [];
      res.on('data', (chunk) => body.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(body).toString() }));
      res.on('error', reject);
    });
    req.on('error', (error) => {
      releaseResponse();
      if (cancelAt) resolve({ cancelled: true });
      else if (!responseStarted) reject(error);
    });
  });
  async function write(chunk) {
    if (responseStarted || req.destroyed) return;
    if (req.write(chunk)) return;
    let onDrain, onError, onClose;
    const drained = new Promise((resolve) => {
      onDrain = onError = onClose = resolve;
      req.once('drain', onDrain);
      req.once('error', onError);
      req.once('close', onClose);
    });
    await Promise.race([drained, responseStart]);
    req.off('drain', onDrain);
    req.off('error', onError);
    req.off('close', onClose);
  }
  await write(prefix);
  const chunk = Buffer.alloc(64 * 1024);
  let sent = 0;
  while (sent < size && !responseStarted && !req.destroyed) {
    const next = chunk.subarray(0, Math.min(chunk.length, size - sent));
    await write(next);
    sent += next.length;
    if (cancelAt && sent >= cancelAt) {
      req.destroy(new Error('User cancelled'));
      break;
    }
  }
  if (!responseStarted && !req.destroyed) {
    await write(suffix);
    req.end();
  }
  const response = await result;
  req.destroy();
  return { ...response, sent, expected: prefix.length + size + suffix.length };
}

async function main() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tano-upload-next-'));
  let next;
  let logs = '';
  const records = [];
  const upstream = http.createServer((req, res) => {
    const record = { path: req.url, read: 0, aborted: false, cookie: req.headers.cookie, csrf: req.headers['x-csrf-token'] };
    records.push(record);
    req.on('aborted', () => { record.aborted = true; });
    req.on('data', (chunk) => {
      record.read += chunk.length;
      if (chunk.includes(Buffer.from('early.invalid'))) {
        req.pause();
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unsupported extension' }));
      }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: record.read }));
    });
  });
  try {
    const upstreamPort = await listen(upstream);
    const portReservation = http.createServer();
    const nextPort = await listen(portReservation);
    await new Promise((resolve) => portReservation.close(resolve));
    for (const file of [
      'next.config.ts', 'tsconfig.json', 'package.json', 'src/lib/stream-proxy.ts',
      'src/app/api/v1/admin/upload/route.ts', 'src/app/api/v1/admin/restore/upload/route.ts',
    ]) {
      await fs.mkdir(path.dirname(path.join(folder, file)), { recursive: true });
      await fs.copyFile(path.join(project, file), path.join(folder, file));
    }
    await fs.symlink(path.join(project, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
    await fs.writeFile(path.join(folder, 'src/app/layout.tsx'), 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }');
    await fs.writeFile(path.join(folder, 'src/app/page.tsx'), 'export default function Page() { return <main>Upload transport test</main>; }');
    next = spawn(process.execPath, [path.join(project, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(nextPort)], {
      cwd: folder, env: { ...process.env, API_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    next.stdout.on('data', (data) => { logs += data.toString(); });
    next.stderr.on('data', (data) => { logs += data.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (logs.includes('Ready in')) { ready = true; break; }
      if (next.exitCode !== null) throw new Error(`Next exited: ${logs}`);
      await delay(500);
    }
    assert.ok(ready, `Next did not start: ${logs}`);
    const warmup = await sendUpload(nextPort, '/api/v1/admin/upload', 'warmup.txt', 1024);
    assert.equal(warmup.status, 201, warmup.body);

    for (const route of ['/api/v1/admin/upload', '/api/v1/admin/restore/upload']) {
      const result = await sendUpload(nextPort, route, 'large.mp4', 100 * MiB);
      assert.equal(result.status, 201, result.body);
      assert.equal(JSON.parse(result.body).received, result.expected);
      const record = records.at(-1);
      assert.equal(record.path, route);
      assert.equal(record.cookie, 'test_auth=present');
      assert.equal(record.csrf, 'test-csrf');
      console.log(`${route}: ${result.expected} bytes reached upstream with 50MB clone cap`);
    }

    const rejected = await sendUpload(nextPort, '/api/v1/admin/upload', 'early.invalid', 100 * MiB);
    assert.equal(rejected.status, 400, rejected.body);
    assert.match(rejected.body, /unsupported extension/);
    assert.ok(records.at(-1).read < MiB, `upstream read ${records.at(-1).read} bytes before rejecting`);
    assert.ok(rejected.sent < 100 * MiB, 'client sent whole rejected upload');
    console.log(`early rejection: upstream read ${records.at(-1).read} bytes; client stopped at ${rejected.sent} bytes`);

    const countBeforeCancel = records.length;
    await sendUpload(nextPort, '/api/v1/admin/upload', 'cancel.mp4', 100 * MiB, MiB);
    for (let attempt = 0; attempt < 50 && !records[countBeforeCancel]?.aborted; attempt++) await delay(100);
    const cancelled = records[countBeforeCancel];
    assert.ok(cancelled?.aborted, 'client cancellation did not abort upstream');
    assert.ok(cancelled.read <= MiB + 1024, `cancelled upstream received ${cancelled.read}`);
    console.log(`cancellation: upstream aborted after ${cancelled.read} bytes`);
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (next && next.exitCode === null) {
      next.kill('SIGTERM');
      await Promise.race([once(next, 'exit'), delay(5000)]);
      if (next.exitCode === null) next.kill('SIGKILL');
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
