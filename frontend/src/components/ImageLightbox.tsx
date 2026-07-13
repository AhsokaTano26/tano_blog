'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface LightboxImage {
  url: string;
  title?: string;
  description?: string;
}

interface ImageLightboxProps {
  images: (string | LightboxImage)[];
  startIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, startIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(startIndex);

  const prev = useCallback(() => setIndex(i => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const next = useCallback(() => setIndex(i => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  // 统一处理 images 为 LightboxImage[]
  const normalizedImages: LightboxImage[] = images.map(img =>
    typeof img === 'string' ? { url: img } : img
  );
  const current = normalizedImages[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="关闭"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="上一张"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      <div className="flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.title || '查看大图'}
          className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg"
        />
        {(current.title || current.description) && (
          <div className="text-center max-w-[80vw]">
            {current.title && (
              <div className="text-white/90 text-sm font-medium mb-1">{current.title}</div>
            )}
            {current.description && (
              <div className="text-white/60 text-xs">{current.description}</div>
            )}
          </div>
        )}
      </div>

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="下一张"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute bottom-4 text-white/70 text-sm">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
