'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { NavLinkItem } from '@/lib/admin-types';
import { useLatestRequest, useFeedbackMutation } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { Plus, Pencil, Trash2, GripVertical, ExternalLink } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm } from '@/components/ConfirmDialog';

export default function AdminNavLinks() {
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState<NavLinkItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', sort_order: '0' });
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const { data, setData, loading, error: loadError, reload: load } = useLatestRequest(
    useCallback(() => api.admin.navLinks.list(), []), '导航加载失败，请重试',
  );
  const items: NavLinkItem[] = data?.items || [];
  const mutation = useFeedbackMutation();

  function openCreate() {
    mutation.clearError();
    setEditing(null);
    setForm({ title: '', url: '', sort_order: String(items.length) });
    setShowModal(true);
  }

  function openEdit(item: NavLinkItem) {
    mutation.clearError();
    setEditing(item);
    setForm({ title: item.title, url: item.url, sort_order: String(item.sort_order) });
    setShowModal(true);
  }

  async function handleSave() {
    await mutation.run(async () => {
      const payload = { title: form.title, url: form.url, sort_order: parseInt(form.sort_order) || 0 };
      if (editing) await api.admin.navLinks.update(editing.id, payload);
      else await api.admin.navLinks.create(payload);
      setShowModal(false);
      await load();
    }, '导航保存失败，请重试');
  }

  async function handleDelete(id: string) {
    await mutation.run(async () => {
      if (!await confirm('确定删除此导航项？')) return;
      await api.admin.navLinks.delete(id);
      await load();
    }, '导航删除失败，请重试');
  }

  async function handleDragEnd() {
    const from = dragItem.current;
    const to = dragOverItem.current;
    dragItem.current = null;
    dragOverItem.current = null;
    if (from === null || to === null || from === to) return;
    await mutation.run(async () => {
      const previous = [...items];
      const reordered = [...items];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      setData({ items: reordered });
      try {
        await api.admin.navLinks.reorder(reordered.map(item => item.id));
        await load();
      } catch (error) {
        setData({ items: previous });
        await load();
        throw error;
      }
    }, '排序保存失败，请检查当前顺序后重试');
  }

  return (
    <div>
      <RequestFeedback error={loadError} onRetry={load} pending={loading || mutation.pending} />
      {!showModal && <RequestFeedback error={mutation.error} />}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>导航管理</h1>
        <button disabled={mutation.pending} onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
          style={{ background: 'var(--primary)' }}>
          <Plus className="w-4 h-4" />添加导航
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <Loading />
        ) : loadError && items.length === 0 ? null : items.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <p>暂无导航项，点击上方按钮添加</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-8" style={{ color: 'var(--text-secondary)' }}></th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>标题</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>链接</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-20" style={{ color: 'var(--text-secondary)' }}>排序</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}
                  draggable={!mutation.pending && !loading}
                  onDragStart={() => { if (!mutation.pending) dragItem.current = index; }}
                  onDragEnter={() => { dragOverItem.current = index; }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="transition-colors cursor-default"
                  style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3">
                    <GripVertical className="w-4 h-4 cursor-grab" style={{ color: 'var(--text-info)' }} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm flex items-center gap-1 hover:underline"
                      style={{ color: 'var(--primary)' }}>
                      {item.url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-info)' }}>{item.sort_order}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
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

      {showModal && (
        <Dialog title={editing ? '编辑导航' : '添加导航'} onClose={() => { if (!mutation.pending) setShowModal(false); }} layer={200}
          className="admin-dialog-panel w-full max-w-md rounded-2xl shadow-2xl p-6"
          style={{ border: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editing ? '编辑导航' : '添加导航'}
          </h2>
          <RequestFeedback error={mutation.error} />
          <fieldset disabled={mutation.pending} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>标题 *</label>
              <Input type="text" aria-label="标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="首页" maxLength={100}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>链接 *</label>
              <Input type="text" aria-label="链接" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="/ 或 https://..." maxLength={500}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>排序</label>
              <Input type="number" aria-label="排序" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
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
