/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the project's TypeScript compiler. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, ...args);
};

test('upload route forwards the live request stream and streams the upstream response', async () => {
  const { POST } = require('../src/app/api/v1/admin/upload/route.ts');
  const savedFetch = global.fetch;
  const abort = new AbortController();
  let uploadController;
  const body = new ReadableStream({ start(controller) { uploadController = controller; controller.enqueue(new TextEncoder().encode('first chunk')); } });
  let responseController;
  const upstreamBody = new ReadableStream({ start(controller) { responseController = controller; controller.enqueue(new TextEncoder().encode('response chunk')); } });
  let upstreamSignal;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v1/admin/upload');
    assert.equal(options.body, body, 'the original stream must reach fetch before upload completion');
    assert.equal(options.duplex, 'half');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('cookie'), 'session=valid');
    assert.equal(options.headers.get('x-csrf-token'), 'csrf');
    assert.equal(options.headers.get('authorization'), 'Bearer token');
    assert.equal(options.headers.has('x-forwarded-for'), false);
    upstreamSignal = options.signal;
    return new Response(upstreamBody, { status: 201, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'refresh=1; HttpOnly' } });
  };
  try {
    const request = new Request('http://app.test/api/v1/admin/upload?upstream=attacker.test', {
      method: 'POST', body, duplex: 'half', signal: abort.signal,
      headers: { 'Content-Type': 'multipart/form-data; boundary=test', Cookie: 'session=valid', 'X-CSRF-Token': 'csrf', Authorization: 'Bearer token', 'X-Forwarded-For': 'attacker' },
    });
    const response = await POST(request);
    assert.equal(response.status, 201);
    assert.match(response.headers.get('set-cookie'), /refresh=1/);
    const reader = response.body.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'response chunk');
    abort.abort();
    assert.equal(upstreamSignal.aborted, true, 'client cancellation must reach the upstream fetch');
    responseController.close();
    uploadController.close();
    await reader.cancel();
  } finally { global.fetch = savedFetch; }
});

test('restore proxy preserves an upstream error without following redirects', async () => {
  const { POST } = require('../src/app/api/v1/admin/restore/upload/route.ts');
  const savedFetch = global.fetch;
  global.fetch = async url => {
    assert.equal(new URL(url).pathname, '/api/v1/admin/restore/upload');
    return Response.json({ error: 'invalid backup' }, { status: 400 });
  };
  try {
    const response = await POST(new Request('http://app.test/upload', { method: 'POST', body: 'backup' }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid backup' });
  } finally { global.fetch = savedFetch; }
});

class UploadXHR extends EventTarget {
  static current;
  upload = new EventTarget();
  headers = {};
  status = 201;
  responseText = '{"media":{"url":"/uploads/file.png"}}';
  constructor() { super(); UploadXHR.current = this; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(key, value) { this.headers[key] = value; }
  send(body) { this.body = body; }
  abort() { this.dispatchEvent(new Event('abort')); }
  elapse(milliseconds) { if (this.timeout > 0 && milliseconds >= this.timeout) this.dispatchEvent(new Event('timeout')); }
}

test('HTML upload rejections explain proxy status instead of reporting invalid JSON', async () => {
  const { uploadForm } = require('../src/lib/upload.ts');
  global.XMLHttpRequest = UploadXHR;
  const failed = uploadForm('/upload', new FormData(), '');
  UploadXHR.current.status = 413;
  UploadXHR.current.responseText = '<html>proxy failure</html>';
  UploadXHR.current.dispatchEvent(new Event('load'));
  await assert.rejects(failed, error => {
    assert.match(error.message, /HTTP 413/);
    assert.match(error.message, /过大/);
    assert.doesNotMatch(error.message, /响应无效|<html>/);
    return true;
  });
});

test('upload helper exposes byte progress, CSRF credentials and successful JSON', async () => {
  const { uploadForm } = require('../src/lib/upload.ts');
  global.XMLHttpRequest = UploadXHR;
  const progress = [];
  const form = new FormData();
  form.append('file', new File(['photo'], 'photo.png'));
  const pending = uploadForm('/api/v1/admin/upload', form, 'csrf', { onProgress: event => progress.push(event) });
  const xhr = UploadXHR.current;
  assert.equal(xhr.body, form);
  assert.equal(xhr.withCredentials, true);
  assert.equal(xhr.headers['X-CSRF-Token'], 'csrf');
  assert.equal(Object.keys(xhr.headers).some(key => key.toLowerCase() === 'content-type'), false);
  const event = new Event('progress');
  Object.assign(event, { loaded: 25, total: 100, lengthComputable: true });
  xhr.upload.dispatchEvent(event);
  xhr.dispatchEvent(new Event('load'));
  assert.deepEqual(progress, [{ loaded: 25, total: 100, percent: 25 }]);
  assert.deepEqual(await pending, { media: { url: '/uploads/file.png' } });
});

test('upload helper aborts active requests and rejects HTTP errors', async () => {
  const { uploadForm } = require('../src/lib/upload.ts');
  global.XMLHttpRequest = UploadXHR;
  const controller = new AbortController();
  const cancelled = uploadForm('/upload', new FormData(), '', { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const failed = uploadForm('/upload', new FormData(), '');
  UploadXHR.current.status = 413;
  UploadXHR.current.responseText = '{"error":"file too large"}';
  UploadXHR.current.dispatchEvent(new Event('load'));
  await assert.rejects(failed, /file too large/);
});

test('an upload that never finishes times out within thirty minutes and releases its abort listener', async () => {
  const { uploadForm } = require('../src/lib/upload.ts');
  global.XMLHttpRequest = UploadXHR;
  const controller = new AbortController();
  let failure;
  const pending = uploadForm('/upload', new FormData(), '', { signal: controller.signal }).catch(error => { failure = error; });
  const xhr = UploadXHR.current;
  let aborts = 0;
  xhr.addEventListener('abort', () => { aborts++; });
  xhr.elapse(30 * 60 * 1000);
  await Promise.resolve();
  assert.match(failure?.message || '', /上传超时/);
  await pending;
  controller.abort();
  assert.equal(aborts, 0);
});

test('non-string JSON upload errors reject instead of leaving the transfer pending', async t => {
  const { uploadForm } = require('../src/lib/upload.ts');
  global.XMLHttpRequest = UploadXHR;
  let listenerError;
  // Browsers report listener exceptions without rejecting the caller's promise.
  t.mock.method(UploadXHR.prototype, 'addEventListener', function (type, listener, options) {
    return EventTarget.prototype.addEventListener.call(this, type, event => {
      try { listener.call(this, event); } catch (error) { listenerError = error; }
    }, options);
  });
  const pending = uploadForm('/upload', new FormData(), '').then(() => null, error => error);
  UploadXHR.current.status = 503;
  UploadXHR.current.responseText = '{"error":{"message":"malformed upstream error"}}';
  UploadXHR.current.dispatchEvent(new Event('load'));
  const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 20))]);
  assert.equal(listenerError === undefined, true, 'error handling must not throw from the XHR listener');
  assert.equal(result instanceof Error, true, 'a rejected HTTP response must settle the upload promise');
  assert.match(result.message, /HTTP 503/);
});
