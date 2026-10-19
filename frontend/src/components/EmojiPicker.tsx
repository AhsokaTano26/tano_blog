'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, SmilePlus, X } from 'lucide-react';
import { EmojiIcon } from '@/components/EmojiIcon';
import { COMMON_EMOJIS, EMOJI_CATEGORIES, EMOJI_OPTIONS, emojiOption, recentEmojis, rememberEmoji, type EmojiOption } from '@/lib/emoji';
import styles from './Reactions.module.css';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: (restoreFocus?: boolean) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  selected: string[];
  pending?: ReadonlySet<string>;
  id: string;
}

function EmojiPicker({ onSelect, onClose, buttonRef, selected, pending, id }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('常用');
  const [recent] = useState(recentEmojis);
  const search = query.trim().toLocaleLowerCase();
  const results = search
    ? EMOJI_OPTIONS.filter(option => option.emoji.includes(search) || option.keywords.toLocaleLowerCase().includes(search))
    : category === '常用' ? COMMON_EMOJIS.map(emojiOption).filter((option): option is EmojiOption => Boolean(option))
    : EMOJI_OPTIONS.filter(option => option.category === category);

  useLayoutEffect(() => {
    let frame: number | null = null;
    function update() {
      const anchor = buttonRef.current, popup = ref.current;
      if (!anchor || !popup) return;
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft || 0, offsetTop = viewport?.offsetTop || 0;
      const rect = anchor.getBoundingClientRect();
      const width = Math.max(0, Math.min(320, viewportWidth - 16));
      const maxHeight = Math.max(0, viewportHeight - 16);
      const height = Math.min(popup.scrollHeight || popup.getBoundingClientRect().height || 380, maxHeight);
      const minimumTop = offsetTop + 8, maximumTop = Math.max(minimumTop, offsetTop + viewportHeight - height - 8);
      const below = rect.bottom + 6;
      const above = rect.top - height - 6;
      const preferredTop = below <= maximumTop ? below : above >= minimumTop ? above : below;
      const top = Math.max(minimumTop, Math.min(preferredTop, maximumTop));
      const left = Math.max(offsetLeft + 8, Math.min(rect.left, offsetLeft + viewportWidth - width - 8));
      setPosition(previous => previous?.top === top && previous.left === left && previous.width === width && previous.maxHeight === maxHeight ? previous : { top, left, width, maxHeight });
    }
    function schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; update(); });
    }
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (ref.current) observer?.observe(ref.current);
    // Resize must not wait for a frame: browsers may pause frames while viewport controls or a keyboard have focus.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [buttonRef, query, category]);

  useEffect(() => {
    // Focus the popup without opening a phone's software keyboard immediately.
    ref.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) onClose(false);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(true); }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [buttonRef, onClose]);

  function gridKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    const columns = Number(event.currentTarget.dataset.columns) || 6;
    const directions: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key in directions ? Math.max(0, Math.min(buttons.length - 1, current + directions[event.key])) : -1;
    if (index >= 0) { event.preventDefault(); buttons[index]?.focus(); }
  }

  function choose(emoji: string) {
    if (pending?.has(emoji)) return;
    rememberEmoji(emoji);
    onSelect(emoji);
    onClose(true);
  }

  function grid(options: EmojiOption[]) {
    const stickers = options.some(option => Boolean(option.asset));
    return <div className={`${styles.grid} ${stickers ? styles.stickerGrid : ''}`} data-emoji-grid data-columns={stickers ? 4 : 6} onKeyDown={gridKey}>
      {options.map(option => <button key={option.emoji} type="button" data-emoji={option.emoji} className={`${styles.option} ${option.asset ? styles.stickerOption : ''}`}
        aria-label={`${selected.includes(option.emoji) ? '取消' : '贴上'}${option.name}`} aria-pressed={selected.includes(option.emoji)}
        title={option.name} disabled={pending?.has(option.emoji)} onClick={() => choose(option.emoji)}>
        <EmojiIcon emoji={option.emoji} />{option.asset && <span className={styles.stickerName} aria-hidden="true">{option.name}</span>}
        {selected.includes(option.emoji) && <Check size={11} aria-hidden="true" />}
      </button>)}
    </div>;
  }

  return createPortal(
    <div id={id} ref={ref} role="dialog" aria-label="选择表情" tabIndex={-1} className={styles.picker}
      onBlur={event => {
        const destination = event.relatedTarget as Node | null;
        if (destination && !event.currentTarget.contains(destination) && !buttonRef.current?.contains(destination)) onClose(false);
      }}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width: position?.width ?? 320,
        maxHeight: position?.maxHeight ?? 'calc(100dvh - 16px)', visibility: position ? 'visible' : 'hidden' }}>
      <div className={styles.heading}><span>贴个表情</span><button type="button" className={styles.close} aria-label="关闭表情选择" onClick={() => onClose(true)}><X size={17} /></button></div>
      <div className={styles.search}><Search size={15} aria-hidden="true" />
        <input aria-label="搜索表情" placeholder="搜索表情、角色或乐队" value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="清除表情搜索" onClick={() => setQuery('')}><X size={14} /></button>}
      </div>
      <div className={styles.categories} role="group" aria-label="表情分类">
        {['常用', ...EMOJI_CATEGORIES].map(name => <button key={name} type="button" aria-pressed={category === name && !search} onClick={() => { setCategory(name); setQuery(''); }}>{name}</button>)}
      </div>
      <div className={styles.body}>
        <section className={styles.section} aria-label={search ? '搜索结果' : category}>
          <h3>{search ? `搜索结果 · ${results.length}` : category}</h3>
          {results.length ? grid(results) : <p className={styles.empty}>没有找到这个表情<br />试试“爱心”“点赞”，或选择上方分类。</p>}
        </section>
        {!search && category === '常用' && recent.length > 0 && <section className={styles.section} aria-label="最近使用"><h3>最近使用</h3>{grid(recent.map(emojiOption).filter((option): option is EmojiOption => Boolean(option)))}</section>}
      </div>
      <p className={styles.hint}>已贴上的表情带有勾选，再点一次即可取消。</p>
    </div>, document.body,
  );
}

export function EmojiPickerButton({ onSelect, selected = [], pending }: { onSelect: (emoji: string) => void; selected?: string[]; pending?: ReadonlySet<string> }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  return <>
    <button type="button" ref={buttonRef} className={styles.trigger} title="选择表情" aria-label="更多表情" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(previous => !previous)}><SmilePlus size={16} aria-hidden="true" /><span>更多</span></button>
    {open && <EmojiPicker id={id} onSelect={onSelect} onClose={close} buttonRef={buttonRef} selected={selected} pending={pending} />}
  </>;
}
