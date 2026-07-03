'use client';

import { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** How far below the viewport before revealing (px). Default 0. */
  margin?: string;
  /** Once revealed, don't hide again. Default true. */
  once?: boolean;
}

export function ScrollReveal({
  children,
  className = '',
  margin = '0px',
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setVisible(false);
        }
      },
      { rootMargin: `0px 0px ${margin} 0px` },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [margin, once]);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
