'use client';

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';

type ImageWithFallbackProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | Blob | null;
  fallbackLabel?: string;
};

/**
 * Renders a consistent, accessible placeholder when a remote or uploaded image
 * is unavailable. The original layout classes and dimensions are retained.
 */
export function ImageWithFallback({
  src,
  alt = '',
  className,
  style,
  fallbackLabel,
  onError,
  ...props
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <span
        className={`inline-flex flex-col items-center justify-center gap-1 bg-[var(--btn-card-bg)] text-center ${className || ''}`}
        style={style}
        role="img"
        aria-label={fallbackLabel || (alt ? `${alt} 图片加载失败` : '图片加载失败')}
      >
        <ImageOff className="w-5 h-5" aria-hidden="true" style={{ color: 'var(--text-info)' }} />
        <span className="text-xs" style={{ color: 'var(--text-info)' }}>
          {fallbackLabel || '图片加载失败'}
        </span>
      </span>
    );
  }

  return (
    <img
      src={src || undefined}
      alt={alt}
      className={className}
      style={style}
      onError={(event) => {
        onError?.(event);
        setFailed(true);
      }}
      {...props}
    />
  );
}
