'use client';

import { usePathname } from 'next/navigation';
import { useRef } from 'react';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div key={pathname} ref={ref} className="page-transition">
      {children}
    </div>
  );
}
