import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('fixture readiness timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function start(t, ready) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-process-'));
  mkdirSync(join(dir, 'next')); mkdirSync(join(dir, 'bin'));
  // Only filesystem locations are substituted. Signal/wait logic is the real
  // entrypoint, executed against child processes with observable graceful exits.
  const source = readFileSync(fileURLToPath(new URL('../../docker-entrypoint.sh', import.meta.url)), 'utf8');
  writeFileSync(join(dir, 'entrypoint.sh'), source.replaceAll('/app', dir));
  const child = `const fs=require('fs');const path=require('path');const prefix=process.env.CHILD_PREFIX||path.resolve(__dirname,'../frontend');fs.writeFileSync(prefix+'.pid',String(process.pid));process.on('SIGTERM',()=>{setTimeout(()=>{fs.writeFileSync(prefix+'.drained','yes');process.exit(0)},150)});setInterval(()=>{},1000);`;
  writeFileSync(join(dir, 'next/server.js'), child);
  writeFileSync(join(dir, 'server'), `#!/bin/sh\nCHILD_PREFIX='${dir}/backend' exec '${process.execPath}' '${dir}/next/server.js'\n`, { mode: 0o755 });
  writeFileSync(join(dir, 'bin/wget'), `#!/bin/sh\nexit ${ready ? 0 : 1}\n`, { mode: 0o755 });
  const processChild = spawn('bash', [join(dir, 'entrypoint.sh')], { env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; processChild.stdout.on('data', d => { output += d; }); processChild.stderr.on('data', d => { output += d; });
  const exited = new Promise(resolve => processChild.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill('SIGKILL');
    for (const name of ['backend', 'frontend']) {
      try { process.kill(Number(readFileSync(join(dir, `${name}.pid`), 'utf8')), 'SIGKILL'); } catch { /* already exited */ }
    }
    await exited;
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, processChild, exited, output: () => output };
}

for (const ready of [false, true]) {
  test(`SIGTERM ${ready ? 'after readiness' : 'during health polling'} waits for both children to drain`, async t => {
    const app = start(t, ready);
    await until(() => existsSync(join(app.dir, 'backend.pid')) && existsSync(join(app.dir, 'frontend.pid')));
    if (ready) await until(() => app.output().includes('Ready'));
    app.processChild.kill('SIGTERM');
    const exit = await app.exited;
    assert.equal(exit.code, 0, app.output());
    assert.ok(existsSync(join(app.dir, 'backend.drained')), 'backend did not drain before parent exit');
    assert.ok(existsSync(join(app.dir, 'frontend.drained')), 'frontend did not drain before parent exit');
  });
}

test('a failed backend stops its sibling and preserves a failure exit status', async t => {
  const app = start(t, true);
  await until(() => existsSync(join(app.dir, 'backend.pid')) && existsSync(join(app.dir, 'frontend.pid')));
  process.kill(Number(readFileSync(join(app.dir, 'backend.pid'), 'utf8')), 'SIGKILL');
  const exit = await app.exited;
  assert.notEqual(exit.code, 0);
  assert.ok(existsSync(join(app.dir, 'frontend.drained')), 'sibling not drained');
});
