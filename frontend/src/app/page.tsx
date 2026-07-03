'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Eye, Mail, ChevronRight, Calendar, BookOpen, Tag, MessageSquare, Globe, Send, MessageCircle, User, Bookmark } from 'lucide-react';
import { FooterInjection } from '@/components/HtmlInjection';
import { Loading } from '@/components/Loading';
import { TagCloud } from '@/components/TagCloud';
import { ScrollReveal } from '@/components/ScrollReveal';

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const pageSize = 10;
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, [page, activeCategory, activeTag]);

  useEffect(() => {
    api.getPublicConfig().then(res => setProfile(res.config)).catch(() => {});
  }, []);

  // Banner parallax
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (bgRef.current) {
            const y = window.scrollY * 0.3;
            bgRef.current.style.transform = `translateY(${y}px) scale(1.1)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
      if (activeCategory) params.category = activeCategory;
      if (activeTag) params.tag = activeTag;
      const [postRes, catRes, tagRes, seriesRes] = await Promise.all([
        api.getPosts(params),
        api.getCategories(),
        api.getTags(),
        api.getSeries(),
      ]);
      setPosts(postRes.items);
      setTotal(postRes.total);
      setCategories(catRes.items);
      setTags(tagRes.items);
      setSeries(seriesRes.items || []);
    } catch {
      setError('加载失败，请刷新重试');
    }
    setLoading(false);
  }

  function handleCategoryFilter(slug: string) {
    setActiveCategory(slug === activeCategory ? '' : slug);
    setActiveTag('');
    setPage(1);
  }

  function handleTagFilter(slug: string) {
    setActiveTag(slug === activeTag ? '' : slug);
    setActiveCategory('');
    setPage(1);
  }

  const totalPages = Math.ceil(total / pageSize);

  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [];
    if (page <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...', totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(1, '...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
    }
    return pages;
  }

  return (
    <div className="relative min-h-screen">
      {/* Banner */}
      <div className="absolute top-0 left-0 right-0 z-10 overflow-hidden" style={{ height: '65vh' }}>
        <div
          ref={bgRef}
          className="absolute inset-0 bg-cover bg-center bg-no-repeat will-change-transform"
          style={{
            backgroundImage: 'url(/2043253.jpg)',
            backgroundPosition: 'bottom',
            transform: 'translateY(0px) scale(1.1)',
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
      </div>

      {/* Content grid */}
      <div className="relative z-20" style={{ top: 'calc(60vh - 3.5rem)' }}>
        <div className="max-w-[var(--page-width)] mx-auto px-0 md:px-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: '17.5rem auto' }}>
            {/* Sidebar */}
            <aside className="col-span-2 row-start-2 row-end-3 mb-4 lg:col-span-1 lg:row-start-1 lg:row-end-2 lg:max-w-[17.5rem]">
              <div className="flex flex-col gap-4">
                {/* Profile */}
                <ScrollReveal>
                <div className="card-base p-3 rounded-2xl">
                  <Link href="/" className="group relative mx-auto mb-3 mt-1 block max-w-[12rem] overflow-hidden rounded-xl lg:mx-0 lg:mt-0 lg:max-w-none">
                    <img src={profile.profile_avatar || '/aimi.png'} alt={profile.profile_name || 'Tano'}
                      className="mx-auto h-full lg:mt-0 lg:w-full rounded-xl object-cover"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = '/aimi.png'; }} />
                  </Link>
                  <div className="px-2">
                    <div className="mb-1 text-center text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{profile.profile_name || 'Tano'}</div>
                    <div className="mx-auto mb-2 h-1 w-5 rounded-full" style={{ background: 'var(--primary)' }} />
                    <div className="mb-2.5 text-center" style={{ color: 'var(--text-secondary)' }}>{profile.profile_bio || 'A BanG Dreamer!'}</div>
                    {(() => {
                      let contacts: { type: string; value: string }[] = [];
                      try { contacts = JSON.parse(profile.profile_contacts || '[]'); } catch {}
                      if (contacts.length === 0) return null;
                      return (
                        <div className="mb-1 flex justify-center gap-2 flex-wrap">
                          {contacts.map((c, i) => {
                            let href = '#';
                            let icon = <Globe className="w-5 h-5" />;
                            if (c.type === 'email') { href = `mailto:${c.value}`; icon = <Mail className="w-5 h-5" />; }
                            else if (c.type === 'github') { href = `https://github.com/${c.value}`; icon = <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>; }
                            else if (c.type === 'twitter') { href = `https://x.com/${c.value}`; icon = <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
                            else if (c.type === 'bilibili') { href = c.value.startsWith('http') ? c.value : `https://space.bilibili.com/${c.value}`; icon = <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.124.929.373.249.249.373.551.373.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/></svg>; }
                            else if (c.type === 'telegram') { href = `https://t.me/${c.value}`; icon = <Send className="w-5 h-5" />; }
                            else if (c.type === 'qq') { href = `wpa://msg/?uin=${c.value}`; icon = <MessageCircle className="w-5 h-5" />; }
                            else if (c.type === 'link') { href = c.value; icon = <Globe className="w-5 h-5" />; }
                            return (
                              <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                                className="btn-glass h-10 w-10 rounded-lg flex items-center justify-center"
                                style={{ color: 'var(--text-secondary)' }}>
                                {icon}
                              </a>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                </ScrollReveal>

                {/* Categories */}
                <ScrollReveal margin="-40px">
                {categories.length > 0 && (
                  <div className="card-base p-4 rounded-2xl">
                    <div className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>分类</div>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat: any) => (
                        <button key={cat.id} onClick={() => handleCategoryFilter(cat.slug)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: activeCategory === cat.slug ? 'var(--primary)' : 'var(--primary-sub)',
                            color: activeCategory === cat.slug ? '#fff' : 'var(--primary)',
                          }}>
                          {cat.name}
                          <span className="ml-1 opacity-70">{cat.post_count || 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </ScrollReveal>

                {/* Tags */}
                <ScrollReveal margin="-60px">
                {tags.length > 0 && (
                  <div className="card-base p-4 rounded-2xl">
                    <div className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>标签</div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag: any) => (
                        <button key={tag.id} onClick={() => handleTagFilter(tag.slug)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: activeTag === tag.slug ? 'var(--primary)' : 'var(--primary-sub)',
                            color: activeTag === tag.slug ? '#fff' : 'var(--primary)',
                          }}>
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </ScrollReveal>

                {/* Series */}
                <ScrollReveal margin="-80px">
                {series.length > 0 && (
                  <div className="card-base p-4 rounded-2xl">
                    <div className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>系列</div>
                    <div className="flex flex-col gap-1">
                      {series.map((s: any) => (
                        <Link key={s.id} href={`/series/${s.slug}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                          style={{ color: 'var(--text-secondary)' }}>
                          <Bookmark className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                          <span className="flex-1 line-clamp-1">{s.name}</span>
                          <span className="text-xs" style={{ color: 'var(--text-info)' }}>{s.post_count || 0}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                </ScrollReveal>

                <ScrollReveal margin="-100px">
                <TagCloud />
                </ScrollReveal>
              </div>
            </aside>

            {/* Main content */}
            <main className="col-span-2 lg:col-span-1">
              <div className="flex flex-col gap-4">
                {/* Active filter indicator */}
                {(activeCategory || activeTag) && (
                  <div className="card-base rounded-2xl px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <span>筛选：</span>
                      {activeCategory && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                          {categories.find(c => c.slug === activeCategory)?.name || activeCategory}
                        </span>
                      )}
                      {activeTag && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                          {tags.find(t => t.slug === activeTag)?.name || activeTag}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: 'var(--text-info)' }}>（{total} 篇文章）</span>
                    </div>
                    <button onClick={() => { setActiveCategory(''); setActiveTag(''); setPage(1); }}
                      className="text-xs px-3 py-1.5 rounded-lg btn-glass"
                      style={{ color: 'var(--text-secondary)' }}>
                      清除筛选
                    </button>
                  </div>
                )}
                {loading ? (
                  <Loading />
                ) : error ? (
                  <div className="text-center py-20 card-base rounded-2xl">
                    <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                    <button onClick={loadData} className="btn-glass px-5 py-2 rounded-xl text-sm" style={{ color: 'var(--primary)' }}>
                      重试
                    </button>
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-20 card-base rounded-2xl" style={{ color: 'var(--text-secondary)' }}>暂无文章</div>
                ) : (
                  <>
                    {posts.map((post: any, index: number) => (
                      <ScrollReveal key={post.id || post.slug || index}
                        className={`stagger-${(index % 8) + 1}`}>
                      <Link
                        href={`/posts/${post.slug}`}
                        className="card-base post-card rounded-2xl overflow-hidden block">
                        <div className="flex flex-col-reverse md:flex-row">
                          {/* Content */}
                          <div className="relative pb-6 pl-6 pr-6 pt-6 md:pl-9 md:pr-[calc(28%+1.5rem)] md:pt-7">
                            <div className="group mb-3 block w-full">
                              <h2 className="text-2xl font-bold transition-colors group-hover:text-[var(--primary)]"
                                style={{ color: 'var(--text-primary)' }}>
                                {post.title}
                              </h2>
                            </div>

                            {/* Metadata */}
                            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ color: 'var(--text-secondary)' }}>
                              {post.published_at && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Calendar className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <span>{new Date(post.published_at).toLocaleDateString('zh-CN')}</span>
                                </div>
                              )}
                              {post.author_name && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <User className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <span>{post.author_name}</span>
                                </div>
                              )}
                              {post.category && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <BookOpen className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <span className="transition-colors hover:text-[var(--primary)]">
                                    {post.category.name}
                                  </span>
                                </div>
                              )}
                              {post.series && post.series.length > 0 && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Bookmark className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                                  <span style={{ color: 'var(--primary)' }}>
                                    {post.series[0].name}
                                  </span>
                                </div>
                              )}
                              {post.tags && post.tags.length > 0 && (
                                <div className="hidden items-center gap-1.5 text-sm md:flex">
                                  <Tag className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <div className="flex flex-nowrap items-center gap-1">
                                    {post.tags.slice(0, 3).map((tag: any, i: number) => (
                                      <span key={tag.id} className="flex items-center">
                                        {i > 0 && <span className="mx-1" style={{ color: 'var(--text-info)' }}>/</span>}
                                        <span className="whitespace-nowrap transition-colors hover:text-[var(--primary)]">
                                          {tag.name}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            {post.excerpt && (
                              <p className="mb-3.5 pr-4 text-sm leading-relaxed line-clamp-2"
                                style={{ color: 'var(--text-secondary)' }}>
                                {post.excerpt}
                              </p>
                            )}

                            {/* View & comment counts */}
                            <div className="flex gap-4 text-sm" style={{ color: 'var(--text-info)' }}>
                              <div className="flex items-center gap-1">
                                <Eye className="w-4 h-4" />
                                {post.view_count || 0}
                              </div>
                              <div>|</div>
                              <div className="flex items-center gap-1">
                                <MessageSquare className="w-4 h-4" />
                                {post.comment_count || 0}
                              </div>
                            </div>
                          </div>

                          {/* Cover image */}
                          {post.cover_image ? (
                            <div className="group relative mx-4 -mb-2 mt-4 max-h-[20vh] overflow-hidden rounded-xl md:absolute md:bottom-3 md:right-3 md:top-3 md:mx-0 md:mb-0 md:mt-0 md:max-h-none md:w-[28%]">
                              <div className="pointer-events-none absolute inset-0 z-10 transition group-hover:bg-black/30" />
                              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                                <ChevronRight className="w-12 h-12 text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100" />
                              </div>
                              <img src={post.cover_image} alt={post.title} loading="lazy"
                                className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="btn-glass absolute bottom-3 right-3 top-3 hidden w-[3.25rem] items-center justify-center rounded-xl md:flex">
                              <ChevronRight className="mx-auto w-10 h-10 transition" style={{ color: 'var(--primary)' }} />
                            </div>
                          )}
                        </div>
                      </Link>
                      </ScrollReveal>
                    ))}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mx-auto flex flex-row justify-center gap-3 py-4">
                        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                          className="btn-glass h-11 w-11 overflow-hidden rounded-lg flex items-center justify-center disabled:opacity-40"
                          style={{ color: 'var(--text-primary)' }}>
                          <ChevronRight className="w-5 h-5 rotate-180" />
                        </button>
                        {getPageNumbers().map((p, i) =>
                          p === '...' ? (
                            <span key={`dots-${i}`} className="h-11 w-11 flex items-center justify-center text-sm" style={{ color: 'var(--text-info)' }}>...</span>
                          ) : (
                            <button key={p} onClick={() => setPage(p)}
                              className="h-11 w-11 overflow-hidden rounded-lg text-sm font-bold transition-all"
                              style={{
                                background: p === page ? 'var(--primary)' : 'var(--card-bg)',
                                color: p === page ? '#fff' : 'var(--text-primary)',
                              }}>
                              {p}
                            </button>
                          )
                        )}
                        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                          className="btn-glass h-11 w-11 overflow-hidden rounded-lg flex items-center justify-center disabled:opacity-40"
                          style={{ color: 'var(--text-primary)' }}>
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </main>
          </div>

          {/* Footer */}
          <div className="my-8 border-t" style={{ borderColor: 'var(--glass-border)' }} />
          <div className="mb-12 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            &copy; {new Date().getFullYear()} 朝花夕拾录. All Rights Reserved. /
            <a className="font-medium ml-1 transition-colors hover:underline" style={{ color: 'var(--primary)' }} href="/rss.xml">RSS</a> /
            <a className="font-medium ml-1 transition-colors hover:underline" style={{ color: 'var(--primary)' }} href="/sitemap.xml">Sitemap</a>
          </div>
          <FooterInjection />
        </div>
      </div>
    </div>
  );
}
