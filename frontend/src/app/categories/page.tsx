'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { FolderTree, BookOpen, ArrowLeft } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function CategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCategories().then(res => {
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
          <FolderTree className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>全部分类</h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>共 {items.length} 个分类</p>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="text-center py-20 card-base rounded-2xl" style={{ color: 'var(--text-secondary)' }}>
          <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无分类</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((cat: any) => (
            <Link key={cat.id} href={`/categories/${cat.slug}`}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all hover:scale-[1.02]"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--glass-border)',
              }}>
              <div className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                style={{ background: 'var(--primary-sub)' }}>
                <BookOpen className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              </div>
              <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {cat.name}
              </span>
              <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--text-info)' }}>
                {cat.post_count ?? 0} 篇
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
