'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light' | 'system';

function resolveTheme(theme: Theme) {
  return theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
}

interface ThemeContextType {
  theme: Theme;
  hue: number;
  setTheme: (t: Theme) => void;
  setHue: (h: number) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  hue: 225,
  setTheme: () => {},
  setHue: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [hue, setHueState] = useState(225);
  const [mounted, setMounted] = useState(false);
  const requestedThemeRef = useRef<Theme>('dark');
  const transitionRef = useRef<ViewTransition | null>(null);
  const changeRevisionRef = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      requestedThemeRef.current = saved;
      setThemeState(saved);
    }
    const h = parseInt(localStorage.getItem('theme-hue') || '225');
    setHueState(h);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty('--accent-hue', String(hue));
    document.documentElement.style.setProperty('--hue', String(hue));
    localStorage.setItem('theme-hue', String(hue));
  }, [hue, mounted]);

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    const resolved = resolveTheme(t);
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved === 'light');
    root.style.colorScheme = resolved;
  }, []);

  useEffect(() => () => {
    changeRevisionRef.current += 1;
    transitionRef.current?.skipTransition();
    transitionRef.current = null;
    document.documentElement.classList.remove('theme-transitioning');
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme, mounted, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    if (requestedThemeRef.current === t) return;
    requestedThemeRef.current = t;
    const revision = ++changeRevisionRef.current;
    transitionRef.current?.skipTransition();
    transitionRef.current = null;
    const root = document.documentElement;
    const update = () => {
      // A skipped transition can still invoke its callback after another click.
      if (changeRevisionRef.current !== revision) return;
      root.classList.add('theme-transitioning');
      applyTheme(t);
      // Capture the new palette and the React theme controls in the same frame.
      flushSync(() => setThemeState(t));
    };
    const finish = () => {
      if (changeRevisionRef.current !== revision) return;
      transitionRef.current = null;
      root.classList.remove('theme-transitioning');
    };
    const applyImmediately = () => {
      update();
      // Settle the new styles before restoring hover/component transitions.
      void root.offsetHeight;
      finish();
    };
    if (!document.startViewTransition
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.visibilityState === 'hidden'
      || root.classList.contains(resolveTheme(t))) {
      applyImmediately();
      return;
    }
    try {
      const transition = document.startViewTransition(update);
      transitionRef.current = transition;
      // Skipping a snapshot before it is ready is expected during rapid toggles.
      void transition.ready.catch(() => {});
      void transition.finished.then(finish, finish);
    } catch {
      applyImmediately();
    }
  }, [applyTheme]);
  const setHue = useCallback((h: number) => setHueState(h), []);

  return (
    <ThemeContext.Provider value={{ theme, hue, setTheme, setHue }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
