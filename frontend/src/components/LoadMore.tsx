'use client';

export function LoadMore({ loading, error, hasMore, loadMore, retry }: {
  loading: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}) {
  if (!loading && !error && !hasMore) return null;
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}
      <button onClick={error ? retry : loadMore} disabled={loading}
        className="px-5 py-2 rounded-xl text-sm btn-glass disabled:opacity-50" style={{ color: 'var(--primary)' }}>
        {loading ? '加载中...' : error ? '重试' : '加载更多'}
      </button>
    </div>
  );
}
