'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const LoadingSVG = () => (
  <div className="flex flex-col items-center gap-4">
    <svg xmlns="http://www.w3.org/2000/svg" width="3em" height="3em" viewBox="0 0 24 24"
      style={{ color: 'var(--primary)' }}>
      <path d="M0 0h24v24H0z" fill="none" />
      <rect width="7.33" height="7.33" x="1" y="1" fill="currentColor">
        <animate id="SVGzjrPLenI" attributeName="x" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="1;4;1" />
        <animate attributeName="y" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="1;4;1" />
        <animate attributeName="width" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="1" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="1;4;1" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="1" y="8.33" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="1;4;1" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="1" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="1;4;1" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="8.33" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="1" y="15.66" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="1;4;1" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="8.33" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="8.33" y="15.66" fill="currentColor">
        <animate attributeName="x" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
      <rect width="7.33" height="7.33" x="15.66" y="15.66" fill="currentColor">
        <animate id="SVGXAURnSRI" attributeName="x" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="y" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66" />
        <animate attributeName="width" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33" />
        <animate attributeName="height" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33" />
      </rect>
    </svg>
    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</span>
  </div>
);

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
