'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Eye, Mail, ChevronRight, ArrowUp, Calendar, BookOpen, Tag, MessageSquare } from 'lucide-react';
import { FaGithub } from 'react-icons/fa6';

export default function Home() {
  const [posts, setPosts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTop, setShowTop] = useState(false);
  const pageSize = 10;
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, [page]);

  useEffect(() => {
    const handleScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
      const [postRes, catRes, tagRes] = await Promise.all([
        api.getPosts({ page: String(page), page_size: String(pageSize) }),
        api.getCategories(),
        api.getTags(),
      ]);
      setPosts(postRes.items);
      setTotal(postRes.total);
      setCategories(catRes.items);
      setTags(tagRes.items);
    } catch {
      setError('加载失败，请刷新重试');
    }
    setLoading(false);
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
      <div className="relative z-20" style={{ top: 'calc(55vh - 3.5rem)' }}>
        <div className="max-w-[var(--page-width)] mx-auto px-0 md:px-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: '17.5rem auto' }}>
            {/* Sidebar */}
            <aside className="col-span-2 row-start-2 row-end-3 mb-4 lg:col-span-1 lg:row-start-1 lg:row-end-2 lg:max-w-[17.5rem]">
              <div className="flex flex-col gap-4">
                {/* Profile */}
                <div className="card-base p-3">
                  <a href="/" className="group relative mx-auto mb-3 mt-1 block max-w-[12rem] overflow-hidden rounded-xl lg:mx-0 lg:mt-0 lg:max-w-none">
                    <img src="/aimi.png" alt="Tano"
                      className="mx-auto h-full lg:mt-0 lg:w-full rounded-xl object-cover" />
                  </a>
                  <div className="px-2">
                    <div className="mb-1 text-center text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Tano</div>
                    <div className="mx-auto mb-2 h-1 w-5 rounded-full" style={{ background: 'var(--primary)' }} />
                    <div className="mb-2.5 text-center" style={{ color: 'var(--text-secondary)' }}>A BanG Dreamer!</div>
                    <div className="mb-1 flex justify-center gap-2">
                      <a href="mailto:public@tano.asia"
                        className="btn-glass h-10 w-10 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}>
                        <Mail className="w-5 h-5" />
                      </a>
                      <a href="https://github.com/AhsokaTano26" target="_blank" rel="noopener noreferrer"
                        className="btn-glass h-10 w-10 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}>
                        <FaGithub className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Sticky widgets */}
                <div className="sticky top-16 flex flex-col gap-4">
                  {/* Categories */}
                  {categories.length > 0 && (
                    <div className="card-base pb-4">
                      <div className="widget-title mb-2 ml-8 mt-4 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        分类目录
                      </div>
                      <div className="px-4">
                        {categories.map((cat: any) => (
                          <a key={cat.id} href={`/categories/${cat.slug}`}>
                            <button className="h-10 w-full rounded-lg pl-2 text-left transition-all hover:pl-3"
                              style={{ color: 'var(--text-secondary)' }}>
                              <div className="relative mr-2 flex items-center justify-between">
                                <div className="overflow-hidden overflow-ellipsis whitespace-nowrap">{cat.name}</div>
                                <div className="ml-4 flex h-7 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-bold"
                                  style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                                  {cat.post_count || 0}
                                </div>
                              </div>
                            </button>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="card-base pb-4">
                      <div className="widget-title mb-2 ml-8 mt-4 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        标签
                      </div>
                      <div className="px-4">
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag: any) => (
                            <a key={tag.id} href={`/tags/${tag.slug}`}
                              className="btn-glass h-8 rounded-lg px-3 text-sm"
                              style={{ color: 'var(--text-secondary)' }}>
                              {tag.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Main content */}
            <main className="col-span-2 lg:col-span-1 overflow-hidden">
              <div className="flex flex-col gap-4">
                {loading ? (
                  <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
                    <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                    加载中...
                  </div>
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
                      <article key={post.id || post.slug || index}
                        className="card-base post-card rounded-2xl overflow-hidden animate-fade-in-up"
                        style={{ animationDelay: `calc(var(--content-delay) + ${index * 50}ms)`, animationFillMode: 'forwards' }}>
                        <div className="flex flex-col-reverse md:flex-row">
                          {/* Content */}
                          <div className="relative pb-6 pl-6 pr-6 pt-6 md:pl-9 md:pr-2 md:pt-7 w-full md:w-[calc(100%-var(--coverWidth,_0px)-12px)]">
                            <a href={`/posts/${post.slug}`} className="group mb-3 block w-full">
                              <h2 className="text-2xl font-bold transition-colors group-hover:text-[var(--primary)]"
                                style={{ color: 'var(--text-primary)' }}>
                                {post.title}
                              </h2>
                            </a>

                            {/* Metadata */}
                            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ color: 'var(--text-secondary)' }}>
                              {post.published_at && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Calendar className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <span>{new Date(post.published_at).toLocaleDateString('zh-CN')}</span>
                                </div>
                              )}
                              {post.category && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <BookOpen className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <a href={`/categories/${post.category.slug}`}
                                    className="transition-colors hover:text-[var(--primary)]">
                                    {post.category.name}
                                  </a>
                                </div>
                              )}
                              {post.tags && post.tags.length > 0 && (
                                <div className="hidden items-center gap-1.5 text-sm md:flex">
                                  <Tag className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                                  <div className="flex flex-nowrap items-center gap-1">
                                    {post.tags.slice(0, 3).map((tag: any, i: number) => (
                                      <span key={tag.id} className="flex items-center">
                                        {i > 0 && <span className="mx-1" style={{ color: 'var(--text-info)' }}>/</span>}
                                        <a href={`/tags/${tag.slug}`}
                                          className="whitespace-nowrap transition-colors hover:text-[var(--primary)]">
                                          {tag.name}
                                        </a>
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
                            <a href={`/posts/${post.slug}`}
                              className="group relative mx-4 -mb-2 mt-4 max-h-[20vh] overflow-hidden rounded-xl md:absolute md:bottom-3 md:right-3 md:top-3 md:mx-0 md:mb-0 md:mt-0 md:max-h-none md:w-[28%]">
                              <div className="pointer-events-none absolute inset-0 z-10 transition group-hover:bg-black/30" />
                              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                                <ChevronRight className="w-12 h-12 text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100" />
                              </div>
                              <img src={post.cover_image} alt={post.title} loading="lazy"
                                className="h-full w-full object-cover" />
                            </a>
                          ) : (
                            <a href={`/posts/${post.slug}`}
                              className="btn-glass absolute bottom-3 right-3 top-3 hidden w-[3.25rem] items-center justify-center rounded-xl md:flex">
                              <ChevronRight className="mx-auto w-10 h-10 transition" style={{ color: 'var(--primary)' }} />
                            </a>
                          )}
                        </div>
                      </article>
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
          <div className="my-10 w-2/3 mx-auto border-t border-dashed" style={{ borderColor: 'var(--border-color)' }} />
          <div className="mb-12 flex flex-col items-center justify-center rounded-2xl border-dashed px-6 pb-8"
            style={{ borderColor: 'var(--border-color)', borderWidth: '1px', borderStyle: 'dashed' }}>
            <div className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              &copy; {new Date().getFullYear()} 朝花夕拾录. All Rights Reserved. /
              <a className="font-medium ml-1 transition-colors hover:underline" style={{ color: 'var(--primary)' }} href="/rss.xml">RSS</a> /
              <a className="font-medium ml-1 transition-colors hover:underline" style={{ color: 'var(--primary)' }} href="/sitemap.xml">Sitemap</a>
            </div>
          </div>
        </div>
      </div>

      {/* Back to Top */}
      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="回到顶部"
        className={`fixed bottom-6 right-6 z-50 w-10 h-10 rounded-xl flex items-center justify-center glass-card transition-all duration-300 ${
          showTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{ color: 'var(--text-primary)' }}>
        <ArrowUp className="w-5 h-5" />
      </button>
    </div>
  );
}
