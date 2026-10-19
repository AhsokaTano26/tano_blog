'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const HISTORY_GUARD = '__tanoPostEditorGuard';
interface GuardMarker { id: string; position: 'base' | 'guard' }
interface ReleaseOperation { promise: Promise<void>; resolve: () => void }
interface HistoryGuard {
  id: string;
  url: string;
  hasPrevious: boolean;
  phase: 'armed' | 'returning' | 'asking' | 'releasing' | 'leaving';
  decision?: 'stay' | 'leave';
  release?: ReleaseOperation;
  leavingEditor?: boolean;
}

// An old editor's same-URL cleanup must settle before a newly opened editor
// installs another guard above it. No global history methods are replaced.
let pendingRelease: ReleaseOperation | undefined;

function marker(state: unknown): GuardMarker | undefined {
  if (!state || typeof state !== 'object') return;
  const value = (state as Record<string, unknown>)[HISTORY_GUARD];
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  if (typeof item.id === 'string' && (item.position === 'base' || item.position === 'guard')) {
    return { id: item.id, position: item.position };
  }
}

function stripMarker(id: string) {
  if (marker(window.history.state)?.id !== id) return;
  const state: Record<string, unknown> = { ...window.history.state };
  delete state[HISTORY_GUARD];
  window.history.replaceState(state, '', window.location.href);
}

export function useEditorNavigationGuard({ isDirty, flush, confirm }: {
  isDirty: boolean;
  flush: () => boolean;
  confirm: (message: string) => Promise<boolean>;
}) {
  const latest = useRef({ isDirty, flush, confirm });
  const syncHistory = useRef<() => void>(() => {});
  const releaseHistory = useRef<() => Promise<void>>(() => Promise.resolve());
  useLayoutEffect(() => {
    latest.current = { isDirty, flush, confirm };
    syncHistory.current();
  }, [isDirty, flush, confirm]);

  useEffect(() => {
    let permitted: HTMLAnchorElement | null = null;
    let asking = false;
    let active = true;
    let guard: HistoryGuard | undefined;
    let waitingToInstall = false;

    function finishRelease(tracked: HistoryGuard) {
      const operation = tracked.release;
      if (guard === tracked) guard = undefined;
      if (pendingRelease === operation) pendingRelease = undefined;
      operation?.resolve();
      // A user may type again while the clean-state traversal is pending.
      // Explicit close/navigation must still finish at the original base.
      if (active && latest.current.isDirty && !tracked.leavingEditor && window.location.href === tracked.url) install();
      if (!active) window.removeEventListener('popstate', onHistory, true);
    }

    function release(leavingEditor = false): Promise<void> {
      if (!guard) return pendingRelease?.promise || Promise.resolve();
      const tracked = guard;
      if (leavingEditor) tracked.leavingEditor = true;
      if (tracked.release) return tracked.release.promise;
      const current = marker(window.history.state);
      if (current?.id !== tracked.id || window.location.href !== tracked.url) {
        guard = undefined;
        return Promise.resolve();
      }
      if (current.position === 'base') {
        stripMarker(tracked.id);
        guard = undefined;
        return Promise.resolve();
      }
      let resolve = () => {};
      const promise = new Promise<void>(done => { resolve = done; });
      tracked.release = { promise, resolve };
      tracked.phase = 'releasing';
      pendingRelease = tracked.release;
      window.history.back(); // The immediately preceding entry is our own base.
      return promise;
    }

    function install() {
      if (!active || !latest.current.isDirty || guard) return;
      if (pendingRelease) {
        if (!waitingToInstall) {
          waitingToInstall = true;
          void pendingRelease.promise.then(() => { waitingToInstall = false; install(); });
        }
        return;
      }
      // App Router uses same-document traversal that does not fire beforeunload.
      // Native documents without App Router state retain their unload protection.
      const state: unknown = window.history.state;
      if (!state || typeof state !== 'object' || (state as Record<string, unknown>).__NA !== true) return;
      const id = crypto.randomUUID();
      const url = window.location.href;
      const base = { ...state, [HISTORY_GUARD]: { id, position: 'base' } };
      window.history.replaceState(base, '', url);
      window.history.pushState({ ...state, [HISTORY_GUARD]: { id, position: 'guard' } }, '', url);
      guard = { id, url, hasPrevious: window.history.length > 2, phase: 'armed' };
    }

    function leave(tracked: HistoryGuard) {
      const current = marker(window.history.state);
      if (!active || guard !== tracked || current?.id !== tracked.id || current.position !== 'guard' || window.location.href !== tracked.url) return;
      if (!tracked.hasPrevious) { void release(); return; }
      tracked.phase = 'leaving';
      tracked.decision = undefined;
      // Only a known guard -> base Back reaches here. Two entries lead to the
      // user's original previous page; no direction is inferred from URLs.
      window.history.go(-2);
    }

    function afterReturn(tracked: HistoryGuard) {
      if (!active || guard !== tracked) return;
      if (tracked.decision === 'leave') { leave(tracked); return; }
      if (tracked.decision === 'stay') { tracked.decision = undefined; tracked.phase = 'armed'; return; }
      if (asking) { tracked.phase = 'asking'; return; }
      const persisted = latest.current.flush();
      if (!latest.current.isDirty || persisted) { leave(tracked); return; }
      asking = true;
      tracked.phase = 'asking';
      void latest.current.confirm('本地草稿保存失败，离开可能丢失当前修改。确定离开编辑器？').then(accepted => {
        asking = false;
        if (!active || guard !== tracked) return;
        tracked.decision = accepted ? 'leave' : 'stay';
        const current = marker(window.history.state);
        if (current?.id === tracked.id && current.position === 'guard') afterReturn(tracked);
      });
    }

    function onHistory(event: PopStateEvent) {
      const tracked = guard;
      if (!tracked) { latest.current.flush(); return; }
      const incoming = marker(event.state);
      if (incoming?.id !== tracked.id || window.location.href !== tracked.url) {
        if (tracked.release) finishRelease(tracked);
        else if (tracked.phase === 'leaving') guard = undefined;
        latest.current.flush();
        return;
      }
      event.stopImmediatePropagation();
      if (incoming.position === 'base') {
        if (tracked.phase === 'releasing') {
          stripMarker(tracked.id);
          finishRelease(tracked);
          return;
        }
        if (tracked.phase === 'returning') return;
        tracked.phase = 'returning';
        window.history.forward(); // Return to the guard before any confirmation.
      } else if (tracked.phase === 'returning') {
        tracked.phase = 'armed';
        afterReturn(tracked);
      }
    }

    const onClick = (event: MouseEvent) => {
      if ((!latest.current.isDirty && !guard && !pendingRelease) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link === permitted || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      if (target instanceof HTMLImageElement && target.closest('[aria-label="文章预览"]')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (asking) return;
      asking = true;
      void (async () => {
        const saved = latest.current.flush();
        const accepted = !latest.current.isDirty || await latest.current.confirm(saved
          ? '还有未提交到服务器的修改，已保留本地草稿。确定离开编辑器？'
          : '本地草稿保存失败，离开可能丢失修改。确定继续？');
        asking = false;
        if (!accepted || !active || !link.isConnected) return;
        latest.current.flush();
        await release(true);
        if (!active || !link.isConnected) return;
        permitted = link;
        link.click();
        permitted = null;
      })();
    };

    syncHistory.current = () => { if (latest.current.isDirty) install(); else void release(); };
    releaseHistory.current = () => release(true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onHistory, true);
    syncHistory.current();
    return () => {
      active = false;
      syncHistory.current = () => {};
      releaseHistory.current = () => Promise.resolve();
      document.removeEventListener('click', onClick, true);
      // Unexpected unmount must never issue a delayed traversal that could move
      // another route/editor. A traversal already issued to our own base is
      // consumed by the retained capture listener and settles pendingRelease.
      if (guard?.phase !== 'releasing') {
        if (guard && window.location.href === guard.url) stripMarker(guard.id);
        guard = undefined;
        window.removeEventListener('popstate', onHistory, true);
      }
    };
  }, []);

  return useCallback(() => releaseHistory.current(), []);
}
