'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, GripVertical, ExternalLink } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm } from '@/components/ConfirmDialog';

export default function AdminNavLinks() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', sort_order: 0 });
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.navLinks.list();
      setItems(res.items);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ title: '', url: '', sort_order: items.length });
    setShowModal(true);
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({ title: item.title, url: item.url, sort_order: item.sort_order });
    setShowModal(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await api.admin.navLinks.update(editing.id, form);
      } else {
        await api.admin.navLinks.create(form);
      }
      setShowModal(false);
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此导航项？')) return;
    try {
      await api.admin.navLinks.delete(id);
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;

    const newItems = [...items];
    const [moved] = newItems.splice(dragItem.current, 1);
    newItems.splice(dragOverItem.current, 0, moved);
    setItems(newItems);

    try {
      await api.admin.navLinks.reorder(newItems.map(i => i.id));
    } catch (e) { /* empty */ }

    dragItem.current = null;
    dragOverItem.current = null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>导航管理</h1>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
          style={{ background: 'var(--primary)' }}>
          <Plus className="w-4 h-4" />添加导航
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
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
                  draggable
                  onDragStart={() => { dragItem.current = index; }}
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
                      <button onClick={() => openEdit(item)}
                        className="btn-glass p-1.5 rounded transition-colors cursor-pointer" title="编辑">
                        <Pencil className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="btn-glass p-1.5 rounded transition-colors cursor-pointer" title="删除">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {editing ? '编辑导航' : '添加导航'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>标题 *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="首页" maxLength={100}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>链接 *</label>
                <input type="text" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="/ 或 https://..." maxLength={500}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>排序</label>
                <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)}
                className="btn-glass px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>取消</button>
              <button onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                style={{ background: 'var(--primary)' }}>
                {editing ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
