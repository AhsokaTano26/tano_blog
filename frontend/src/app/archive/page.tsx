'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';

export default function ArchivePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getArchive().then((res) => setItems(res.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>归档</h1>
      {items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>暂无文章</p>
      ) : (
        items.map((group) => (
          <div key={`${group.year}-${group.month}`} className="mb-8">
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {group.year} 年 {group.month} 月 ({group.count})
            </h2>
            <ul className="space-y-2 ml-4 border-l-2 pl-4" style={{ borderColor: 'var(--border-color)' }}>
              {group.posts.map((post: any) => (
                <li key={post.id}>
                  <Link href={`/posts/${post.slug}`} className="hover:underline" style={{ color: 'var(--primary)' }}>
                    {post.title}
                  </Link>
                  <span className="text-sm ml-2" style={{ color: 'var(--text-info)' }}>
                    {new Date(post.published_at).toLocaleDateString('zh-CN')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
