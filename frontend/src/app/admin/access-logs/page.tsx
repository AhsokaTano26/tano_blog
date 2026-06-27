'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ScrollText, Search } from 'lucide-react';

export default function AdminAccessLogs() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pathFilter, setPathFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: '20' };
      if (pathFilter) params.path = pathFilter;
      if (methodFilter) params.method = methodFilter;
      if (statusFilter) params.status_code = statusFilter;
      const res = await api.admin.accessLogs.list(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page]);

  function handleFilter() {
    setPage(1);
    load();
  }

  const totalPages = Math.ceil(total / 20);
  const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>审计日志</h1>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-xl mb-4">
        <div className="flex flex-wrap gap-3 items-end p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>路径</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
              <input type="text" placeholder="搜索路径..." value={pathFilter}
                onChange={e => setPathFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFilter()}
                className={`${inputClass} pl-9`} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>方法</label>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">全部</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>状态码</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">全部</option>
              <option value="200">2xx 成功</option>
              <option value="400">4xx 错误</option>
              <option value="500">5xx 错误</option>
            </select>
          </div>
          <button onClick={handleFilter}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors" style={{ background: 'var(--primary)' }}>筛选</button>
        </div>

        {loading ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <ScrollText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-info)' }} />
            <p>暂无日志</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>方法</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>路径</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>耗时</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>浏览器</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <tr key={log.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{log.ip_address}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium"
                        style={{
                          background: log.method === 'GET' ? 'hsla(210, 60%, 50%, 0.1)' :
                            log.method === 'POST' ? 'hsla(142, 60%, 50%, 0.1)' :
                            log.method === 'PUT' || log.method === 'PATCH' ? 'hsla(30, 60%, 50%, 0.1)' :
                            log.method === 'DELETE' ? 'hsla(0, 60%, 50%, 0.1)' :
                            'var(--surface-bg)',
                          color: log.method === 'GET' ? 'hsl(210, 60%, 55%)' :
                            log.method === 'POST' ? 'hsl(142, 60%, 50%)' :
                            log.method === 'PUT' || log.method === 'PATCH' ? 'hsl(30, 60%, 55%)' :
                            log.method === 'DELETE' ? 'hsl(0, 60%, 55%)' :
                            'var(--text-secondary)',
                        }}>{log.method}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[250px] truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} title={log.path + (log.query_params ? '?' + log.query_params : '')}>
                      {log.path}{log.query_params ? <span style={{ color: 'var(--text-info)' }}>?...</span> : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-medium"
                        style={{
                          color: log.status_code < 300 ? 'hsl(142, 60%, 50%)' :
                            log.status_code < 400 ? 'hsl(210, 60%, 55%)' :
                            log.status_code < 500 ? 'hsl(30, 60%, 55%)' :
                            'hsl(0, 60%, 55%)',
                        }}>{log.status_code}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>{log.response_time}ms</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }} title={log.browser}>{log.browser || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="btn-glass px-3 py-1.5 rounded disabled:opacity-40 transition-colors" style={{ color: 'var(--text-secondary)' }}>上一页</button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = Math.max(1, page - 5) + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-8 h-8 rounded text-sm font-bold transition-all"
                  style={{
                    background: p === page ? 'var(--primary)' : 'var(--card-bg)',
                    color: p === page ? '#fff' : 'var(--text-primary)',
                  }}>{p}</button>
              );
            })}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="btn-glass px-3 py-1.5 rounded disabled:opacity-40 transition-colors" style={{ color: 'var(--text-secondary)' }}>下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
