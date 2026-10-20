'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { EntryAnimationDocument } from '@/lib/entry-animation';

interface WelcomeAnimationProps {
  document?: EntryAnimationDocument;
  onEnd: () => void;
}

// Only the shell is public. Artwork, choreography, copy and icons are fetched
// with the current authenticated session; never cache them locally.
export function WelcomeAnimation({ document: preview, onEnd }: WelcomeAnimationProps) {
  const [player, setPlayer] = useState<EntryAnimationDocument | null>(null);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const endedRef = useRef(false);
  const activeRef = useRef(true);
  const onEndRef = useRef(onEnd);
  const durationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const finish = useCallback(() => {
    if (endedRef.current || !activeRef.current) return;
    endedRef.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    onEndRef.current();
  }, []);

  const syncTheme = useCallback(() => {
    const root = document.documentElement;
    const hue = Number.parseFloat(getComputedStyle(root).getPropertyValue('--accent-hue'));
    frameRef.current?.contentWindow?.postMessage({
      type: 'entry:theme',
      mode: root.classList.contains('light') ? 'light' : 'dark',
      hue: Number.isFinite(hue) ? hue : 225,
    }, '*'); // srcDoc is deliberately sandboxed to an opaque origin.
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motion?.matches || document.visibilityState === 'hidden') {
      finish();
      return;
    }
    let disposed = false;
    let started = false;
    const controller = new AbortController();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });
    // A blocked/slow document must never leave the workbench inert.
    timerRef.current = setTimeout(finish, 8000);
    (preview ? Promise.resolve(preview) : api.admin.entryAnimation.player(controller.signal)).then(value => {
      if (disposed || endedRef.current) return;
      if (!value?.html || !Number.isFinite(value.duration_ms) || value.duration_ms < 1 || value.duration_ms > 30000) {
        finish();
        return;
      }
      durationRef.current = value.duration_ms;
      setPlayer(value);
    }).catch(() => { if (!disposed) finish(); });

    const message = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || !event.data || endedRef.current) return;
      if (event.data.type === 'entry:ready') syncTheme();
      if (event.data.type === 'entry:started' && !started) {
        started = true;
        setPlaying(true);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(finish, durationRef.current);
      }
      if (event.data.type === 'entry:finish') finish();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); finish(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (started) frameRef.current?.focus({ preventScroll: true });
        else skipRef.current?.focus({ preventScroll: true });
      }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') finish(); };
    const reduced = (event: MediaQueryListEvent) => { if (event.matches) finish(); };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('message', message);
    document.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    motion?.addEventListener?.('change', reduced);
    return () => {
      disposed = true;
      activeRef.current = false;
      controller.abort();
      observer.disconnect();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      window.removeEventListener('message', message);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      motion?.removeEventListener?.('change', reduced);
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [preview, finish, syncTheme]);

  return <div className="admin-entry" role="dialog" aria-modal="true" aria-label="进入管理后台"
    style={{ position: 'fixed', inset: 0, zIndex: 9999, background: playing ? 'transparent' : 'var(--color-bg)' }}>
    {player && <iframe ref={frameRef} title="进入管理后台" srcDoc={player.html} sandbox="allow-scripts"
      referrerPolicy="no-referrer" onLoad={syncTheme}
      style={{ display: 'block', width: '100%', height: '100%', border: 0, opacity: playing ? 1 : 0 }} />}
    <button ref={skipRef} type="button" aria-label="跳过进入动画" onClick={finish}
      style={{ position: 'absolute', top: 28, right: 28, padding: '12px 16px', color: 'var(--text-primary)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, visibility: playing ? 'hidden' : 'visible' }}>
      跳过
    </button>
  </div>;
}
