'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- The entry must recheck the saved setting on the server. */
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

function useLegacyAvailability(initial: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(initial);

  useEffect(() => {
    let current: AbortController | undefined;
    function refresh() {
      if (document.visibilityState !== 'visible') return;
      current?.abort();
      const controller = new AbortController();
      current = controller;
      api.getLegacyAvailability(controller.signal).then(
        result => {
          if (!controller.signal.aborted) setEnabled(typeof result?.enabled === 'boolean' ? result.enabled : null);
        },
        () => { if (!controller.signal.aborted) setEnabled(null); },
      );
    }
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      current?.abort();
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(interval);
    };
  }, []);

  return enabled;
}

export function LegacyEntry() {
  const enabled = useLegacyAvailability(false);
  // A full navigation reads the server setting even after browser Back.
  return enabled ? <><span aria-hidden="true">/</span><a href="/legacy">旧版入口</a></> : null;
}

export function LegacyAvailability({ children }: { children: ReactNode }) {
  const enabled = useLegacyAvailability(true);
  useEffect(() => {
    if (enabled === false) window.location.reload();
  }, [enabled]);
  if (enabled === null) return (
    <main className="mx-auto p-8 text-center">
      <p role="status">暂时无法确认页面是否可用。</p>
      <a href="/" className="mt-3 inline-block underline">返回首页</a>
    </main>
  );
  return enabled ? children : null;
}
