'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/** Animate a committed content change without replacing its DOM or delaying input. */
export function useLocalTransition<T extends HTMLElement>(key: string | number | object | null) {
  const ref = useRef<T>(null);
  const lastKey = useRef(key);
  const active = useRef<{ element: T; animation: Animation } | null>(null);

  useLayoutEffect(() => {
    if (key === null || key === lastKey.current) return;
    const firstResult = lastKey.current === null;
    lastKey.current = key;
    const element = ref.current;
    if (firstResult || !element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (active.current?.element === element && active.current.animation.playState === 'running') return;

    active.current?.animation.cancel();
    active.current = {
      element,
      animation: element.animate([
        { opacity: 0.78, transform: 'translateY(3px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 170, easing: 'cubic-bezier(.23, 1, .32, 1)' }),
    };
  }, [key]);

  useEffect(() => () => active.current?.animation.cancel(), []);
  return ref;
}
