'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function KeyboardShortcuts() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip if modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Skip on admin pages
      if (pathname.startsWith('/admin')) return;

      switch (e.key.toLowerCase()) {
        case 'h':
          router.push('/');
          break;
        case 's':
          router.push('/search');
          break;
        case 't':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'r':
          router.refresh();
          break;
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pathname, router]);

  return null;
}
