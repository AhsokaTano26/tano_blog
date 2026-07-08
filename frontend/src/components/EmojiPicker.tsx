'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Comprehensive set of common emojis organized by category
const EMOJI_CATEGORIES = [
  {
    name: '笑脸',
    emojis: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😌', '😉', '🤗', '😜', '😝', '🤑', '🤩', '🥳', '😎', '🥸'],
  },
  {
    name: '情感',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕', '💗', '💖', '💝', '😍', '🥰', '😘', '😻', '💔', '💞', '✨'],
  },
  {
    name: '手势',
    emojis: ['👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '🤝', '🙏', '✌️', '🤞', '💪', '🤙', '👋', '🖐️', '✋', '💅', '👆', '👇'],
  },
  {
    name: '符号',
    emojis: ['🔥', '⭐', '🌈', '☀️', '☁️', '⛄', '💯', '🎯', '✅', '❌', '💡', '💢', '💥', '💫', '🕐', '🎵', '🎶', '👑', '💎', '🎉'],
  },
  {
    name: '动物',
    emojis: ['🐶', '🐱', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐝', '🦋'],
  },
  {
    name: '食物',
    emojis: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥝', '🍅', '🥑', '🍔', '🍕', '🥪', '🌮', '🍦', '🍩'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

function EmojiPicker({ onSelect, onClose, buttonRef }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const adjusted = useRef(false);

  // Step 1: Get button rect and set initial position (below button)
  useEffect(() => {
    const btn = buttonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const viewportH = window.innerHeight;
      setPosition({ top: rect.bottom + 4, left: rect.left, maxH: viewportH - rect.bottom - 12 });
      adjusted.current = false;
    }
  }, [buttonRef]);

  // Step 2: After render, check if picker overflows viewport and flip above if needed
  useEffect(() => {
    if (!position || adjusted.current) return;
    const el = ref.current;
    const btn = buttonRef.current;
    if (!el || !btn) return;

    const elRect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;

    if (elRect.bottom > viewportH) {
      const btnRect = btn.getBoundingClientRect();
      const newH = btnRect.top - 12;
      adjusted.current = true;
      setPosition({ top: Math.max(4, btnRect.top - elRect.height - 4), left: btnRect.left, maxH: Math.max(200, newH) });
    }
  }, [position, buttonRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const content = (
    <div
      ref={ref}
      className="z-[100] rounded-2xl shadow-2xl"
      style={{
        position: 'fixed',
        top: position ? `${position.top}px` : '0',
        left: position ? `${position.left}px` : '0',
        visibility: position ? 'visible' : 'hidden',
        background: 'var(--popover-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        minWidth: '320px',
        maxWidth: '360px',
        maxHeight: position ? `${position.maxH}px` : undefined,
        overflowY: 'auto',
      }}
    >
      <div className="p-3">
        {EMOJI_CATEGORIES.map((cat) => (
          <div key={cat.name} className="mb-2 last:mb-0">
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>
              {cat.name}
            </div>
            <div className="flex flex-wrap gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:scale-125 transition-transform"
                  style={{ background: 'var(--btn-card-bg)' }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return (
    <div className="inline-flex">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm transition-all opacity-60 hover:opacity-100"
        style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}
        title="选择表情"
      >
        😊
      </button>
      {open && (
        <EmojiPicker
          onSelect={onSelect}
          onClose={handleClose}
          buttonRef={buttonRef}
        />
      )}
    </div>
  );
}
