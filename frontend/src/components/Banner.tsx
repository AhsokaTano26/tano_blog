'use client';

import { useEffect, useRef } from 'react';

interface BannerProps {
  height?: string;
}

export function Banner({ height = '50vh' }: BannerProps) {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (bgRef.current) {
            const y = window.scrollY * 0.3;
            bgRef.current.style.transform = `translateY(${y}px) scale(1.1)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section className="banner-container relative overflow-hidden w-full" style={{ height }}>
      <div
        ref={bgRef}
        className="absolute inset-0 bg-cover bg-center bg-no-repeat will-change-transform"
        style={{
          backgroundImage: 'url(/2043253.jpg)',
          backgroundPosition: 'bottom',
          transform: 'translateY(0px) scale(1.1)',
        }}
      />
      <div className="banner-fade" aria-hidden="true" />
    </section>
  );
}
