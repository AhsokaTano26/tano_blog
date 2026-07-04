'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 p-3 rounded-2xl shadow-xl"
      style={{
        top: '100%',
        left: '0',
        marginTop: '4px',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px)',
        minWidth: '320px',
        maxWidth: '360px',
      }}
    >
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
  );
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm transition-all opacity-60 hover:opacity-100"
        style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}
        title="选择表情"
      >
        😊
      </button>
      {open && <EmojiPicker onSelect={onSelect} onClose={handleClose} />}
    </div>
  );
}
