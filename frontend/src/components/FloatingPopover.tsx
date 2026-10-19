'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function FloatingPopover({ anchorRef, onClose, width, children }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width: number;
  children: React.ReactNode;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = rect.bottom + 6;
    if (top + 300 > window.innerHeight) {
      top = rect.top - 6;
    }
    setPos({ top, left });
  }, [anchorRef, width]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  return createPortal(
    <div ref={popRef} className="fixed z-[100] rounded-xl shadow-2xl"
      style={{
        top: pos.top,
        left: pos.left,
        width,
        background: 'var(--card-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        maxHeight: '70vh',
        overflowY: 'auto',
      }}>
      {children}
    </div>,
    document.body
  );
}
