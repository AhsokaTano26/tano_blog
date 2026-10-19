'use client';

import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { EmojiPickerButton } from '@/components/EmojiPicker';
import { EmojiIcon } from '@/components/EmojiIcon';
import { COMMON_EMOJIS, emojiName, emojiOption, rememberEmoji } from '@/lib/emoji';
import styles from './Reactions.module.css';

export function ReactionBar({ counts, selected, onToggle, compact = false, label = '文章表情' }: {
  counts: Record<string, number>;
  selected: string[];
  onToggle: (emoji: string) => Promise<boolean>;
  compact?: boolean;
  label?: string;
}) {
  const inFlight = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<{ emoji: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const emojis = [...new Set([...COMMON_EMOJIS, ...Object.keys(counts).filter(emoji => counts[emoji] > 0)])];

  async function toggle(emoji: string) {
    if (inFlight.current.has(emoji)) return;
    inFlight.current.add(emoji);
    setPending(new Set(inFlight.current));
    setFailure(null);
    setAnnouncement('');
    try {
      const active = await onToggle(emoji);
      rememberEmoji(emoji);
      setAnnouncement(`${active ? '已贴上' : '已取消'}${emojiName(emoji)}`);
    } catch (error) {
      setFailure({ emoji, message: error instanceof Error ? error.message : '网络异常，请再试一次' });
    } finally {
      inFlight.current.delete(emoji);
      setPending(new Set(inFlight.current));
    }
  }

  return (
    <div className={`${styles.bar} ${compact ? styles.compact : ''}`}>
      {!compact && <div className={styles.caption}><span>贴个表情</span><span>再点一次即可取消</span></div>}
      <div className={styles.row} role="group" aria-label={label}>
        {emojis.map(emoji => {
          const active = selected.includes(emoji);
          const count = counts[emoji] || 0;
          return <button key={emoji} type="button" data-reaction={emoji} className={`${styles.chip} ${emojiOption(emoji)?.asset ? styles.stickerChip : ''}`}
            aria-label={`${emojiName(emoji)}，${count} 人，${active ? '点击取消' : '点击贴上'}`} aria-pressed={active}
            aria-busy={pending.has(emoji)} disabled={pending.has(emoji)} onClick={() => { void toggle(emoji); }}
            title={`${emojiName(emoji)}${active ? ' · 已贴上，再点取消' : ''}`}>
            <span className={styles.emoji}><EmojiIcon emoji={emoji} /></span>
            {count > 0 && <span className={styles.count} aria-hidden="true">{count}</span>}
            {active && <Check size={11} aria-hidden="true" className={styles.check} />}
          </button>;
        })}
        <EmojiPickerButton onSelect={emoji => { void toggle(emoji); }} selected={selected} pending={pending} />
      </div>
      {failure && <p className={styles.error} role="alert">操作未完成：{failure.message}<button type="button" onClick={() => { void toggle(failure.emoji); }} disabled={pending.has(failure.emoji)}>重试</button></p>}
      <span className={styles.srOnly} role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}
