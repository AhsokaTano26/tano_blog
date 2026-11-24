'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useRef } from 'react';

const themeScript = `
(() => {
  try {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme') || 'dark';
    const theme = saved === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : saved;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    const hue = localStorage.getItem('theme-hue');
    if (hue) {
      root.style.setProperty('--accent-hue', hue);
      root.style.setProperty('--hue', hue);
    }
  } catch {}
})();
`;

export function ThemeBootstrap() {
  const inserted = useRef(false);

  // Write into the server HTML head outside React's client-rendered tree.
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id="theme-init" dangerouslySetInnerHTML={{ __html: themeScript }} />;
  });

  return null;
}
