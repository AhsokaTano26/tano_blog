'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Ban, Trash2, Plus, ShieldOff, Globe } from 'lucide-react';
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
  const [tab, setTab] = useState<'comment' | 'ip' | 'auto'>('comment');

  // CommenterBlock state
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', ip_address: '', reason: '' });

  // IP ban state
  const [ipItems, setIpItems] = useState<any[]>([]);
  const [ipLoading, setIpLoading] = useState(false);
  const [ipPage, setIpPage] = useState(1);
  const [ipTotal, setIpTotal] = useState(0);
  const [showIpForm, setShowIpForm] = useState(false);
  const [ipForm, setIpForm] = useState({ ip_address: '', reason: '', scopes: [] as string[], expires_at: '' });

  // Auto-ban config state
  const [config, setConfig] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);

  async function loadCommenters() {
    setLoading(true);
    try {
      const res = await api.admin.commenters.list({ page: String(page), page_size: String(pageSize) });
      setItems(res.items || []);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  async function loadIpBans() {
    setIpLoading(true);
    try {
      const res = await api.admin.ipBans.list({ page: String(ipPage), page_size: '20' });
      setIpItems(res.items || []);
      setIpTotal(res.total);
    } catch (e) { /* empty */ }
    setIpLoading(false);
  }

  async function loadConfig() {
    setConfigLoading(true);
    try {
      const res = await api.admin.ipBans.getConfig();
      setConfig(res);
    } catch (e) { /* empty */ }
    setConfigLoading(false);
  }

  useEffect(() => { loadCommenters(); }, [page, pageSize]);
  useEffect(() => { if (tab === 'ip') loadIpBans(); }, [tab, ipPage]);
  useEffect(() => { if (tab === 'auto') loadConfig(); }, [tab]);

  // CommenterBlock handlers
  function openCreate() {
    setForm({ email: '', ip_address: '', reason: '' });
    setShowForm(true);
  }

  async function handleCreate() {
    if (!form.email && !form.ip_address) {
      alert('请填写邮箱或IP地址');
      return;
    }
    try {
      await api.admin.commenters.block({ email: form.email || undefined, ip_address: form.ip_address || undefined, reason: form.reason });
      setShowForm(false);
      setPage(1);
      loadCommenters();
    } catch (e) { /* empty */ }
  }

  async function handleUnblock(id: string) {
    if (!await confirm('确定解封？')) return;
    try {
      await api.admin.commenters.unblock(id);
      loadCommenters();
    } catch (e) { /* empty */ }
  }

  // IP ban handlers
  async function handleCreateIpBan() {
    if (!ipForm.ip_address) {
      alert('请输入IP地址');
      return;
    }
    if (ipForm.scopes.length === 0) {
      alert('请选择至少一个封禁范围');
      return;
    }
    try {
      await api.admin.ipBans.create({
        ip_address: ipForm.ip_address,
        scope: ipForm.scopes.join(','),
        reason: ipForm.reason || undefined,
        expires_at: ipForm.expires_at || undefined,
      });
      setShowIpForm(false);
      setIpPage(1);
      loadIpBans();
    } catch (e) { /* empty */ }
  }

  async function handleDeleteIpBan(id: string) {
    if (!await confirm('确定解封该IP？')) return;
    try {
      await api.admin.ipBans.remove(id);
      loadIpBans();
    } catch (e) { /* empty */ }
  }

  function toggleScope(scopeId: string) {
    setIpForm(f => ({
      ...f,
      scopes: f.scopes.includes(scopeId)
        ? f.scopes.filter(s => s !== scopeId)
        : [...f.scopes, scopeId],
    }));
  }

  // Auto-ban config handlers
  function updateConfigValue(key: string, value: string) {
    setConfig(c => ({ ...c, [key]: value }));
  }

  async function handleSaveConfig() {
    try {
      await api.admin.ipBans.updateConfig(config);
      alert('配置已保存');
    } catch (e) { /* empty */ }
  }

  const totalPages = Math.ceil(total / pageSize);
  const ipTotalPages = Math.ceil(ipTotal / 20);

  const tabDefs = [
    { key: 'comment' as const, label: '评论封禁' },
    { key: 'ip' as const, label: 'IP 封禁' },
    { key: 'auto' as const, label: '自动封禁配置' },
  ];

  function renderCommenterBlock() {
    return (
      <>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>评论封禁</h2>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />新增封禁
          </button>
        </div>

        {loading ? <Loading /> : items.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <ShieldOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无封禁记录</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>邮箱 / IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-info)' }}>原因</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-info)' }}>时间</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Ban className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {item.email || item.ip_address || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>
                      {item.reason || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell" style={{ color: 'var(--text-info)' }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleUnblock(item.id)}
                        className="btn-glass p-1.5 rounded-lg transition-colors cursor-pointer" title="解封">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm mt-4">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-info)' }}>每页</span>
              <Select value={String(pageSize)} onChange={v => { setPageSize(Number(v)); setPage(1); }}
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

        {/* Create CommenterBlock Modal */}
        {showForm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
            <div className="w-full max-w-md rounded-2xl shadow-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>新增封禁</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>邮箱</label>
                  <input type="text" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="输入邮箱（选填，与IP至少填一个）"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>IP 地址</label>
                  <input type="text" value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
                    placeholder="输入IP地址（选填，与邮箱至少填一个）"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>原因</label>
                  <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="封禁原因（选填）"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowForm(false)}
                  className="btn-glass px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={handleCreate}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                  style={{ background: 'var(--color-error)' }}>
                  封禁
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderIpBan() {
    return (
      <>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>IP 封禁</h2>
          <button onClick={() => { setIpForm({ ip_address: '', reason: '', scopes: [], expires_at: '' }); setShowIpForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />新增IP封禁
          </button>
        </div>

        {ipLoading ? <Loading /> : ipItems.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <ShieldOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无IP封禁记录</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>IP 地址</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-info)' }}>封禁范围</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-info)' }}>原因</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--text-info)' }}>过期时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-info)' }}>类型</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {ipItems.map((item: any) => {
                  const expired = item.expires_at && new Date(item.expires_at) < new Date();
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)', opacity: expired ? 0.5 : 1 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {item.ip_address}
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
                      <td className="px-4 py-3 text-xs hidden md:table-cell">
                        <span className="px-1.5 py-0.5 rounded"
                          style={{
                            background: item.auto_ban ? 'var(--color-warning-sub, #fbbf24)' : 'var(--primary-sub)',
                            color: item.auto_ban ? 'var(--color-warning, #d97706)' : 'var(--primary)',
                          }}>
                          {item.auto_ban ? '自动' : '手动'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!expired && (
                          <button onClick={() => handleDeleteIpBan(item.id)}
                            className="btn-glass p-1.5 rounded-lg transition-colors cursor-pointer" title="解封">
                            <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm mt-4">
          <span style={{ color: 'var(--text-secondary)' }}>共 {ipTotal} 条</span>
          <div className="flex gap-1">
            <button onClick={() => setIpPage(Math.max(1, ipPage - 1))} disabled={ipPage === 1}
              className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
              style={{ color: 'var(--text-primary)' }}>上一页</button>
            {Array.from({ length: Math.min(ipTotalPages, 10) }, (_, i) => {
              const start = Math.max(1, ipPage - 5);
              const p = start + i;
              if (p > ipTotalPages) return null;
              return (
                <button key={p} onClick={() => setIpPage(p)}
                  className="w-8 h-8 rounded-xl text-sm transition-all"
                  style={{
                    background: p === ipPage ? 'var(--primary)' : 'transparent',
                    color: p === ipPage ? '#fff' : 'var(--text-primary)',
                    boxShadow: p === ipPage ? '0 0 12px var(--primary-glow)' : 'none',
                  }}>{p}</button>
              );
            })}
            <button onClick={() => setIpPage(Math.min(ipTotalPages, ipPage + 1))} disabled={ipPage === ipTotalPages}
              className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
              style={{ color: 'var(--text-primary)' }}>下一页</button>
          </div>
        </div>

        {/* Create IP Ban Modal */}
        {showIpForm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowIpForm(false); }}>
            <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>新增 IP 封禁</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>IP 地址 *</label>
                  <input type="text" value={ipForm.ip_address} onChange={e => setIpForm(f => ({ ...f, ip_address: e.target.value }))}
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
                        <input type="checkbox" checked={ipForm.scopes.includes(m.id)}
                          onChange={() => toggleScope(m.id)}
                          className="rounded" />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>原因</label>
                  <input type="text" value={ipForm.reason} onChange={e => setIpForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="封禁原因（选填）"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>过期时间</label>
                  <input type="datetime-local" value={ipForm.expires_at} onChange={e => setIpForm(f => ({ ...f, expires_at: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>留空表示永不过期</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowIpForm(false)}
                  className="btn-glass px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={handleCreateIpBan}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                  style={{ background: 'var(--color-error)' }}>
                  封禁
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderAutoConfig() {
    if (configLoading) return <Loading />;

    const configFields = [
      { key: 'ip_ban_auto_enabled', label: '启用自动封禁', type: 'toggle' },
      { key: 'ip_ban_auto_threshold', label: '失败次数阈值', type: 'number', desc: '连续登录失败次数超过此值后自动封禁' },
      { key: 'ip_ban_auto_window', label: '计数窗口（秒）', type: 'number', desc: '在此时间窗口内统计失败次数' },
      { key: 'ip_ban_auto_duration', label: '封禁时长（秒）', type: 'number', desc: '自动封禁的持续时长，0 表示永久' },
    ];

    const autoScope = (config['ip_ban_auto_scope'] || 'login').split(',').filter(Boolean);

    return (
      <>
        <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--text-primary)' }}>自动封禁配置</h2>
        <div className="glass-card rounded-2xl p-6 max-w-xl space-y-5">
          {configFields.map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {field.label}
              </label>
              {field.type === 'toggle' ? (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config[field.key] === 'true'}
                    onChange={e => updateConfigValue(field.key, e.target.checked ? 'true' : 'false')}
                    className="w-5 h-5 rounded cursor-pointer" />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {config[field.key] === 'true' ? '已启用' : '已禁用'}
                  </span>
                </label>
              ) : (
                <input type="number" value={config[field.key] || ''}
                  onChange={e => updateConfigValue(field.key, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              )}
              {field.desc && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>{field.desc}</p>
              )}
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              自动封禁范围
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)' }}>
              {MODULES.map(m => (
                <label key={m.id} className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={autoScope.includes(m.id)}
                    onChange={() => {
                      const newScope = autoScope.includes(m.id)
                        ? autoScope.filter(s => s !== m.id)
                        : [...autoScope, m.id];
                      updateConfigValue('ip_ban_auto_scope', newScope.join(','));
                    }}
                    className="rounded" />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <button onClick={handleSaveConfig}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}>
            保存配置
          </button>
        </div>
      </>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>封禁管理</h1>

      {/* Tab navigation */}
      <div className="flex gap-4 mb-6 border-b" style={{ borderColor: 'var(--glass-border)' }}>
        {tabDefs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="pb-2 px-1 text-sm font-medium transition-colors cursor-pointer"
            style={{
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'comment' && renderCommenterBlock()}
      {tab === 'ip' && renderIpBan()}
      {tab === 'auto' && renderAutoConfig()}
    </div>
  );
}
