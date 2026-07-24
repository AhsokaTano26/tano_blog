'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const storagePrefix = 'tano-blog:scroll-position:';

function storageKey(path: string) {
  return `${storagePrefix}${path}`;
}

/** Restores the list position after navigating to an article and returning. */
export function ScrollPositionRestoration() {
  const pathname = usePathname();
  const restoreOnNextRoute = useRef(false);
  const restoreRouteKey = useRef('');

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const onPopState = () => {
      restoreOnNextRoute.current = true;
      restoreRouteKey.current = `${window.location.pathname}${window.location.search}`;
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank') return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || !destination.pathname.startsWith('/posts/')) return;
      sessionStorage.setItem(storageKey(`${window.location.pathname}${window.location.search}`), String(window.scrollY));
    };

    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    if (!restoreOnNextRoute.current) return;
    restoreOnNextRoute.current = false;

    const saved = Number(sessionStorage.getItem(storageKey(restoreRouteKey.current || pathname)) || '0');
    if (!Number.isFinite(saved) || saved <= 0) return;

    let attempts = 0;
    const restore = () => {
      window.scrollTo(0, saved);
      attempts += 1;
      // List data may arrive after the route change; retry briefly until the
      // page is tall enough to place the viewport at the saved position.
      if (attempts < 20 && Math.abs(window.scrollY - saved) > 2) {
        window.setTimeout(restore, 50);
      }
    };
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
