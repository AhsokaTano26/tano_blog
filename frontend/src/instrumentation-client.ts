if (process.env.NODE_ENV === 'development' && typeof performance !== 'undefined' && typeof performance.measure === 'function') {
  const measure = performance.measure;

  performance.measure = function (this: Performance, ...args: Parameters<Performance['measure']>) {
    const [name, options] = args;
    if (options && typeof options === 'object' && typeof options.end === 'number' && options.end < 0) {
      const { start, detail } = options;
      const track = (detail as { devtools?: { trackGroup?: string } } | undefined)?.devtools?.trackGroup;
      // React Flight can report a negative end time for notFound() or aborted renders.
      // Record the affected DevTools entry as an instant marker (react/react#37561).
      if (track === 'Server Components ⚛' && typeof name === 'string' && name.startsWith('\u200b')
        && typeof start === 'number' && Number.isFinite(start) && start >= 0) {
        return measure.call(this, name, { ...options, end: start });
      }
    }
    return measure.apply(this, args);
  };
}
