'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingSVG } from './Loading';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showLoader, setShowLoader] = useState(false);
  const [animating, setAnimating] = useState(false);
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setShowLoader(true);
      setAnimating(false);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setShowLoader(false);
        setAnimating(true);
      }, 800);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname]);

  return (
    <>
      {showLoader && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'var(--color-bg)' }}>
          <LoadingSVG />
        </div>
      )}
      <div className={animating ? 'page-transition' : ''} style={{
        opacity: showLoader ? 0 : 1,
        transition: 'opacity 0.15s ease',
      }}>
        {children}
      </div>
    </>
  );
}
