/* eslint-disable @next/next/no-html-link-for-pages -- Legacy links must recheck availability on the server. */
import type { ReactNode } from 'react';
import type { FriendLinkItem } from '@/lib/admin-types';
import type { PostSummary, TaxonomyItem } from '@/lib/home-data';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { LegacyAvailability } from '@/components/LegacyAvailability';
import { LegacyNavigation } from './LegacyNavigation';
import { LegacyReleaseBanner } from './LegacyReleaseBanner';
import { SITE_TIME_ZONE } from './legacy-time';
import {
  dateOf, formatDay, friendHref, legacyPostHref, withQuery, LEGACY_HOME, LEGACY_LIST,
  type Collection, type LegacyImage,
} from './data';
import styles from './portal.module.css';

export function PortalFrame({ config, active, search, modernHref, categories, date, children }: {
  config: Record<string, string>;
  active: string;
  search: string;
  modernHref: string;
  categories: Pick<TaxonomyItem, 'slug' | 'name'>[];
  date: Date;
  children: ReactNode;
}) {
  const title = config.site_title || '朝花夕拾录';
  const author = config.profile_name || 'Tano';
  const today = new Intl.DateTimeFormat('zh-CN', {
    timeZone: SITE_TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(date);

  return (
    <LegacyAvailability>
      <div className={styles.canvas} data-testid="legacy-shell">
        <div className={styles.site}>
          <a className={styles.skip} href="#legacy-content">跳到正文</a>
          <header>
            <div className={styles.utility}>
              <span>欢迎访问{title}</span>
              <div>
                <a href="/legacy/login">登录</a><span aria-hidden="true"> | </span>
                <a href={modernHref}>返回新版</a><span aria-hidden="true"> | </span><a href="/rss.xml">RSS</a>
              </div>
            </div>
            <div className={styles.masthead}>
              <a href={LEGACY_HOME} className={styles.wordmark}>{title}</a>
            </div>
            <LegacyNavigation active={active} categories={categories} />
            <div className={`${styles.tools}${active === '' ? ` ${styles.toolsWithRelease}` : ''}`}>
              <time dateTime={formatDay(date.toISOString())}>{today}</time>
              {active === '' && <LegacyReleaseBanner />}
              <form id="legacy-search" action={LEGACY_LIST} role="search">
                <input name="q" aria-label="搜索文章" placeholder="输入关键词" defaultValue={search} maxLength={200} />
                <button type="submit">搜索</button>
              </form>
            </div>
          </header>
          <main id="legacy-content" className={styles.main}>{children}</main>
          <footer className={styles.footer}>
            <p>© {formatDay(date.toISOString()).slice(0, 4)} {author}. All Rights Reserved. <a href={modernHref}>返回新版</a>
              <span aria-hidden="true"> | </span><a href="/rss.xml">RSS 订阅</a>
            </p>
          </footer>
        </div>
      </div>
    </LegacyAvailability>
  );
}

export function Panel({ title, href, id, children }: { title: string; href?: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.panel}>
      <header className={styles.panelHeading}>
        <h2>{title}</h2>
        {href && <a aria-label={`更多${title}`} href={href}>更多 &gt;&gt;</a>}
      </header>
      {children}
    </section>
  );
}

export function SectionHeading({ title }: { title: string }) {
  return (
    <>
      <p className={styles.breadcrumb}><a href={LEGACY_HOME}>网站首页</a> <span aria-hidden="true">&gt;</span> {title}</p>
      <h1 className={styles.heading}>{title}</h1>
    </>
  );
}

export function PostRows({ posts, dated = true }: { posts: PostSummary[]; dated?: boolean }) {
  if (!posts.length) return <p className={styles.empty}>暂无文章</p>;
  return (
    <ul className={`${styles.rows} ${dated ? styles.datedRows : ''}`}>
      {posts.map(post => {
        const date = dateOf(post);
        return <li key={post.id}><a href={legacyPostHref(post.slug)} title={post.title}>{post.title}</a>
          {dated && date && <time dateTime={date}>{date}</time>}
        </li>;
      })}
    </ul>
  );
}

export function CategoryLinks({ items, counts = false, active }: { items: TaxonomyItem[]; counts?: boolean; active?: string }) {
  if (!items.length && counts) return <p className={styles.empty}>暂无分类</p>;
  return (
    <ul className={counts ? styles.categories : styles.rows}>
      {items.map(item => (
        <li key={item.id}>
          <a href={withQuery(LEGACY_LIST, { category: item.slug })} aria-current={item.slug === active ? 'page' : undefined}>{item.name}</a>
          {counts && typeof item.post_count === 'number' && <span>（{item.post_count}）</span>}
        </li>
      ))}
      {!counts && <li><a href={LEGACY_LIST} aria-current={active === '' ? 'page' : undefined}>全部文章</a></li>}
    </ul>
  );
}

export function FriendLinks({ items, compact = false }: { items: FriendLinkItem[]; compact?: boolean }) {
  const links = items.flatMap(item => {
    const href = friendHref(item.url);
    return href ? [{ ...item, href }] : [];
  });
  if (!links.length) return <p className={styles.empty}>暂无友情链接</p>;
  return (
    <ul className={compact ? styles.friendStrip : styles.friendList}>
      {links.map(item => <li key={item.id}>
        <a href={item.href} target="_blank" rel="noopener noreferrer">{item.name}</a>
        {!compact && item.description && <span>{item.description}</span>}
      </li>)}
    </ul>
  );
}

export function PhotoGrid({ items, preview = false }: { items: LegacyImage[]; preview?: boolean }) {
  if (!items.length) return <p className={styles.empty}>暂无图片</p>;
  return (
    <ul className={`${styles.photos} ${preview ? styles.photosPreview : ''}`}>
      {items.map(image => {
        const date = formatDay(image.created_at);
        return <li key={image.id}>
          <a href={image.url} target="_blank" rel="noopener noreferrer">
            <ImageWithFallback src={image.thumbnail_url || image.url} fallbackSrc={image.url}
              alt="" loading={preview ? 'eager' : 'lazy'} decoding="async" className={styles.photo} />
            <span>{image.title || '查看原图'}</span>
          </a>
          {date && <time dateTime={date}>（{date}）</time>}
        </li>;
      })}
    </ul>
  );
}

export function Pagination({ path, filters, collection }: {
  path: string;
  filters?: Record<string, string>;
  collection: Pick<Collection<unknown>, 'page' | 'size' | 'total'>;
}) {
  const { page, size, total } = collection;
  const last = Math.max(1, Math.ceil(total / size));
  const href = (target: number) => withQuery(path, { ...filters, page: String(target) });
  const first = Math.max(1, Math.min(page - 2, last - 4));
  const pages = Array.from({ length: Math.min(5, last) }, (_, index) => index + first);
  const lastShown = first + pages.length - 1;
  return (
    <nav className={styles.pagination} aria-label="分页">
      <span className={styles.pageCount}>共 {total} 条</span>
      <div className={styles.pageButtons}>
        {page > 1 ? <a href={href(Math.min(page - 1, last))} rel="prev">上页</a> : <span aria-disabled="true">上页</span>}
        {first > 1 && <a href={href(1)} aria-label="第 1 页">1</a>}
        {first > 2 && <span className={styles.pageGap}>…</span>}
        {pages.map(number => number === page
          ? <span key={number} aria-current="page" aria-label={`第 ${number} 页`}>{number}</span>
          : <a key={number} href={href(number)} aria-label={`第 ${number} 页`}>{number}</a>)}
        {lastShown < last - 1 && <span className={styles.pageGap}>…</span>}
        {lastShown < last && <a href={href(last)} aria-label={`第 ${last} 页`}>{last}</a>}
        {page < last ? <a href={href(page + 1)} rel="next">下页</a> : <span aria-disabled="true">下页</span>}
      </div>
    </nav>
  );
}
