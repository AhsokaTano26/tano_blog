'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';

function PreviewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('缺少预览令牌');
      setLoading(false);
      return;
    }
    api.getPostByPreview(token)
      .then(res => setPost(res.post))
      .catch(e => setError(e.message || '预览链接无效'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Loading />;

  if (error) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-lg mb-4" style={{ color: 'var(--color-error)' }}>{error}</p>
      <Link href="/" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>返回首页</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="glass-card rounded-2xl px-4 py-3 mb-6 text-sm" style={{ borderLeft: '3px solid var(--primary)', color: 'var(--text-secondary)' }}>
        这是草稿预览，仅供预览使用
      </div>
      <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{post.title}</h1>
      <div className="text-sm mb-6" style={{ color: 'var(--text-info)' }}>
        {post.author?.display_name || post.author?.username}
      </div>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>加载中...</div>}>
      <PreviewContent />
    </Suspense>
  );
}
