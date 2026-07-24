'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';

export default function AdminCategories() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.categories.list({ page: String(page), page_size: String(pageSize) });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, pageSize]);

  async function handleSave() {
    try {
      const data: any = { name, sort_order: sortOrder };
      if (description) data.description = description;
      if (editing) await api.admin.categories.update(editing.id, data);
      else await api.admin.categories.create(data);
      setEditing(null); setName(''); setDescription(''); setSortOrder(0);
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此分类？')) return;
    try {
      await api.admin.categories.delete(id);
      load();
    } catch (e) { /* empty */ }
  }

  function startEdit(item: any) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description || '');
    setSortOrder(item.sort_order || 0);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>分类</h1>
      </div>

      {/* Add form */}
      <div className="glass-card rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{editing ? '编辑分类' : '添加分类'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input type="text" placeholder="名称" value={name} onChange={e => setName(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
          <input type="text" placeholder="描述（可选）" value={description} onChange={e => setDescription(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm outline-none" style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
          <input type="number" placeholder="排序（数字越小越靠前）" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>排序</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Slug</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>文章数</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>描述</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-info)' }}>{item.sort_order ?? 0}</td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{item.slug}</td>
                  <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-primary)' }}>{item.post_count ?? 0}</td>
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

      <div className="flex items-center justify-between text-sm mt-4">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 个</span>
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
              <button onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))} disabled={page === Math.ceil(total / pageSize)}
                className="px-3 py-1.5 rounded-xl btn-glass disabled:opacity-40 transition-colors"
                style={{ color: 'var(--text-primary)' }}>下一页</button>
            </div>
          </div>
        </div>
    </div>
  );
}
