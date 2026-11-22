'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';
import { LoadMore } from '@/components/LoadMore';
import { usePagedItems } from '@/lib/use-paged-items';
import { mergeArchiveGroups, type ArchiveGroup } from '@/lib/pagination';
import { getArchiveYears, getTimelineProgress } from '@/lib/archive-timeline';
import styles from './page.module.css';

const fetchArchive = (params: Record<string, string>) => api.getArchive(params);
const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const monthCodes = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const views = [
  { id: 'comfortable', label: '舒', name: '舒适视图' },
  { id: 'compact', label: '密', name: '紧凑视图' },
  { id: 'overview', label: '概览', name: '概览视图' },
] as const;
type TimelineView = typeof views[number]['id'];

function TimelineProgress() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 30_000);
    const onVisibility = () => { if (!document.hidden) update(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  const progress = now ? getTimelineProgress(now) : null;
  return (
    <dl className={styles.progress} aria-label="时间进度">
      <div><dt>今年第几天</dt><dd className={styles.today}>{progress?.dayOfYear ?? '—'}</dd></div>
      <div><dt>年度进度</dt><dd>{progress ? Math.floor(progress.yearProgress) : '—'}<span>%</span></dd></div>
      <div><dt>今日进度</dt><dd>{progress ? progress.dayProgress.toFixed(2) : '—'}<span>%</span></dd></div>
    </dl>
  );
}

export default function ArchivePage() {
  const pagination = usePagedItems<ArchiveGroup>(fetchArchive, 50, mergeArchiveGroups);
  const { items, total, initialLoading, error, hasMore } = pagination;
  const [view, setView] = useState<TimelineView>('comfortable');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const jumpFrameRef = useRef<number | null>(null);
  const years = useMemo(() => getArchiveYears(items, query), [items, query]);
  const loadedCount = items.reduce((count, group) => count + group.posts.length, 0);
  const matchedCount = years.reduce((count, year) => count + year.count, 0);

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => () => { if (jumpFrameRef.current !== null) cancelAnimationFrame(jumpFrameRef.current); }, []);

  function closeSearch() {
    setQuery('');
    setSearchOpen(false);
    searchToggleRef.current?.focus();
  }

  function openMonth(year: number, month: number) {
    setView('comfortable');
    if (jumpFrameRef.current !== null) cancelAnimationFrame(jumpFrameRef.current);
    jumpFrameRef.current = requestAnimationFrame(() => {
      const heading = document.getElementById(`archive-month-${year}-${month}`);
      heading?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      heading?.focus({ preventScroll: true });
      jumpFrameRef.current = null;
    });
  }

  return (
    <div className={styles.page} data-view={view}>
      <header className={styles.header}>
        <div className={styles.toolbar}>
          <h1>时光</h1>
          <div className={styles.tools}>
            <div role="group" aria-label="时间线显示方式" className={styles.views}>
              {views.map(item => <button key={item.id} type="button" aria-label={item.name} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
            </div>
            <button ref={searchToggleRef} type="button" aria-label="搜索时光" aria-expanded={searchOpen} aria-controls="archive-search" className={styles.searchToggle}
              onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><Search size={14} aria-hidden="true" /><span>搜索</span></button>
          </div>
        </div>
        <div className={styles.total}><span data-archive-total>{initialLoading || (error && loadedCount === 0) ? '—' : total}</span><p>篇，再接再厉</p></div>
        <TimelineProgress />
        <p className={styles.motto}>活在当下，珍惜眼下。</p>
        {searchOpen && <div id="archive-search" className={styles.searchArea} onKeyDown={event => { if (event.key === 'Escape') closeSearch(); }}>
          <label className={styles.searchField}>
            <Search size={16} aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label={hasMore ? '搜索已加载的文章' : '搜索时光文章'} placeholder={hasMore ? '搜索已加载的文章' : '搜索文章标题或简介'} value={query} onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="清除搜索" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
          </label>
          <button type="button" className={styles.closeSearch} onClick={closeSearch}>收起</button>
          <p role="status">{query.trim() ? `找到 ${matchedCount} 篇文章` : '按标题或简介，找回想读的那一篇。'}{hasMore && ` 已加载 ${loadedCount} / ${total} 篇，可继续加载更早的文章。`}</p>
        </div>}
      </header>

      {initialLoading ? <Loading /> : years.length === 0 ? (
        <div className={styles.empty}>
          {query.trim() ? <><p>没有找到匹配的文章。</p><button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>清除关键词</button></> : !error && <p>时间线还在等待第一篇文章。</p>}
        </div>
      ) : (
        <div className={styles.timeline} aria-label="文章时间线">
          {years.map(year => {
            const maxCount = Math.max(...year.months.map(month => month.count));
            return (
              <section key={year.year} className={styles.year} data-archive-year={year.year} aria-labelledby={`archive-year-${year.year}`}>
                <h2 id={`archive-year-${year.year}`} className={styles.yearHeading}><span>{year.year}</span><small>{hasMore ? '已载' : '本年'} {year.count} 篇</small></h2>
                {view === 'overview' ? (
                  <div className={styles.overview}>
                    {year.months.map(month => (
                      <button key={month.month} type="button" className={styles.overviewRow} aria-label={`查看 ${year.year} 年 ${month.month} 月的 ${month.count} 篇文章`} onClick={() => openMonth(year.year, month.month)}>
                        <span className={styles.monthLabel}>{months[month.month - 1]} · {monthCodes[month.month - 1]}</span>
                        <span className={styles.barTrack} aria-hidden="true"><span style={{ width: `${month.count / maxCount * 100}%` }} /></span>
                        <span className={styles.monthCount}>{month.count}</span>
                      </button>
                    ))}
                  </div>
                ) : year.months.map(month => (
                  <div key={month.month} className={styles.month}>
                    <h3 id={`archive-month-${year.year}-${month.month}`} tabIndex={-1} className={styles.monthHeading}>{months[month.month - 1]} · {monthCodes[month.month - 1]}</h3>
                    <ul>
                      {month.posts.map(post => {
                        const published = new Date(post.published_at);
                        const day = Number.isNaN(published.getTime()) ? '—' : String(published.getDate()).padStart(2, '0');
                        return <li key={post.id}>
                          <Link href={`/posts/${post.slug}`} className={styles.post} title={post.title}>
                            <time dateTime={post.published_at} className={styles.date}>{day}</time>
                            <span className={styles.title}>{post.title}</span>
                            <span className={styles.postType}>博文</span>
                          </Link>
                        </li>;
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
      <LoadMore {...pagination} />
      {!initialLoading && !hasMore && !error && loadedCount > 0 && <p className={styles.end}>共 {total} 篇，故事还在继续。</p>}
    </div>
  );
}
