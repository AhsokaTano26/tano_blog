'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './ArticleSignature.module.css';

interface SignatureLetter {
  character: string;
  x: number;
  y: number;
  length: number;
}

export function ArticleSignature({ authorName }: { authorName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [letters, setLetters] = useState<SignatureLetter[]>([]);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const compact = [...authorName].length > 16 || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(authorName);

  useEffect(() => {
    const container = containerRef.current;
    const name = nameRef.current;
    const label = labelRef.current;
    if (!container || !name || !label || !window.IntersectionObserver) return;
    let disposed = false;
    let fontsReady = false;
    const visibility = () => setPageVisible(!document.hidden);
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? false), { threshold: .15 });
    observer.observe(container);
    document.addEventListener('visibilitychange', visibility);
    visibility();

    // Keep the real text as the layout and accessible fallback; trace glyphs at
    // their measured positions so long and multilingual names still wrap.
    const range = document.createRange();
    const context = typeof range.getBoundingClientRect === 'function' ? document.createElement('canvas').getContext('2d') : null;
    const measure = () => {
      const text = label.firstChild;
      if (!fontsReady || disposed || !context || !text) return;
      const style = getComputedStyle(name);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const bounds = name.getBoundingClientRect();
      const fontSize = Number.parseFloat(style.fontSize);
      let offset = 0;
      const next = [...authorName].map(character => {
        range.setStart(text, offset);
        offset += character.length;
        range.setEnd(text, offset);
        const rect = range.getBoundingClientRect();
        const metrics = context.measureText(character);
        return {
          character, x: rect.left - bounds.left,
          y: rect.top - bounds.top + (metrics.fontBoundingBoxAscent ?? fontSize),
          length: Math.max(80, (rect.width + fontSize) * 4),
        };
      });
      setLetters(next);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(name);
    Promise.resolve(document.fonts?.ready).then(() => {
      if (!disposed) { fontsReady = true; measure(); }
    });
    return () => {
      disposed = true;
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [authorName]);

  return (
    <div ref={containerRef} className={styles.signature} data-article-signature data-ready={letters.length > 0}
      data-playing={inView && pageVisible} role="img" aria-label={`作者签名：${authorName}`}>
      <span ref={nameRef} className={styles.name} data-compact={compact} dir="auto" aria-hidden="true">
        <span ref={labelRef} className={styles.label} data-signature-label>{authorName}</span>
        <svg className={styles.ink} aria-hidden="true">
          {letters.map((letter, index) => <text key={`${authorName}-${index}`} x={letter.x} y={letter.y}
            style={{ '--stroke-length': letter.length, '--write-delay': `${Math.min(600, index * 600 / Math.max(1, letters.length - 1))}ms` } as CSSProperties}>
            {letter.character}
          </text>)}
        </svg>
      </span>
    </div>
  );
}
