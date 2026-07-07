'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

type Theme = 'dark' | 'light' | 'system';

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
  const userChangedRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) setThemeState(saved);
    const h = parseInt(localStorage.getItem('theme-hue') || '225');
    setHueState(h);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty('--accent-hue', String(hue));
    document.documentElement.style.setProperty('--hue', String(hue));
    localStorage.setItem('theme-hue', String(hue));
  }, [hue, mounted]);

  const applyTheme = useCallback((t: Theme, animate = false) => {
    if (animate) {
      document.documentElement.classList.add('theme-transitioning');
    }
    const resolved = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.classList.toggle('light', resolved === 'light');
    if (animate) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.documentElement.classList.remove('theme-transitioning');
        }, 350);
      });
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme, userChangedRef.current);
    userChangedRef.current = false;
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme, mounted, applyTheme]);

  // Fix SSR flash
  useEffect(() => {
    document.documentElement.style.colorScheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    userChangedRef.current = true;
    setThemeState(t);
  }, []);
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
