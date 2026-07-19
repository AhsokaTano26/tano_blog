'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Ban, Trash2, Plus, ShieldOff } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

export default function AdminBlocked() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', ip_address: '', reason: '' });

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.commenters.list({ page: String(page), page_size: String(pageSize) });
      setItems(res.items || []);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, pageSize]);

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
      load();
    } catch (e) { /* empty */ }
  }

  async function handleUnblock(id: string) {
    if (!await confirm('确定解封？')) return;
    try {
      await api.admin.commenters.unblock(id);
      load();
    } catch (e) { /* empty */ }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>封禁管理</h1>
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

      {/* Create Block Modal */}
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
    </div>
  );
}
