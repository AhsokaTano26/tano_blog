'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

export const Slider = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Slider({ className = '', style, min = 0, max = 100, value, defaultValue, ...props }, ref) {
  const position = Math.min(100, Math.max(0, ((Number(value ?? defaultValue ?? min) - Number(min)) / (Number(max) - Number(min) || 1)) * 100));
  return <input {...props} ref={ref} type="range" min={min} max={max} value={value} defaultValue={defaultValue}
    className={`admin-ui-slider ${className}`} style={{ background: `linear-gradient(to right, var(--primary) ${position}%, var(--glass-border) ${position}%)`, ...style }} />;
});
