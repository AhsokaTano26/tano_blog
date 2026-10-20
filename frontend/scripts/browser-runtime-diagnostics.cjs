'use strict';

// Keep the native callback timing and error handling intact. Only retain bounded
// geometry/registration metadata, never form values or article contents.
function observeResizeDiagnostics() {
  if (typeof window.ResizeObserver !== 'function') return;
  const NativeObserver = window.ResizeObserver;
  const recent = [];
  let sequence = 0;
  window.ResizeObserver = class extends NativeObserver {
    constructor(callback) {
      const id = ++sequence;
      const stack = new Error('ResizeObserver registration').stack?.slice(0, 1200);
      super(function (entries, observer) {
        recent.push({
          id, stack, time: performance.now(),
          entries: entries.slice(0, 8).map(({ target, contentRect }) => ({
            tag: target.tagName, id: target.id, class: target.getAttribute('class')?.slice(0, 200),
            role: target.getAttribute('role'), width: contentRect.width, height: contentRect.height,
          })),
        });
        if (recent.length > 16) recent.shift();
        return callback.call(this, entries, observer);
      });
    }
  };
  window.addEventListener('error', event => {
    if (!event.message?.includes('ResizeObserver')) return;
    console.warn(`BROWSER_RESIZE_DIAGNOSTIC ${JSON.stringify({
      url: location.href, message: event.message,
      recent: recent.filter(item => performance.now() - item.time < 2000),
    })}`);
  });
}

async function collectRuntimeErrors(context, engine, errors) {
  await context.addInitScript(observeResizeDiagnostics);
  context.on('page', page => {
    page.on('pageerror', error => {
      const detail = `${page.url()}: ${error.message.slice(0, 500)}`;
      if (errors.length < 10) errors.push(detail);
      process.stderr.write(`PAGE_ERROR ${engine}: ${detail}\n`);
    });
    page.on('console', message => {
      if (message.text().startsWith('BROWSER_RESIZE_DIAGNOSTIC ')) {
        process.stderr.write(`${engine}: ${message.text()}\n`);
      }
    });
  });
}

module.exports = { collectRuntimeErrors };
