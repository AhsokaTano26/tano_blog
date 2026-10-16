'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type SeriesOption = { id: string; name: string };

export function SeriesSelect({ value, onChange, initialOptions = [] }: {
  value: string; onChange: (id: string) => void; initialOptions?: SeriesOption[];
}) {
  const [items, setItems] = useState<SeriesOption[]>(() => [...new Map(initialOptions.map(item => [item.id, item])).values()]);
  const [known, setKnown] = useState<SeriesOption[]>(() => [...new Map(initialOptions.map(item => [item.id, item])).values()]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.admin.series.list({ page: String(page), page_size: '20', search }).then(response => {
      if (!active) return;
      const next = response.items || [];
      setItems(next);
      setKnown(previous => [...new Map([...previous, ...next].map(item => [item.id, item])).values()]);
      setTotal(response.total || 0);
    }).catch(error => { if (active) setError(error.message || '读取系列失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, retry]);
  const selected = known.find(item => item.id === value);
  return <div className="space-y-2">
    <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}
      aria-label="搜索系列" placeholder="搜索系列..." className="w-full px-3 py-2 rounded-xl text-sm glass-card" />
    <select aria-label="文章系列" value={value} onChange={event => onChange(event.target.value)}
      className="w-full px-3 py-2 rounded-xl text-sm glass-card" style={{ color: 'var(--text-primary)' }}>
      <option value="">无系列</option>
      {value && !items.some(item => item.id === value) && <option value={value}>{selected?.name || '已选系列'}</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {loading && <p role="status" className="text-xs">正在读取系列...</p>}
    {error && <p role="alert" className="text-xs">{error} <button onClick={() => setRetry(value => value + 1)}>重试</button></p>}
    {total > 20 && <nav aria-label="系列分页" className="flex items-center justify-between text-xs">
      <button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>上一页系列</button>
      <span>{page} / {Math.ceil(total / 20)}</span>
      <button disabled={loading || page * 20 >= total} onClick={() => setPage(value => value + 1)}>下一页系列</button>
    </nav>}
  </div>;
}
