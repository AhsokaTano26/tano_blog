'use client';

import { useRef, useEffect } from 'react';

export function ReadingProgress() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.max(0, Math.min(1, scrollTop / docHeight)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;
    };
    const handleScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleScroll);
    observer?.observe(document.documentElement);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5"
      style={{ background: 'var(--glass-border)' }}>
      <div
        ref={progressRef}
        className="h-full origin-left"
        style={{
          transform: 'scaleX(0)',
          background: 'var(--primary)',
          boxShadow: '0 0 6px var(--primary-glow)',
        }}
      />
    </div>
  );
}
