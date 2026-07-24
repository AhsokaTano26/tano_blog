'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Bookmark, ChevronRight, ArrowLeft } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { ImageWithFallback } from '@/components/ImageWithFallback';

export default function SeriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSeries().then(res => {
      setItems(res.items || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Back button */}
      <Link href="/"
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-all hover:opacity-80"
        style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" />
        返回首页
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ background: 'var(--primary-sub)' }}>
          <Bookmark className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>全部系列</h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>共 {items.length} 个系列</p>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="text-center py-20 card-base rounded-2xl" style={{ color: 'var(--text-secondary)' }}>
          <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无系列</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s: any) => (
            <Link key={s.id} href={`/series/${s.slug}`}
              className="flex flex-col rounded-xl overflow-hidden transition-all hover:scale-[1.01]"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--glass-border)',
              }}>
              {s.cover_image && (
                <ImageWithFallback src={s.cover_image} alt={s.name}
                  className="w-full object-contain bg-black/5"
                  style={{ maxHeight: '200px' }} />
              )}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
                  style={{ background: 'var(--primary-sub)' }}>
                  <Bookmark className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {s.name}
                  </div>
                  {s.description && (
                    <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-info)' }}>
                      {s.description}
                    </div>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-info)' }}>
                  {s.post_count ?? 0} 篇
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-info)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
