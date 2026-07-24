'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';

export default function TagsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [tag, setTag] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getTag(slug, { page: String(page), page_size: '10' })
      .then(res => {
        setTag(res.tag);
        setPosts(res.posts);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [slug, page]);

  const totalPages = Math.ceil(total / 10);

  function changePage(nextPage: number) {
    const normalized = Math.max(1, nextPage);
    setPage(normalized);
    const url = new URL(window.location.href);
    if (normalized === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(normalized));
    window.history.replaceState(window.history.state, '', url);
  }

  if (loading) return <Loading />;
  if (!tag) return <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>标签不存在</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>#{tag.name}</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-info)' }}>共 {total} 篇文章</p>
      <div className="space-y-4">
        {posts.map((post: any) => (
          <div key={post.id} className="card-base rounded-2xl p-6" style={{ background: 'var(--card-bg)' }}>
            <h2 className="text-xl font-bold">
              <Link href={`/posts/${post.slug}`} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                {post.title}
              </Link>
            </h2>
            {post.excerpt && <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>}
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-8">
          <button onClick={() => changePage(page - 1)} disabled={page === 1}
            className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 text-sm"
            style={{ color: 'var(--text-primary)' }}>上一页</button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const start = Math.max(1, page - 5);
            const p = start + i;
            if (p > totalPages) return null;
            return (
              <button key={p} onClick={() => changePage(p)}
                className="w-8 h-8 rounded-xl text-sm transition-all"
                style={{
                  background: p === page ? 'var(--primary)' : 'transparent',
                  color: p === page ? '#fff' : 'var(--text-primary)',
                }}>{p}</button>
            );
          })}
          <button onClick={() => changePage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 text-sm"
            style={{ color: 'var(--text-primary)' }}>下一页</button>
        </div>
      )}
    </div>
  );
}
