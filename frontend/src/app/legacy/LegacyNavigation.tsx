'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { TaxonomyItem } from '@/lib/home-data';
import styles from './legacy-navigation.module.css';

const sections = [
  { key: '', href: '/legacy', label: '网站首页' },
  { key: 'posts', href: '/legacy/posts', label: '文章列表' },
  { key: 'archive', href: '/legacy/archive', label: '时光归档' },
  { key: 'gallery', href: '/legacy/gallery', label: '图片馆' },
  { key: 'links', href: '/legacy/links', label: '友情链接' },
  { key: 'about', href: '/legacy/about', label: '关于本站' },
];

const shortcuts: Record<string, { href: string; label: string }[]> = {
  '': [
    { href: '/legacy#legacy-latest', label: '最新文章' },
    { href: '/legacy#legacy-featured', label: '图文精选' },
    { href: '/legacy#legacy-popular', label: '热门文章' },
    { href: '/legacy#legacy-photos', label: '影像记忆' },
  ],
  posts: [
    { href: '/legacy/posts', label: '全部文章' },
    { href: '/legacy/posts#legacy-search', label: '文章检索' },
  ],
  archive: [
    { href: '/legacy/archive#legacy-content', label: '按月浏览' },
    { href: '/legacy/posts', label: '全部文章' },
  ],
  gallery: [
    { href: '/legacy/gallery#legacy-content', label: '全部图片' },
    { href: '/legacy#legacy-photos', label: '影像记忆' },
  ],
  links: [
    { href: '/legacy/links#legacy-content', label: '全部友链' },
    { href: '/links', label: '申请友链' },
  ],
  about: [
    { href: '/legacy/about#legacy-content', label: '站点介绍' },
    { href: '/legacy/about#legacy-edition', label: '旧版说明' },
  ],
};

function CategoryMenu({ categories }: { categories: Pick<TaxonomyItem, 'slug' | 'name'>[] }) {
  const [open, setOpen] = useState(false);
  const flyout = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !flyout.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div ref={flyout} className={styles.flyout}
      onBlur={event => {
        // A mouse click on a WebKit link can blur its trigger without focusing the link.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        文章分类 <span aria-hidden="true">▾</span>
      </button>
      <ul id={id} hidden={!open} className={styles.categoryMenu}>
        {categories.map(category => (
          <li key={category.slug}><a href={`/legacy/posts?category=${encodeURIComponent(category.slug)}`}>{category.name}</a></li>
        ))}
      </ul>
    </div>
  );
}

export function LegacyNavigation({ active, categories }: {
  active: string;
  categories: Pick<TaxonomyItem, 'slug' | 'name'>[];
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const secondary = useRef<HTMLDivElement>(null);
  const current = preview ?? active;

  return (
    <nav className={styles.navigation} aria-label="旧版主导航"
      onPointerLeave={event => {
        if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) setPreview(null);
      }}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setPreview(null);
      }}>
      <div className={styles.primary}>
        {sections.map(section => (
          <a key={section.key} href={section.href}
            aria-current={active === section.key ? 'page' : undefined} data-preview={current === section.key}
            onPointerEnter={event => {
              if (event.pointerType === 'mouse' && !secondary.current?.contains(document.activeElement)) {
                setPreview(section.key);
              }
            }}>
            {section.label}
          </a>
        ))}
      </div>
      <div key={current} ref={secondary} className={styles.secondary} aria-label="栏目快捷导航" role="group">
        {shortcuts[current]?.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
        {current === 'posts' && categories.length > 0 && <CategoryMenu categories={categories} />}
      </div>
    </nav>
  );
}
