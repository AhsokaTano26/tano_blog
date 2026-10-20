'use client';
import { validDateValue } from '@/lib/date-value';

import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DateTimePicker';
import { Input } from '@/components/ui/Input';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { ScrollText, Search, Download, Trash2, X } from 'lucide-react';
import VisitTrendChart from '@/components/VisitTrendChart';
import { RequestSummary } from '@/components/RequestStatistics';
import { recentRequestRange } from '@/lib/request-statistics';
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

type LogFilters = { path: string; method: string; status_code: string; ip: string; start: string; end: string };

function defaultFilters(): LogFilters {
  return { path: '', method: '', status_code: '', ip: '', ...recentRequestRange(30) };
}

function filterParams(filters: LogFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

function FloatingModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog title="访问日志详情" onClose={onClose} layer={200}
      className="admin-dialog-panel w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl"
      style={{ border: '1px solid var(--glass-border)' }}>
      {children}
    </Dialog>
  );
}

export default function AdminAccessLogs() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [filterError, setFilterError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [detailLog, setDetailLog] = useState<AccessLog | null>(null);

  // Draft edits only take effect after applying the filters.
  const [appliedFilters, setAppliedFilters] = useState<LogFilters>(defaultFilters);
  const [pathFilter, setPathFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [startDate, setStartDate] = useState(appliedFilters.start);
  const [endDate, setEndDate] = useState(appliedFilters.end);
  const pageCursors = useRef<Record<number, string>>({});
  const listSequence = useRef(0);
  const statsSequence = useRef(0);

  const pageSize = 20;

  const load = useCallback(async () => {
    const sequence = ++listSequence.current;
    setLoading(true);
    setListError('');
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(pageSize), ...filterParams(appliedFilters) };
      if (pageCursors.current[page]) params.cursor = pageCursors.current[page];
      const res = await api.admin.accessLogs.list(params);
      if (sequence !== listSequence.current) return;
      setItems(res.items || []);
      setTotal(res.total);
      if (res.next_cursor) pageCursors.current[page + 1] = res.next_cursor;
      else delete pageCursors.current[page + 1];
    } catch (error) {
      if (sequence === listSequence.current) setListError(error instanceof Error ? error.message : '日志加载失败');
    } finally {
      if (sequence === listSequence.current) setLoading(false);
    }
  }, [page, appliedFilters]);

  const loadStats = useCallback(async () => {
    const sequence = ++statsSequence.current;
    setStatsError('');
    setStats(null);
    try {
      const res = await api.admin.accessLogs.overview({ start: appliedFilters.start, end: appliedFilters.end });
      if (sequence === statsSequence.current) setStats(res.stats);
    } catch (error) {
      if (sequence === statsSequence.current) setStatsError(error instanceof Error ? error.message : '统计加载失败');
    }
  }, [appliedFilters.start, appliedFilters.end]);

  useEffect(() => {
    void load();
    return () => { listSequence.current++; };
  }, [load, refresh]);
  useEffect(() => {
    void loadStats();
    return () => { statsSequence.current++; };
  }, [loadStats, refresh]);


  function handleFilter() {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
    if (!validDateValue(startDate) || !validDateValue(endDate) || !Number.isFinite(days) || days < 0 || days > 365) {
      setFilterError('请选择有效日期范围，开始日期不能晚于结束日期，最多 366 天');
      return;
    }
    setFilterError('');
    pageCursors.current = {};
    listSequence.current++;
    setPage(1);
    setAppliedFilters({ path: pathFilter.trim(), method: methodFilter, status_code: statusFilter, ip: ipFilter.trim(), start: startDate, end: endDate });
  }

  function handleClearFilters() {
    const defaults = defaultFilters();
    setPathFilter('');
    setMethodFilter('');
    setStatusFilter('');
    setIpFilter('');
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setFilterError('');
    pageCursors.current = {};
    listSequence.current++;
    setPage(1);
    setAppliedFilters(defaults);
  }

  function reloadAfterMutation() {
    pageCursors.current = {};
    listSequence.current++;
    setPage(1);
    setRefresh(value => value + 1);
  }

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此日志？')) return;
    try {
      await api.admin.accessLogs.delete(id);
      reloadAfterMutation();
    } catch (error) { setListError(error instanceof Error ? error.message : '删除失败'); }
  }

  async function handleClearAll() {
    if (!await confirm('确定清空所有日志？此操作不可恢复！')) return;
    try {
      await api.admin.accessLogs.clear();
      reloadAfterMutation();
    } catch (error) { setListError(error instanceof Error ? error.message : '清空失败'); }
  }

  function handleExport() {
    api.admin.accessLogs.export(filterParams(appliedFilters));
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

      {/* Summary and trend share the applied date range; other filters only affect the list. */}
      <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        统计日期：{appliedFilters.start} 至 {appliedFilters.end}（UTC+8，包含结束日）。统计日期范围内全部请求；路径、方法、状态码与 IP 仅筛选下方日志列表。
      </p>
      {statsError && <div role="alert" className="mb-4 text-sm" style={{ color: 'var(--color-error)' }}>
        {statsError} <button onClick={() => void loadStats()} className="underline ml-2">重试统计</button>
      </div>}
      {stats && <div className="space-y-4 mb-5">
        <RequestSummary stats={stats} />
        <VisitTrendChart data={stats.daily_counts} range={appliedFilters} compact />
      </div>}

      {/* Filters */}
      <div className="glass-card rounded-xl mb-4">
        <div className="p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>路径</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
                <Input type="text" placeholder="搜索路径..." value={pathFilter}
                  onChange={e => setPathFilter(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFilter()}
                  className={`${inputClass} pl-9`} style={inputStyle} />
              </div>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>IP地址</label>
              <Input type="text" placeholder="搜索IP..." value={ipFilter}
                onChange={e => setIpFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFilter()}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="w-28">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>方法</label>
              <Select aria-label="请求方法" value={methodFilter} onChange={setMethodFilter}
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
              <Select aria-label="状态筛选" value={statusFilter} onChange={setStatusFilter}
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
              <DatePicker aria-label="开始日期" value={startDate} onChange={value => setStartDate(value)}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="w-36">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>结束日期</label>
              <DatePicker aria-label="结束日期" value={endDate} onChange={value => setEndDate(value)}
                className={inputClass} style={inputStyle} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleFilter}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: 'var(--primary)' }}>筛选</button>
              {hasActiveFilters() && (
                <Tooltip content="重置为近 30 天"><button onClick={handleClearFilters} aria-label="重置筛选" data-tooltip="重置为近 30 天"
                  className="px-3 py-2 rounded-lg text-sm btn-glass transition-colors"
                  style={{ color: 'var(--text-secondary)' }}>
                  <X className="w-4 h-4" />
                </button></Tooltip>
              )}
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-info)' }}>默认查询近 30 天；可选择任意历史日期，每次最多 366 天。导出使用已应用的筛选。</p>
          {filterError && <p role="alert" className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>{filterError}</p>}
        </div>

        {/* Table */}
        {listError && <div role="alert" className="p-4 text-sm" style={{ color: 'var(--color-error)' }}>
          {listError} <button onClick={() => void load()} className="underline ml-2">重试日志</button>
        </div>}
        {loading ? (
          <Loading />
        ) : listError ? null : items.length === 0 ? (
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
                    <Tooltip content={log.path + (log.query_params ? '?' + log.query_params : '')}><td className="px-4 py-3 max-w-[250px] truncate font-mono text-xs" style={{ color: 'var(--text-secondary)' }} data-tooltip={log.path + (log.query_params ? '?' + log.query_params : '')}>
                      {log.path}{log.query_params ? <span style={{ color: 'var(--text-info)' }}>?...</span> : ''}
                    </td></Tooltip>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-medium"
                        style={{
                          color: log.status_code < 300 ? 'hsl(142, 60%, 50%)' :
                            log.status_code < 400 ? 'hsl(210, 60%, 55%)' :
                            log.status_code < 500 ? 'hsl(30, 60%, 55%)' : 'hsl(0, 60%, 55%)',
                        }}>{log.status_code}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>{log.response_time}ms</td>
                    <Tooltip content={log.browser}><td className="px-4 py-3 whitespace-nowrap text-sm max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }} data-tooltip={log.browser}>{log.browser || '-'}</td></Tooltip>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip content="删除"><button onClick={() => handleDelete(log.id)}
                        className="btn-glass p-1.5 rounded transition-colors" data-tooltip="删除" aria-label="删除">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button></Tooltip>
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
