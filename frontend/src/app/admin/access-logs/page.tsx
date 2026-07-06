'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { ScrollText, Search, Download, Trash2, X, Activity, Globe, AlertTriangle, Clock, BarChart3, LineChart } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

type AccessLog = {
  id: string;
  ip_address: string;
  user_agent: string;
  method: string;
  path: string;
  query_params: string;
  status_code: number;
  response_time: number;
  referer: string;
  country: string;
  city: string;
  device_type: string;
  browser: string;
  os: string;
  created_at: string;
};

type Stats = {
  total_requests: number;
  unique_ips: number;
  total_errors: number;
  avg_response_ms: number;
  daily_counts: { date: string; count: number }[];
};

function FloatingModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function AdminAccessLogs() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [chartWidth, setChartWidth] = useState(600);
  const chartRef = useRef<HTMLDivElement>(null);
  const [detailLog, setDetailLog] = useState<AccessLog | null>(null);

  // Filters
  const [pathFilter, setPathFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const pageSize = 20;

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
      if (pathFilter) params.path = pathFilter;
      if (methodFilter) params.method = methodFilter;
      if (statusFilter) params.status_code = statusFilter;
      if (ipFilter) params.ip = ipFilter;
      if (startDate) params.start = startDate;
      if (endDate) params.end = endDate + 'T23:59:59';
      const res = await api.admin.accessLogs.list(params);
      setItems(res.items || []);
      setTotal(res.total);
    } catch { /* empty */ }
    setLoading(false);
  }

  async function loadStats() {
    try {
      const res = await api.admin.accessLogs.stats();
      setStats(res);
    } catch { /* empty */ }
  }

  useEffect(() => { load(); }, [page]);
  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(el);
    setChartWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [stats?.daily_counts]);

  function handleFilter() {
    setPage(1);
    load();
  }

  function handleClearFilters() {
    setPathFilter('');
    setMethodFilter('');
    setStatusFilter('');
    setIpFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    setTimeout(load, 0);
  }

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此日志？')) return;
    try {
      await api.admin.accessLogs.delete(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(prev => prev - 1);
      loadStats();
    } catch { /* empty */ }
  }

  async function handleClearAll() {
    if (!await confirm('确定清空所有日志？此操作不可恢复！')) return;
    try {
      await api.admin.accessLogs.clear();
      setItems([]);
      setTotal(0);
      loadStats();
    } catch { /* empty */ }
  }

  function handleExport() {
    const params: Record<string, string> = {};
    if (pathFilter) params.path = pathFilter;
    if (methodFilter) params.method = methodFilter;
    if (statusFilter) params.status_code = statusFilter;
    if (ipFilter) params.ip = ipFilter;
    if (startDate) params.start = startDate;
    if (endDate) params.end = endDate + 'T23:59:59';
    api.admin.accessLogs.export(Object.keys(params).length > 0 ? params : undefined);
  }

  function hasActiveFilters() {
    return pathFilter || methodFilter || statusFilter || ipFilter || startDate || endDate;
  }

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' } as const;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>审计日志</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium btn-glass transition-colors"
            style={{ color: 'var(--text-secondary)' }}>
            <Download className="w-4 h-4" />
            导出CSV
          </button>
          <button onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium btn-glass transition-colors"
            style={{ color: 'var(--color-error)' }}>
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: '总请求', value: stats.total_requests.toLocaleString(), icon: Activity, color: 'var(--primary)' },
            { label: '独立IP', value: stats.unique_ips.toLocaleString(), icon: Globe, color: 'hsl(210, 60%, 55%)' },
            { label: '错误请求', value: stats.total_errors.toLocaleString(), icon: AlertTriangle, color: 'hsl(0, 60%, 55%)' },
            { label: '平均耗时', value: `${Math.round(stats.avg_response_ms)}ms`, icon: Clock, color: 'hsl(142, 60%, 50%)' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>{stat.label}</span>
                </div>
                <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily chart */}
      {stats && stats.daily_counts.length > 0 && (
        <div className="glass-card rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs" style={{ color: 'var(--text-info)' }}>近7日请求趋势</div>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--btn-card-bg)' }}>
              <button onClick={() => setChartType('bar')}
                className="px-2 py-0.5 rounded text-xs transition-all"
                style={{
                  background: chartType === 'bar' ? 'var(--primary)' : 'transparent',
                  color: chartType === 'bar' ? '#fff' : 'var(--text-secondary)',
                }}>
                <BarChart3 className="w-3 h-3 inline mr-0.5" />柱状图
              </button>
              <button onClick={() => setChartType('line')}
                className="px-2 py-0.5 rounded text-xs transition-all"
                style={{
                  background: chartType === 'line' ? 'var(--primary)' : 'transparent',
                  color: chartType === 'line' ? '#fff' : 'var(--text-secondary)',
                }}>
                <LineChart className="w-3 h-3 inline mr-0.5" />折线图
              </button>
            </div>
          </div>
          {chartType === 'bar' ? (
            <div className="flex items-end gap-2" style={{ height: '80px' }}>
              {stats.daily_counts.map(d => {
                const max = Math.max(...stats.daily_counts.map(x => x.count), 1);
                const h = Math.max(4, Math.round((d.count / max) * 64));
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{d.count}</span>
                    <div className="w-full rounded-t" style={{ height: `${h}px`, background: 'var(--primary)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-info)' }}>{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div ref={chartRef} style={{ height: '80px', position: 'relative' }}>
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} 80`} style={{ pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="logLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {(() => {
                  const data = stats.daily_counts;
                  const maxV = Math.max(...data.map((d: any) => d.count), 1);
                  const padBottom = 18;
                  const padTop = 16;
                  const plotH = 80 - padTop - padBottom;
                  const pts = data.map((d: any, i: number) => {
                    const x = (i / (data.length - 1)) * chartWidth;
                    const y = padTop + plotH - (d.count / maxV) * plotH;
                    return `${x},${y}`;
                  });
                  return (
                    <>
                      <polygon fill="url(#logLineGrad)" points={`0,${80 - padBottom} ${pts.join(' ')} ${chartWidth},${80 - padBottom}`} />
                      <polyline fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
                    </>
                  );
                })()}
              </svg>
              {stats.daily_counts.map((d: any, i: number) => {
                const maxV = Math.max(...stats.daily_counts.map((x: any) => x.count), 1);
                const padBottom = 18;
                const padTop = 16;
                const plotH = 80 - padTop - padBottom;
                const left = (i / (stats.daily_counts.length - 1)) * 100;
                const cy = padBottom + (d.count / maxV) * plotH;
                return (
                  <div key={i} className="absolute" style={{ left: `${left}%`, bottom: `${cy}px`, transform: 'translateX(-50%) translateY(-3px)' }}>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] leading-none mb-1" style={{ color: 'var(--text-secondary)' }}>{d.count}</span>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-bg)', border: '2px solid', borderColor: 'var(--primary)' }} />
                    </div>
                  </div>
                );
              })}
              <div className="absolute bottom-0 left-0 right-0" style={{ height: '16px' }}>
                {stats.daily_counts.map((d: any, i: number) => (
                  <div key={i} className="absolute" style={{ left: `${(i / (stats.daily_counts.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--text-info)' }}>{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="glass-card rounded-xl mb-4">
        <div className="p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>路径</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
                <input type="text" placeholder="搜索路径..." value={pathFilter}
                  onChange={e => setPathFilter(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFilter()}
                  className={`${inputClass} pl-9`} style={inputStyle} />
              </div>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>IP地址</label>
              <input type="text" placeholder="搜索IP..." value={ipFilter}
                onChange={e => setIpFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFilter()}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="w-28">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>方法</label>
              <Select value={methodFilter} onChange={setMethodFilter}
                options={[
                  { value: '', label: '全部' },
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'PATCH', label: 'PATCH' },
                  { value: 'DELETE', label: 'DELETE' },
                ]} />
            </div>
            <div className="w-28">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>状态码</label>
              <Select value={statusFilter} onChange={setStatusFilter}
                options={[
                  { value: '', label: '全部' },
                  { value: '200', label: '2xx 成功' },
                  { value: '301', label: '3xx 重定向' },
                  { value: '400', label: '4xx 客户端错误' },
                  { value: '500', label: '5xx 服务器错误' },
                ]} />
            </div>
            <div className="w-36">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>开始日期</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="w-36">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>结束日期</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleFilter}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: 'var(--primary)' }}>筛选</button>
              {hasActiveFilters() && (
                <button onClick={handleClearFilters}
                  className="px-3 py-2 rounded-lg text-sm btn-glass transition-colors"
                  style={{ color: 'var(--text-secondary)' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <Loading />
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
                  {['时间', 'IP', '方法', '路径', '状态', '耗时', '浏览器'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-20" style={{ color: 'var(--text-secondary)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <tr key={log.id} className="transition-colors cursor-pointer hover:opacity-80"
                    style={{ borderBottom: '1px solid var(--glass-border)' }}
                    onClick={() => setDetailLog(log)}>
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
                            log.method === 'DELETE' ? 'hsla(0, 60%, 50%, 0.1)' : 'var(--surface-bg)',
                          color: log.method === 'GET' ? 'hsl(210, 60%, 55%)' :
                            log.method === 'POST' ? 'hsl(142, 60%, 50%)' :
                            log.method === 'PUT' || log.method === 'PATCH' ? 'hsl(30, 60%, 55%)' :
                            log.method === 'DELETE' ? 'hsl(0, 60%, 55%)' : 'var(--text-secondary)',
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
                            log.status_code < 500 ? 'hsl(30, 60%, 55%)' : 'hsl(0, 60%, 55%)',
                        }}>{log.status_code}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>{log.response_time}ms</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }} title={log.browser}>{log.browser || '-'}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDelete(log.id)}
                        className="btn-glass p-1.5 rounded transition-colors" title="删除">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                    </td>
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
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="btn-glass px-3 py-1.5 rounded disabled:opacity-40 transition-colors" style={{ color: 'var(--text-secondary)' }}>上一页</button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 5, totalPages - 9)) + i;
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

      {/* Detail Modal */}
      {detailLog && (
        <FloatingModal onClose={() => setDetailLog(null)}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>请求详情</h2>
              <button onClick={() => setDetailLog(null)} className="p-1 rounded btn-glass">
                <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-1 rounded text-xs font-mono font-medium"
                style={{
                  background: detailLog.method === 'GET' ? 'hsla(210, 60%, 50%, 0.1)' :
                    detailLog.method === 'POST' ? 'hsla(142, 60%, 50%, 0.1)' :
                    detailLog.method === 'DELETE' ? 'hsla(0, 60%, 50%, 0.1)' : 'var(--surface-bg)',
                  color: detailLog.method === 'GET' ? 'hsl(210, 60%, 55%)' :
                    detailLog.method === 'POST' ? 'hsl(142, 60%, 50%)' :
                    detailLog.method === 'DELETE' ? 'hsl(0, 60%, 55%)' : 'var(--text-secondary)',
                }}>{detailLog.method}</span>
              <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{detailLog.path}</span>
              <span className="font-mono text-sm font-medium"
                style={{
                  color: detailLog.status_code < 300 ? 'hsl(142, 60%, 50%)' :
                    detailLog.status_code < 500 ? 'hsl(30, 60%, 55%)' : 'hsl(0, 60%, 55%)',
                }}>{detailLog.status_code}</span>
            </div>

            <div className="space-y-2.5">
              {[
                { label: '时间', value: new Date(detailLog.created_at).toLocaleString('zh-CN') },
                { label: 'IP地址', value: detailLog.ip_address },
                { label: '耗时', value: `${detailLog.response_time}ms` },
                detailLog.query_params ? { label: '查询参数', value: detailLog.query_params } : null,
                { label: '设备', value: detailLog.device_type || '-' },
                { label: '浏览器', value: detailLog.browser || '-' },
                { label: '操作系统', value: detailLog.os || '-' },
                { label: '国家', value: detailLog.country || '-' },
                { label: '城市', value: detailLog.city || '-' },
                detailLog.referer ? { label: 'Referer', value: detailLog.referer } : null,
                { label: 'User-Agent', value: detailLog.user_agent || '-' },
              ].filter(Boolean).map(item => item && (
                <div key={item.label} className="flex gap-3">
                  <span className="w-20 text-xs flex-shrink-0 pt-0.5" style={{ color: 'var(--text-info)' }}>{item.label}</span>
                  <span className="text-sm break-all font-mono" style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </FloatingModal>
      )}
    </div>
  );
}
