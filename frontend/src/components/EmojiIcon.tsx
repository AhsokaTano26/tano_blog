'use client';

import { useState } from 'react';
import Image from 'next/image';
import { emojiAsset, emojiOption } from '@/lib/emoji';
import styles from './Reactions.module.css';

/** Local artwork; Unicode values and short sticker keys retain their stored identity. */
export function EmojiIcon({ emoji }: { emoji: string }) {
  const src = emojiAsset(emoji);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;
  const option = emojiOption(emoji);
  const fallback = option?.asset ? option.name : emoji;

  return <span className={styles.icon} aria-hidden="true">
    <span className={showImage ? styles.srOnly : option?.asset ? styles.stickerFallback : undefined}>{fallback}</span>
    {showImage && <Image src={src} alt="" width={36} height={36} unoptimized draggable={false}
      className={styles.iconImage} onError={() => setFailedSrc(src)} />}
  </span>;
}
