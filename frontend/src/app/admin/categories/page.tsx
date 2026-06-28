'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminCategories() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function load() {
    setLoading(true);
    try { const res = await api.getCategories(); setItems(res.items); }
    catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    try {
      const data: any = { name };
      if (description) data.description = description;
      if (editing) await api.admin.categories.update(editing.id, data);
      else await api.admin.categories.create(data);
      setEditing(null); setName(''); setDescription('');
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此分类？')) return;
    try {
      await api.admin.categories.delete(id);
      load();
    } catch (e) { /* empty */ }
  }

  function startEdit(item: any) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description || '');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>分类</h1>
      </div>

      {/* Add form */}
      <div className="glass-card rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{editing ? '编辑分类' : '添加分类'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input type="text" placeholder="名称" value={name} onChange={e => setName(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
          <input type="text" placeholder="描述（可选）" value={description} onChange={e => setDescription(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer" style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />
            {editing ? '更新' : '添加'}
          </button>
          {editing && <button onClick={() => { setEditing(null); setName(''); setDescription(''); }}
            className="btn-glass px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>取消</button>}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <FolderTree className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
            <p>暂无分类</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>描述</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{item.slug}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-info)' }}>{item.description || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(item)}
                        className="btn-glass p-1.5 rounded transition-colors" title="编辑">
                        <Pencil className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="btn-glass p-1.5 rounded transition-colors" title="删除">
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
    </div>
  );
}
