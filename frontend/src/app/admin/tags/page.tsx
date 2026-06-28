'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminTags() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<any>(null);

  async function load() {
    setLoading(true);
    try { const res = await api.getTags(); setItems(res.items); }
    catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    try {
      if (editing) await api.admin.tags.update(editing.id, { name });
      else await api.admin.tags.create({ name });
      setEditing(null); setName('');
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此标签？')) return;
    try {
      await api.admin.tags.delete(id);
      load();
    } catch (e) { /* empty */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>标签</h1>
      </div>

      {/* Add form */}
      <div className="glass-card rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{editing ? '编辑标签' : '添加标签'}</h2>
        <div className="flex gap-3 mb-3">
          <input type="text" placeholder="名称" value={name} onChange={e => setName(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer" style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />
            {editing ? '更新' : '添加'}
          </button>
          {editing && <button onClick={() => { setEditing(null); setName(''); }}
            className="btn-glass px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>取消</button>}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            <Tags className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
            <p>暂无标签</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Slug</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{item.slug}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(item); setName(item.name); }}
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
