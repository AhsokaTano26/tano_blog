'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Bookmark, Calendar, Eye, BookOpen, Tag, ChevronRight, MessageSquare, User } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { ScrollReveal } from '@/components/ScrollReveal';

export default function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [series, setSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSeriesBySlug(slug).then(res => {
      setSeries(res.series);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <Loading />;
  if (!series) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">系列不存在</p>
        <Link href="/" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>返回首页</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Series header */}
      <ScrollReveal>
      <div className="glass-card rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Bookmark className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{series.name}</h1>
        </div>
        {series.description && (
          <p className="text-sm ml-8" style={{ color: 'var(--text-secondary)' }}>{series.description}</p>
        )}
        <p className="text-xs ml-8 mt-1" style={{ color: 'var(--text-info)' }}>
          共 {series.posts?.length || 0} 篇文章
        </p>
      </div>
      </ScrollReveal>

      {/* Post list */}
      <div className="flex flex-col gap-4">
        {series.posts?.map((post: any, index: number) => (
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
                  <div className="flex items-center gap-1.5 text-sm">
                    <Bookmark className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                    <span style={{ color: 'var(--primary)' }}>第 {index + 1} 篇</span>
                  </div>
                  {post.published_at && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Calendar className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      <span>{new Date(post.published_at).toLocaleDateString('zh-CN')}</span>
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
        {(!series.posts || series.posts.length === 0) && (
          <p className="text-center py-10" style={{ color: 'var(--text-info)' }}>暂无文章</p>
        )}
      </div>
    </div>
  );
}
