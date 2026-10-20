'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { FriendLinkItem } from '@/lib/admin-types';
import { useLatestRequest, useFeedbackMutation } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { Plus, Pencil, Trash2, Check, X, Link as LinkIcon } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

const tabs = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
];

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    approved: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  };
  const labels: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
  };
  const s = styles[status] || styles.pending;
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      {labels[status] || status}
    </span>
  );
}

export default function AdminLinks() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState('');

  // Edit modal state
  const [editing, setEditing] = useState<FriendLinkItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', description: '', avatar: '', email: '', status: 'pending', sort_order: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, loading, error: loadError, reload: load } = useLatestRequest(
    useCallback(() => api.admin.links.list({ page: String(page), page_size: String(pageSize), ...(activeTab ? { status: activeTab } : {}) }), [page, pageSize, activeTab]),
    '加载失败，请重试',
  );
  const items: FriendLinkItem[] = data?.items || [];
  const total = data?.total || 0;
  const mutation = useFeedbackMutation();

  function openCreate() {
    mutation.clearError();
    setEditing(null);
    setForm({ name: '', url: '', description: '', avatar: '', email: '', status: 'pending', sort_order: 0 });
    setShowModal(true);
  }

  function openEdit(item: FriendLinkItem) {
    mutation.clearError();
    setEditing(item);
    setForm({
      name: item.name || '',
      url: item.url || '',
      description: item.description || '',
      avatar: item.avatar || '',
      email: item.email || '',
      status: item.status || 'pending',
      sort_order: item.sort_order || 0,
    });
    setShowModal(true);
  }

  async function handleSave() {
    await mutation.run(async () => {
      const data = { ...form };
      if (editing) {
        await api.admin.links.update(editing.id, data);
      } else {
        await api.admin.links.create(data);
      }
      setShowModal(false);
      await load();
    });
  }

  async function handleUpdateStatus(id: string, status: string) {
    await mutation.run(async () => {
      await api.admin.links.updateStatus(id, status);
      await load();
    });
  }

  async function handleDelete(id: string) {
    await mutation.run(async () => {
      if (!await confirm('确定删除此友链？')) return;
      await api.admin.links.delete(id);
      await load();
    });
  }

  const filtered = items;

  return (
    <div>
      <RequestFeedback error={loadError} onRetry={load} pending={loading} />
      {!showModal && <RequestFeedback error={mutation.error} />}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>友链管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/admin/links/export`, '_blank')}
            className="btn-glass px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ color: 'var(--primary)' }}>
            导出 CSV
          </button>
          <button disabled={mutation.pending} onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
            style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />添加友链
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeTab === tab.key ? 'text-white' : ''}`}
            style={{
              background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
              color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
            }}>
            {tab.label}
            {!activeTab && tab.key && <span className="ml-1.5 opacity-70">(0)</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <LinkIcon className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
            <p>暂无友链</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>网站地址</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider hidden sm:table-cell" style={{ color: 'var(--text-secondary)' }}>时间</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--primary-sub)' }}>
                        {item.avatar ? (
                          <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: 'var(--primary)' }}>
                            {item.name?.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm hidden md:table-cell" style={{ color: 'var(--text-info)' }}>
                    <span className="max-w-[200px] truncate block">{item.url}</span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(item.status)}</td>
                  <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: 'var(--text-info)' }}>
                    {item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.status === 'pending' && (
                        <>
                          <Tooltip content="通过"><button disabled={mutation.pending} onClick={() => handleUpdateStatus(item.id, 'approved')}
                            className="btn-glass p-1.5 rounded transition-colors cursor-pointer" data-tooltip="通过" aria-label="通过">
                            <Check className="w-4 h-4" style={{ color: '#22c55e' }} />
                          </button></Tooltip>
                          <Tooltip content="拒绝"><button disabled={mutation.pending} onClick={() => handleUpdateStatus(item.id, 'rejected')}
                            className="btn-glass p-1.5 rounded transition-colors cursor-pointer" data-tooltip="拒绝" aria-label="拒绝">
                            <X className="w-4 h-4" style={{ color: '#ef4444' }} />
                          </button></Tooltip>
                        </>
                      )}
                      <Tooltip content="编辑"><button disabled={mutation.pending} onClick={() => openEdit(item)}
                        className="btn-glass p-1.5 rounded transition-colors cursor-pointer" data-tooltip="编辑" aria-label="编辑">
                        <Pencil className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button></Tooltip>
                      <Tooltip content="删除"><button disabled={mutation.pending} onClick={() => handleDelete(item.id)}
                        className="btn-glass p-1.5 rounded transition-colors cursor-pointer" data-tooltip="删除" aria-label="删除">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button></Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm mt-4">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 个</span>
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
              {Array.from({ length: Math.min(Math.ceil(total / pageSize), 10) }, (_, i) => {
                const start = Math.max(1, page - 5);
                const p = start + i;
                if (p > Math.ceil(total / pageSize)) return null;
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
              <button onClick={() => setPage(Math.min(Math.max(1, Math.ceil(total / pageSize)), page + 1))} disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
                style={{ color: 'var(--text-primary)' }}>下一页</button>
            </div>
          </div>
        </div>

      {/* Edit/Create Modal */}
      {showModal && (
        <Dialog title={editing ? '编辑友链' : '添加友链'} onClose={() => { if (!mutation.pending) setShowModal(false); }} layer={200}
          className="admin-dialog-panel w-full max-w-lg rounded-2xl shadow-2xl p-6"
          style={{ border: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editing ? '编辑友链' : '添加友链'}
          </h2>
          <RequestFeedback error={mutation.error} />
          <fieldset disabled={mutation.pending} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>名称 *</label>
                <Input aria-label="名称" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>URL *</label>
                <Input aria-label="网址" type="text" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>头像</label>
                <Input aria-label="头像" type="text" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>邮箱</label>
                <Input aria-label="邮箱" type="text" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>描述</label>
              <Input aria-label="描述" type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>排序</label>
                <Input aria-label="排序" type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>状态</label>
                <Select aria-label="状态" value={form.status} onChange={value => setForm(f => ({ ...f, status: value }))}
                  options={[{ value: 'pending', label: '待审核' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已拒绝' }]}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 mt-5">
            <button disabled={mutation.pending} onClick={() => setShowModal(false)}
              className="btn-glass px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>取消</button>
            <button disabled={mutation.pending} onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
              style={{ background: 'var(--primary)' }}>
              {editing ? '保存' : '添加'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
