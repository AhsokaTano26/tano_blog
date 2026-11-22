'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, RotateCw, Search, X } from 'lucide-react';
import type { FriendLinkItem } from '@/lib/admin-types';
import styles from './FriendDirectory.module.css';

type Point = readonly [number, number];
const desktopPoints: Point[] = [
  [11, 12], [35, 19], [60, 10], [87, 17],
  [21, 46], [47, 47], [73, 45], [90, 67],
  [10, 81], [36, 84], [60, 80], [79, 91],
];
const densePoints: Point[] = [
  [9, 9], [29, 13], [51, 8], [74, 13], [92, 8],
  [17, 36], [40, 39], [63, 35], [85, 39],
  [8, 64], [30, 66], [52, 62], [73, 65], [92, 67],
  [19, 91], [41, 92], [63, 90], [84, 92],
];
const mobilePoints: Point[] = [
  [17, 12], [55, 16], [81, 33], [20, 41],
  [53, 57], [82, 67], [20, 83], [65, 94],
];

export function shuffleFriends(links: FriendLinkItem[]): FriendLinkItem[] {
  const result = [...links];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result.every((link, index) => link.id === links[index].id)) {
    result.push(result.shift()!);
  }
  return result;
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

export function FriendAvatar({ link, className = '' }: { link: Pick<FriendLinkItem, 'name' | 'avatar'>; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const hue = Array.from(link.name).reduce((sum, letter) => sum + letter.codePointAt(0)!, 0) % 360;
  return (
    <span className={`${styles.avatar} ${className}`} style={{ '--friend-hue': hue } as CSSProperties} aria-hidden="true">
      {link.avatar && failedSrc !== link.avatar ? (
        // Remote friend avatars have arbitrary hosts; the fixed-size image keeps layout stable.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link.avatar} alt="" width={44} height={44} loading="lazy" decoding="async" onError={() => setFailedSrc(link.avatar)} />
      ) : Array.from(link.name)[0] || '·'}
    </span>
  );
}

function position(index: number, count: number, mobile = false): Point {
  if (mobile && count > 1 && count <= 3) return [index % 2 ? 68 : 32, 20 + index * (60 / (count - 1))];
  if (count <= 3) return [(index + 1) * 100 / (count + 1), 45];
  return (mobile ? mobilePoints : count > 12 ? densePoints : desktopPoints)[index];
}

function ConstellationLines({ points, className }: { points: Point[]; className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {points.slice(1).map((point, index) => {
        const previous = points.slice(0, index + 1).reduce((nearest, candidate) => (
          Math.hypot((candidate[0] - point[0]) * 2, candidate[1] - point[1]) <
          Math.hypot((nearest[0] - point[0]) * 2, nearest[1] - point[1]) ? candidate : nearest
        ));
        return <line key={index} x1={previous[0]} y1={previous[1]} x2={point[0]} y2={point[1]} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export function FriendDirectory({ links }: { links: FriendLinkItem[] }) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ordered = useMemo(() => {
    const ranks = new Map(order.map((id, index) => [id, index]));
    return order.length ? [...links].sort((a, b) => (ranks.get(a.id) ?? links.length) - (ranks.get(b.id) ?? links.length)) : links;
  }, [links, order]);
  const search = query.trim().toLocaleLowerCase();
  const filtered = ordered.filter(link => !search || `${link.name} ${hostname(link.url)} ${link.description || ''}`.toLocaleLowerCase().includes(search));
  const stars = filtered.slice(0, 18);
  const compactCount = Math.min(stars.length, 8);

  function clearSearch() {
    setQuery('');
    setActiveId(null);
    searchRef.current?.focus();
  }

  return (
    <>
      <section className={styles.map} aria-label="友邻星图" onKeyDown={event => {
        if (event.key === 'Escape') setActiveId(null);
      }} onPointerDown={event => {
        if (!(event.target as Element).closest('[data-friend-star]')) setActiveId(null);
      }}>
        <svg className={styles.chart} viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
          {[320, 440, 560, 680, 800].map(radius => <ellipse key={radius} cx="480" cy="690" rx={radius * 1.3} ry={radius} />)}
          {[-55, -35, -15, 5, 25, 45].map(angle => <line key={angle} x1="480" y1="690" x2="480" y2="-450" transform={`rotate(${angle} 480 690)`} />)}
          {[[85, 190], [210, 86], [384, 250], [545, 76], [650, 340], [790, 230], [925, 120], [360, 420]].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="1.5" />)}
        </svg>
        <div className={styles.mapToolbar}>
          <span className={styles.eyebrow}>THE FRIENDS MAP / 友邻星图</span>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="找一位朋友" placeholder="找一位朋友" value={query} onChange={event => { setQuery(event.target.value); setActiveId(null); }} />
            {query && <button type="button" aria-label="清除搜索" onClick={clearSearch}><X size={15} /></button>}
          </label>
        </div>

        <div className={styles.stage}>
          <ConstellationLines className={styles.desktopLines} points={stars.map((_, index) => position(index, stars.length))} />
          <ConstellationLines className={styles.mobileLines} points={stars.slice(0, 8).map((_, index) => position(index, compactCount, true))} />
          {stars.map((link, index) => {
            const [x, y] = position(index, stars.length);
            const [mx, my] = index < 8 ? position(index, compactCount, true) : [50, 50];
            const active = activeId === link.id;
            const popoverId = `friend-preview-${link.id}`;
            return (
              <div key={link.id} className={styles.star} data-friend-star={link.id} data-overflow={index >= 8 || undefined} data-active={active || undefined}
                data-align={x < 30 ? 'left' : x > 70 ? 'right' : 'center'} data-mobile-align={mx < 30 ? 'left' : mx > 70 ? 'right' : 'center'}
                data-above={y > 50 || undefined} data-mobile-above={my > 50 || undefined}
                style={{ '--star-x': `${x}%`, '--star-y': `${y}%`, '--mobile-x': `${mx}%`, '--mobile-y': `${my}%` } as CSSProperties}
                onPointerEnter={event => { if (event.pointerType === 'mouse') setActiveId(link.id); }}
                onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setActiveId(null); }}
                onFocus={() => setActiveId(link.id)}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveId(null); }}>
                <button type="button" className={styles.starButton} aria-label={`查看 ${link.name} 的简介`} aria-expanded={active} aria-controls={popoverId}
                  onClick={() => setActiveId(link.id)}>
                  <FriendAvatar link={link} />
                  <span className={styles.starName}>{link.name}</span>
                  <span className={styles.domain}>{hostname(link.url)}</span>
                </button>
                <div id={popoverId} className={styles.preview} hidden={!active}>
                  <div className={styles.previewBody}>
                    <strong>{link.name}</strong>
                    <p>{link.description || '去朋友的站点逛逛，读一读最近的故事。'}</p>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">访问网站 <ArrowUpRight size={14} aria-hidden="true" /></a>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className={styles.mapEmpty}>没有找到这位朋友，换个关键词试试。</p>}
        </div>

        <div className={styles.mapFooter}>
          <span><span className={styles.desktopHint}>悬停一颗星</span><span className={styles.mobileHint}>轻触一颗星</span>，读一句自述</span>
          <button type="button" disabled={filtered.length < 2} onClick={() => {
            setOrder(shuffleFriends(ordered).map(link => link.id));
            setActiveId(null);
          }}>换一片星空 <RotateCw size={13} aria-hidden="true" /></button>
        </div>
      </section>

      <section className={styles.directory} aria-labelledby="friend-list-heading">
        <div className={styles.listHeading}>
          <h2 id="friend-list-heading">{search ? '找到的朋友' : '全部朋友'} <span aria-live="polite">{filtered.length}</span></h2>
          <p>{search ? '按名称、域名或简介查找' : '随机排列 · 每次来访不同'}</p>
        </div>
        <ul className={styles.list}>
          {filtered.map(link => (
            <li key={link.id}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.row} data-friend-row={link.id} title={link.description || link.name}>
                <FriendAvatar link={link} />
                <span className={styles.rowText}><span className={styles.rowName}>{link.name}</span><span className={styles.domain}>{hostname(link.url)}</span></span>
                <ArrowUpRight className={styles.rowArrow} size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        {search && filtered.length === 0 && <p className={styles.noResults}>没有找到匹配的朋友。<button type="button" onClick={clearSearch}>查看全部朋友</button></p>}
      </section>
    </>
  );
}
