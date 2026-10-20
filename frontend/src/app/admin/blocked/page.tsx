'use client';
import { localDateTimeTimestamp } from '@/lib/date-value';

import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog } from '@/components/ui/Dialog';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import type { IpBanItem } from '@/lib/admin-types';
import { useLatestRequest, useFeedbackMutation } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { Trash2, Plus, ShieldOff, Globe, Settings } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

const MODULES = [
  { id: 'post', label: '文章' },
  { id: 'comment', label: '评论' },
  { id: 'category', label: '分类' },
  { id: 'tag', label: '标签' },
  { id: 'series', label: '系列' },
  { id: 'link', label: '友链' },
  { id: 'gallery', label: '相册' },
  { id: 'music', label: '音乐' },
  { id: 'search', label: '搜索' },
  { id: 'login', label: '登录' },
  { id: 'site', label: '全站' },
];

function scopeDisplay(scope: string) {
  return scope.split(',').map(s => {
    const m = MODULES.find(m => m.id === s.trim());
    return m ? m.label : s.trim();
  }).join('、');
}

export default function AdminBlocked() {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<'ip' | 'auto'>('ip');

  // IP ban list
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ip_address: '', reason: '', scopes: [] as string[], expires_at: '' });
  const [formError, setFormError] = useState('');

  // Auto-ban config
  const [autoConfig, setAutoConfig] = useState<Record<string, string>>({});
  const [autoScope, setAutoScope] = useState<string[]>([]);

  const { data, loading, error: loadError, reload: load } = useLatestRequest(
    useCallback(() => api.admin.ipBans.list({ page: String(page), page_size: String(pageSize) }), [page, pageSize]),
    '加载失败，请重试',
  );
  const items: IpBanItem[] = data?.items || [];
  const total = data?.total || 0;
  const mutation = useFeedbackMutation();

  function openCreate() {
    mutation.clearError();
    setForm({ ip_address: '', reason: '', scopes: [], expires_at: '' });
    setFormError('');
    setShowForm(true);
  }

  async function handleCreate() {
    await mutation.run(async () => {
      setFormError('');
      if (!form.ip_address) {
        setFormError('请填写IP地址');
        return;
      }
      if (form.scopes.length === 0) {
        setFormError('请选择至少一个封禁范围');
        return;
      }
      await api.admin.ipBans.create({
        ip_address: form.ip_address,
        scope: form.scopes.join(','),
        reason: form.reason || undefined,
        expires_at: form.expires_at ? localDateTimeTimestamp(form.expires_at, '过期时间') : undefined,
      });
      setShowForm(false);
      if (page === 1) await load();
      else setPage(1);
    });
  }

  async function handleDelete(id: string) {
    await mutation.run(async () => {
      if (!await confirm('确定解封？')) return;
      await api.admin.ipBans.remove(id);
      await load();
    });
  }

  function toggleScope(scopeId: string) {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scopeId)
        ? f.scopes.filter(s => s !== scopeId)
        : [...f.scopes, scopeId],
    }));
  }

  const configRequest = useLatestRequest(
    useCallback(() => api.admin.ipBans.getConfig(), []), '自动封禁配置加载失败，请重试',
  );
  const [configNotice, setConfigNotice] = useState('');
  useEffect(() => {
    if (!configRequest.data) return;
    setAutoConfig(configRequest.data);
    setAutoScope((configRequest.data.ip_ban_auto_scope || 'login').split(',').filter(Boolean));
  }, [configRequest.data]);

  async function saveConfig() {
    if (!configRequest.data || configRequest.loading || configRequest.error) return;
    setConfigNotice('');
    await mutation.run(async () => {
      await api.admin.ipBans.updateConfig({ ...autoConfig, ip_ban_auto_scope: autoScope.join(',') });
      setConfigNotice('配置已保存');
    }, '配置保存失败，请重试');
  }

  function toggleAutoScope(scopeId: string) {
    setAutoScope(s => s.includes(scopeId) ? s.filter(x => x !== scopeId) : [...s, scopeId]);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <RequestFeedback error={loadError} onRetry={load} pending={loading} />
      {!showForm && <RequestFeedback error={mutation.error} />}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>封禁管理</h1>
        {tab === 'ip' && (
          <button disabled={mutation.pending} onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />新增封禁
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex mb-6" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        {[
          { key: 'ip', label: 'IP 封禁', icon: Globe },
          { key: 'auto', label: '自动封禁', icon: Settings },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'ip' | 'auto')}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative cursor-pointer"
              style={{ color: active ? 'var(--primary)' : 'var(--text-secondary)' }}>
              <Icon className="w-4 h-4" />
              {t.label}
              {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
            </button>
          );
        })}
      </div>

      {/* IP Ban Tab */}
      {tab === 'ip' && (
        <>
          {loading ? <Loading /> : loadError && items.length === 0 ? null : items.length === 0 ? (
            <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
              <ShieldOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无封禁记录</p>
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>IP 地址</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-info)' }}>封禁范围</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-info)' }}>原因</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-info)' }}>过期时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-info)' }}>类型</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const expired = item.expires_at && new Date(item.expires_at) < new Date();
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)', opacity: expired ? 0.5 : 1 }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {item.ip_address || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                          <div className="flex flex-wrap gap-1">
                            {item.scope && scopeDisplay(item.scope).split('、').map((s: string, i: number) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                          {item.reason || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs hidden lg:table-cell" style={{ color: expired ? 'var(--color-error)' : 'var(--text-info)' }}>
                          {item.expires_at ? new Date(item.expires_at).toLocaleString('zh-CN') : '永不过期'}
                        </td>
                        <td className="px-4 py-3 text-xs hidden lg:table-cell">
                          {item.auto_ban && (
                            <span className="px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--color-warning-sub, #fbbf24)', color: 'var(--color-warning, #d97706)' }}>
                              自动
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!expired && (
                            <Tooltip content="解封"><button disabled={mutation.pending} onClick={() => handleDelete(item.id)}
                              className="btn-glass p-1.5 rounded-lg transition-colors cursor-pointer" data-tooltip="解封" aria-label="解封">
                              <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                            </button></Tooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="flex items-center justify-between text-sm mt-4">
              <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>每页</span>
                  <Select aria-label="每页条数" value={String(pageSize)} onChange={v => { setPageSize(Number(v)); setPage(1); }}
                    options={[10, 20, 30, 50, 100].map(v => ({ value: String(v), label: String(v) }))} />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
                    style={{ color: 'var(--text-primary)' }}>上一页</button>
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                    const start = Math.max(1, page - 5);
                    const p = start + i;
                    if (p > totalPages) return null;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className="w-8 h-8 rounded-xl text-sm transition-all"
                        style={{
                          background: p === page ? 'var(--primary)' : 'transparent',
                          color: p === page ? '#fff' : 'var(--text-primary)',
                          boxShadow: p === page ? '0 0 12px var(--primary-glow)' : 'none',
                        }}>{p}</button>
                    );
                  })}
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
                    style={{ color: 'var(--text-primary)' }}>下一页</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Auto-ban Config Tab */}
      {tab === 'auto' && (
        <div className="glass-card rounded-xl p-5" style={{ border: '1px solid var(--glass-border)' }}>
          <RequestFeedback error={configRequest.error} onRetry={configRequest.reload} pending={configRequest.loading} />
          {configNotice && <p role="status" className="mb-3 text-sm">{configNotice}</p>}
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>自动封禁配置</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>启用自动封禁</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox disabled={mutation.pending || configRequest.loading || !!configRequest.error} checked={autoConfig.ip_ban_auto_enabled === 'true'}
                  onChange={checked => setAutoConfig(c => ({ ...c, ip_ban_auto_enabled: checked ? 'true' : 'false' }))}
                  className="rounded" />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>已启用</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>失败阈值（次）</label>
              <Input type="number" disabled={mutation.pending || configRequest.loading || !!configRequest.error} aria-label="失败阈值（次）" value={autoConfig.ip_ban_auto_threshold || '10'}
                onChange={e => setAutoConfig(c => ({ ...c, ip_ban_auto_threshold: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>计数窗口（秒）</label>
              <Input type="number" disabled={mutation.pending || configRequest.loading || !!configRequest.error} aria-label="计数窗口（秒）" value={autoConfig.ip_ban_auto_window || '300'}
                onChange={e => setAutoConfig(c => ({ ...c, ip_ban_auto_window: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>封禁时长（秒）</label>
              <Input type="number" disabled={mutation.pending || configRequest.loading || !!configRequest.error} aria-label="封禁时长（秒）" value={autoConfig.ip_ban_auto_duration || '1800'}
                onChange={e => setAutoConfig(c => ({ ...c, ip_ban_auto_duration: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>自动封禁范围</label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)' }}>
                {MODULES.map(m => (
                  <label key={m.id} className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}>
                    <Checkbox disabled={mutation.pending || configRequest.loading || !!configRequest.error} checked={autoScope.includes(m.id)}
                      onChange={() => toggleAutoScope(m.id)}
                      className="rounded" />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button disabled={mutation.pending || configRequest.loading || !!configRequest.error || !configRequest.data} onClick={saveConfig}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
              style={{ background: 'var(--primary)' }}>
              保存配置
            </button>
          </div>
        </div>
      )}

      {/* Create Ban Modal */}
      {showForm && (
        <Dialog title="新增封禁" onClose={() => { if (!mutation.pending) setShowForm(false); }} layer={200}
          className="admin-dialog-panel w-full max-w-lg rounded-xl shadow-2xl p-6"
          style={{ border: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>新增封禁</h2>
          <RequestFeedback error={mutation.error} />
          {formError && (
            <div role="alert" className="mb-4 px-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--card-bg)', color: 'hsl(0, 60%, 55%)', border: '1px solid hsla(0, 60%, 55%, 0.2)' }}>
              {formError}
            </div>
          )}
          <fieldset disabled={mutation.pending} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>IP 地址</label>
              <Input type="text" aria-label="IP 地址" value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
                placeholder="输入IP地址"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>封禁范围 *（选择要禁用的模块）</label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)' }}>
                {MODULES.map(m => (
                  <label key={m.id} className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}>
                    <Checkbox checked={form.scopes.includes(m.id)}
                      onChange={() => toggleScope(m.id)}
                      className="rounded" />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>原因</label>
              <Input type="text" aria-label="封禁原因" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="封禁原因（选填）"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>过期时间</label>
              <DateTimePicker aria-label="过期时间" value={form.expires_at} onChange={value => setForm(f => ({ ...f, expires_at: value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>留空表示永不过期</p>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 mt-5">
            <button disabled={mutation.pending} onClick={() => setShowForm(false)}
              className="btn-glass px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>取消</button>
            <button disabled={mutation.pending} onClick={handleCreate}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
              style={{ background: 'var(--color-error)' }}>
              封禁
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
