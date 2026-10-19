'use client';

import { useEffect, useState } from 'react';

/** Retain only the exit frame; closing never delays the action or focus return. */
export function useExitPresence(open: boolean) {
  const [state, setState] = useState({ open, present: open });
  if (state.open !== open) setState({ open, present: open || state.present });
  useEffect(() => {
    if (open || !state.present) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instant = reduced || document.documentElement.dataset.adminInput === 'keyboard';
    const timer = setTimeout(() => setState(previous => previous.open ? previous : { open: false, present: false }), instant ? 0 : 140);
    return () => clearTimeout(timer);
  }, [open, state.present]);
  return open || state.present;
}
