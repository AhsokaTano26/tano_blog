'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCategory(slug).then(setData).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
      <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
      加载中...
    </div>
  );
  if (!data) return <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>分类不存在</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>{data.category.name}</h1>
      <div className="space-y-4">
        {data.posts.map((post: any) => (
          <div key={post.id} className="card-base rounded-2xl p-6" style={{ background: 'var(--card-bg)' }}>
            <h2 className="text-xl font-bold">
              <a href={`/posts/${post.slug}`} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                {post.title}
              </a>
            </h2>
            {post.excerpt && <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
