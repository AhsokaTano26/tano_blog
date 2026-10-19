/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const previousRun = process.env.TANO_BROWSER_SCHEMA;
process.env.TANO_BROWSER_SCHEMA = 'e2e_port_probe';
const { vacant } = require('../scripts/browser-environment.cjs');
if (previousRun === undefined) delete process.env.TANO_BROWSER_SCHEMA;
else process.env.TANO_BROWSER_SCHEMA = previousRun;

for (const host of ['127.0.0.1', '::1']) {
  test(`browser preflight rejects an existing ${host} listener`, async t => {
    const server = net.createServer();
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host, port: 0, ipv6Only: true }, resolve);
    });
    await assert.rejects(vacant(server.address().port), /unavailable/);
  });
}
