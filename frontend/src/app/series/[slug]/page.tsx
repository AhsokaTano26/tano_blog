'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Bookmark, Calendar } from 'lucide-react';
import { Loading } from '@/components/Loading';

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
      <div className="glass-card rounded-2xl p-6 mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{series.name}</h1>
        {series.description && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{series.description}</p>
        )}
        <p className="text-xs mt-2" style={{ color: 'var(--text-info)' }}>
          共 {series.posts?.length || 0} 篇文章
        </p>
      </div>

      <div className="space-y-4">
        {series.posts?.map((post: any, index: number) => (
          <Link key={post.id} href={`/posts/${post.slug}`}
            className="block glass-card rounded-2xl p-5 transition-all hover:translate-y-[-2px]">
            <div className="flex items-start gap-4">
              {post.cover_image && (
                <img src={post.cover_image} alt={post.title}
                  className="w-24 h-16 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--text-info)' }}>
                  <span>第 {index + 1} 篇</span>
                  {post.published_at && (
                    <>
                      <span>·</span>
                      <Calendar className="w-3 h-3" />
                      {new Date(post.published_at).toLocaleDateString('zh-CN')}
                    </>
                  )}
                </div>
                <h2 className="font-bold line-clamp-1" style={{ color: 'var(--text-primary)' }}>{post.title}</h2>
                {post.excerpt && (
                  <p className="text-sm line-clamp-2 mt-1" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
        {(!series.posts || series.posts.length === 0) && (
          <p className="text-center py-10" style={{ color: 'var(--text-info)' }}>暂无文章</p>
        )}
      </div>
    </div>
  );
}
