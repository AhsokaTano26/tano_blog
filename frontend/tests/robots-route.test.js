/* eslint-disable @typescript-eslint/no-require-imports -- Node regressions reuse the TypeScript loader. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');

test('robots.txt uses the configured backend alongside the sitemap route', async () => {
  const config = require('../next.config.ts').default;
  const { fallback } = await config.rewrites();
  const robots = fallback.find(route => route.source === '/robots.txt');
  const sitemap = fallback.find(route => route.source === '/sitemap.xml');
  assert.equal(Boolean(robots), true, 'the frontend must serve the backend robots policy');
  assert.equal(robots.destination, sitemap.destination.replace(/sitemap\.xml$/, 'robots.txt'));
});
