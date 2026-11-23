'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { FriendLinkItem } from '@/lib/admin-types';
import { FriendConstellation } from './FriendConstellation';
import styles from './FriendDirectory.module.css';

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

export function FriendDirectory({ links }: { links: FriendLinkItem[] }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLocaleLowerCase();
  const filtered = links.filter(link => !search || `${link.name} ${hostname(link.url)} ${link.description || ''}`.toLocaleLowerCase().includes(search));

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  return (
    <>
      <FriendConstellation links={links} query={query} onQueryChange={setQuery} searchRef={searchRef} Avatar={FriendAvatar} />

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
