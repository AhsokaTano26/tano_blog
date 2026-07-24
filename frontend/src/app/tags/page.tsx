'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Tags, Hash, ArrowLeft } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function TagsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTags().then(res => {
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
          <Tags className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>全部标签</h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>共 {items.length} 个标签</p>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="text-center py-20 card-base rounded-2xl" style={{ color: 'var(--text-secondary)' }}>
          <Tags className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无标签</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {items.map((tag: any) => (
            <Link key={tag.id} href={`/tags/${tag.slug}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{
                background: 'var(--primary-sub)',
                color: 'var(--primary)',
              }}>
              <Hash className="w-3 h-3" />
              {tag.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
