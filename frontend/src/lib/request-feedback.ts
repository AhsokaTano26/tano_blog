'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function requestError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback}：${error.message}` : fallback;
}

/** Refreshes always use the current query, and only its newest response can commit. */
export function useLatestRequest<T>(request: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef({ request, fallback });
  const sequence = useRef(0);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    current.current = { request, fallback };
    mounted.current = true;
    return () => { mounted.current = false; sequence.current++; };
  }, [request, fallback]);

  const reload = useCallback(async () => {
    if (!mounted.current) return;
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await current.current.request();
      if (mounted.current && id === sequence.current) setData(result);
    } catch (cause) {
      if (mounted.current && id === sequence.current) setError(requestError(cause, current.current.fallback));
    } finally {
      if (mounted.current && id === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A different query must not present the previous page's rows after failure.
    // Same-query retries call reload directly and retain confirmed data.
    setData(undefined);
    void reload();
  }, [request, reload]);
  return { data, setData, error, loading, reload };
}

/** Ref locking closes the gap before React renders disabled controls. */
export function useFeedbackMutation() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const clearError = useCallback(() => setError(''), []);
  const run = useCallback(async (operation: () => Promise<void>, fallback = '操作失败，请重试') => {
    if (locked.current || !mounted.current) return false;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      await operation();
      return true;
    } catch (cause) {
      if (mounted.current) setError(requestError(cause, fallback));
      return false;
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);
  return { run, pending, error, clearError };
}
