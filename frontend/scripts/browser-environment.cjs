'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const SITE = 'http://127.0.0.1:3097';
const API = 'http://127.0.0.1:18080';
const runId = process.env.TANO_BROWSER_SCHEMA;
if (!/^e2e_[a-z0-9_]+$/.test(runId || '')) throw new Error('Use npm run test:browser so each run has isolated evidence');
const OUT = path.join(FRONTEND, 'test-results/browser', runId);
const children = [];
const descriptors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function vacant(port) {
  // macOS can bind an IPv6 socket while a separate IPv4 listener owns the port.
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', error => {
        if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return resolve();
        reject(new Error(`Port ${port} on ${host} is unavailable; browser tests never reuse a running service`));
      });
      server.listen({ port, host, ipv6Only: true }, () => server.close(resolve));
    });
  }
}

function start(name, executable, args, env, cwd) {
  const fd = fs.openSync(path.join(OUT, `${name}.log`), 'w');
  descriptors.push(fd);
  const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, detached: false, stdio: ['ignore', fd, fd] });
  child.on('error', () => {});
  children.push(child);
  return child;
}

async function ready(url, child, seconds = 30) {
  const deadline = Date.now() + seconds * 1000;
  let lastFailure = 'no response';
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Test service exited before becoming ready; see service logs');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await res.arrayBuffer();
      if (res.ok) return;
      lastFailure = `HTTP ${res.status} at ${res.url}`;
    } catch (error) { lastFailure = error.cause?.code || error.name; }
    await delay(100);
  }
  throw new Error(`Test service startup deadline exceeded (${new URL(url).pathname}: ${lastFailure})`);
}

async function startServices() {
  const scratch = process.env.TANO_BROWSER_RUN_DIR;
  if (!scratch || !process.env.TANO_BROWSER_SCHEMA) throw new Error('Use npm run test:browser so the watchdog owns the workload');
  fs.mkdirSync(OUT, { recursive: true });
  const standalone = path.join(FRONTEND, '.next/standalone');
  if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Run npm run build before browser tests');
  const routes = JSON.parse(fs.readFileSync(path.join(FRONTEND, '.next/routes-manifest.json'), 'utf8'));
  if (!routes.rewrites.fallback.some(route => route.source === '/api/:path*' && route.destination === `${API}/api/:path*`)) {
    throw new Error(`Browser tests need a production build with API_UPSTREAM_URL=${API}`);
  }
  await vacant(3097);
  await vacant(18080);
  // Mark before CREATE, so abrupt termination in between still drops this schema.
  fs.writeFileSync(path.join(scratch, 'schema-created'), '1');
  const dsn = await new Promise((resolve, reject) => {
    const child = spawn(path.join(ROOT, 'backend/browserfixture'), ['create', process.env.TANO_BROWSER_SCHEMA], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume(); // Never echo DSNs or driver errors into CI logs.
    child.once('error', () => reject(new Error('Cannot launch isolated database fixture')));
    child.once('close', code => {
      if (code !== 0) return reject(new Error('Isolated database setup failed; verify TEST_DATABASE_DSN and schema permissions'));
      try { resolve(JSON.parse(output).dsn); } catch { reject(new Error('Invalid fixture output')); }
    });
  });
  const uploads = path.join(scratch, 'uploads');
  const backups = path.join(scratch, 'backups');
  fs.mkdirSync(uploads); fs.mkdirSync(backups);
  fs.writeFileSync(path.join(uploads, 'browser-tall.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="1800"><rect width="360" height="1800" fill="#789bcb"/><path d="M0 300H360M0 600H360M0 900H360" stroke="#fff" stroke-width="12"/></svg>');
  const password = crypto.randomBytes(18).toString('hex');
  const api = start('api', path.join(ROOT, 'backend/server'), [], {
    DB_DSN: dsn, JWT_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_PASSWORD: password,
    SERVER_PORT: '18080', UPLOAD_DIR: uploads, BACKUP_DIR: backups, SITE_URL: SITE,
    GIN_MODE: 'release', CORS_ORIGINS: SITE, TRUSTED_PROXIES: '127.0.0.1,::1',
    DB_MAX_OPEN_CONNS: '4', DB_MAX_IDLE_CONNS: '1',
  }, ROOT);
  await ready(`${API}/health`, api);
  fs.cpSync(path.join(FRONTEND, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  fs.cpSync(path.join(FRONTEND, 'public'), path.join(standalone, 'public'), { recursive: true });
  const next = start('next', process.execPath, [path.join(standalone, 'server.js')], {
    PORT: '3097', HOSTNAME: '127.0.0.1', API_UPSTREAM_URL: API, NEXT_PUBLIC_API_URL: '',
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
  }, standalone);
  await ready(`${SITE}/admin/login`, next);
  return { password };
}

async function stopServices() {
  for (const child of children.toReversed()) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await delay(300);
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (const fd of descriptors) fs.closeSync(fd);
  // Python watchdog also kills the complete group on every exit path.
}

module.exports = { SITE, OUT, startServices, stopServices, vacant };
