'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ItemPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export function usePagedItems<T>(
  fetchPage: (params: Record<string, string>) => Promise<ItemPage<T>>,
  pageSize: number,
  merge: (previous: T[], incoming: T[]) => T[],
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const busy = useRef(false);
  const failedPage = useRef(1);

  const loadPage = useCallback(async (nextPage: number) => {
    const request = ++sequence.current;
    busy.current = true;
    failedPage.current = nextPage;
    setLoading(true);
    setError('');
    try {
      const result = await fetchPage({ page: String(nextPage), page_size: String(pageSize) });
      if (request !== sequence.current) return;
      setItems(previous => merge(nextPage === 1 ? [] : previous, result.items || []));
      setTotal(result.total);
      setPage(result.page || nextPage);
      setSize(result.size || pageSize);
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : '加载失败，请重试');
    } finally {
      if (request === sequence.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [fetchPage, pageSize, merge]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setPage(0);
    void loadPage(1);
    return () => { sequence.current++; busy.current = false; };
  }, [loadPage]);

  return {
    items, setItems, total, loading, error,
    initialLoading: loading && page === 0,
    hasMore: page * size < total,
    loadMore: () => { if (!busy.current) void loadPage(page + 1); },
    retry: () => { if (!busy.current) void loadPage(failedPage.current); },
    reload: () => loadPage(1),
  };
}
