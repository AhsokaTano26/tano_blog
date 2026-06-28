'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Search, TrendingUp } from 'lucide-react';
import { Loading } from '@/components/Loading';

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(q);
  const [tags, setTags] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);

  useEffect(() => {
    api.getTags().then(res => setTags(res.items || [])).catch(() => {});
    api.getPosts({ page: '1', page_size: '5' }).then(res => setRecentPosts(res.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    api.getPosts({ search: q, page: '1', page_size: '20' }).then(res => {
      setPosts(res.items);
      setTotal(res.total);
    }).finally(() => setLoading(false));
  }, [q]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query) window.location.href = `/search?q=${encodeURIComponent(query)}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索文章..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--btn-card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--primary)' }}
          >
            搜索
          </button>
        </div>
      </form>

      {q ? (
        <>
          <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            搜索 &ldquo;{q}&rdquo;，共 {total} 条结果
          </p>
          {loading ? (
            <Loading />
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div key={post.id} className="card-base rounded-2xl p-6" style={{ background: 'var(--card-bg)' }}>
                  <h2 className="text-xl font-bold">
                    <Link href={`/posts/${post.slug}`} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                      {post.title}
                    </Link>
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>
                  )}
                </div>
              ))}
              {posts.length === 0 && (
                <p className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>没有找到相关文章</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          {/* Hot tags */}
          {tags.length > 0 && (
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                热门标签
              </h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: any) => (
                  <Link
                    key={tag.id}
                    href={`/search?q=${encodeURIComponent(tag.name)}`}
                    className="px-4 py-2 rounded-xl text-sm transition-colors hover:opacity-80"
                    style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent posts */}
          {recentPosts.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>最近文章</h2>
              <div className="space-y-3">
                {recentPosts.map((post: any) => (
                  <Link
                    key={post.id}
                    href={`/posts/${post.slug}`}
                    className="block card-base rounded-2xl p-4 transition-all hover:translate-y-[-2px]"
                    style={{ background: 'var(--card-bg)' }}
                  >
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{post.title}</h3>
                    {post.excerpt && (
                      <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{post.excerpt}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
