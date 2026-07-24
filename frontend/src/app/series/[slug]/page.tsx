'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Bookmark, Calendar, Eye, BookOpen, ChevronRight } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ImageWithFallback } from '@/components/ImageWithFallback';

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
      {series.cover_image ? (
        <div className="relative rounded-2xl overflow-hidden mb-8" style={{ background: 'var(--card-bg)' }}>
          <ImageWithFallback src={series.cover_image} alt={series.name}
            className="w-full max-h-[60vh] object-contain"
            style={{ display: 'block' }} />
          <div className="absolute bottom-0 left-0 right-0 p-7 backdrop-blur-sm"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.2) 100%)' }}>
            <div className="flex items-center gap-3 mb-2">
              <Bookmark className="w-6 h-6" style={{ color: 'var(--primary-light)' }} />
              <h1 className="text-2xl font-bold text-white">{series.name}</h1>
            </div>
            {series.description && (
              <p className="text-sm ml-11" style={{ color: 'rgba(255,255,255,0.85)' }}>{series.description}</p>
            )}
            <p className="text-xs ml-11 mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              共 {series.posts?.length || 0} 篇文章
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden mb-8">
          <div className="p-6">
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
        </div>
      )}
      </ScrollReveal>

      {/* Post list */}
      <div className="flex flex-col gap-3">
        {series.posts?.map((post: any, index: number) => (
          <ScrollReveal key={post.id || post.slug || index}
            className={`stagger-${(index % 8) + 1}`}>
          <Link
            href={`/posts/${post.slug}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--glass-border)',
            }}>
            <span className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
              style={{
                background: index === 0 ? 'var(--primary)' : 'var(--primary-sub)',
                color: index === 0 ? '#fff' : 'var(--primary)',
              }}>
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {post.title}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {post.published_at && (
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {new Date(post.published_at).toLocaleDateString('zh-CN')}
                  </span>
                )}
                {post.category && (
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                    <BookOpen className="w-3 h-3 inline mr-1" />
                    {post.category.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--text-info)' }}>
              <Eye className="w-3.5 h-3.5" />
              {post.view_count || 0}
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-info)' }} />
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
