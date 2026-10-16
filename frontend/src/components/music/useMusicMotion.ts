'use client';

import { useEffect, useState } from 'react';

// Decorative work runs only while it can be seen and motion is welcome.
export function useMusicMotion() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(!document.hidden && !preference.matches);
    update();
    document.addEventListener('visibilitychange', update);
    preference.addEventListener('change', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      preference.removeEventListener('change', update);
    };
  }, []);
  return enabled;
}
