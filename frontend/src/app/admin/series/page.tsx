'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, Bookmark } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Checkbox, Select } from '@/components/ConfirmDialog';
import { MediaField } from '@/components/MediaField';

export default function AdminSeries() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPosts, setShowPosts] = useState<any>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', cover_image: '', sort_order: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const res = await api.admin.series.list({ page: String(page), page_size: String(pageSize) });
      setItems(res.items || []);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, pageSize]);

  function openCreate() {
    setEditItem(null);
    setForm({ name: '', slug: '', description: '', cover_image: '', sort_order: 0 });
    setShowForm(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      name: item.name || '',
      slug: item.slug || '',
      description: item.description || '',
      cover_image: item.cover_image || '',
      sort_order: item.sort_order || 0,
    });
    setShowForm(true);
  }

  async function handleSave() {
    try {
      if (editItem) {
        await api.admin.series.update(editItem.id, form);
      } else {
        await api.admin.series.create(form);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此系列？')) return;
    try {
      await api.admin.series.delete(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>文章系列</h1>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
          <Plus className="w-4 h-4" />
          新建系列
        </button>
      </div>

      {loading ? <Loading /> : items.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无系列</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>排序</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>封面</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>描述</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>文章数</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-info)' }}>{item.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    {item.cover_image ? (
                      <img src={item.cover_image} alt=""
                        className="w-9 h-9 rounded-lg object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-9 h-9 rounded-lg" style={{ background: 'var(--btn-card-bg)' }} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.name}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.slug}</td>
                  <td className="px-4 py-3 text-sm line-clamp-1" style={{ color: 'var(--text-info)' }}>{item.description || '-'}</td>
                  <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-primary)' }}>{item.post_count ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setShowPosts(item)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--primary)' }} title="设置文章">
                        <Bookmark className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--text-info)' }} title="编辑基本信息">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--color-error)' }} title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--glass-border)',
            }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {editItem ? '编辑系列' : '新建系列'}
            </h2>
            <div className="space-y-3">
              <input placeholder="名称 *" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <input placeholder="Slug" value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <textarea placeholder="描述" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card resize-none"
                style={{ color: 'var(--text-primary)' }} rows={3} />
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>封面图</label>
                <MediaField value={form.cover_image} onChange={url => setForm({ ...form, cover_image: url })} placeholder="封面图 URL" filterType="image" />
              </div>
              <input type="number" placeholder="排序权重" value={form.sort_order}
                onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
              <button onClick={handleSave}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: 'var(--primary)' }}>保存</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Set Posts Modal */}
      {showPosts && <SetPostsModal series={showPosts} onClose={() => { setShowPosts(null); load(); }} />}
    </div>
  );
}

function SetPostsModal({ series, onClose }: { series: any; onClose: () => void }) {
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    api.admin.posts.list({ page_size: '100' }).then(res => {
      setAllPosts(res.items || []);
    }).catch(() => {});
    api.admin.series.listPosts(series.id).then(res => {
      setSelectedIds((res.items || []).map((p: any) => p.id));
    }).catch(() => {});
  }, [series.id]);

  function togglePost(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    try {
      await api.admin.series.setPosts(series.id, selectedIds);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          设置「{series.name}」的文章
        </h2>
        <div className="space-y-2">
          {allPosts.map((post: any) => (
            <div key={post.id} onClick={() => togglePost(post.id)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors hover:opacity-80"
              style={{ background: selectedIds.includes(post.id) ? 'var(--primary-sub)' : 'var(--btn-card-bg)' }}>
              <Checkbox checked={selectedIds.includes(post.id)} onChange={() => togglePost(post.id)} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{post.title}</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-info)' }}>
                {post.status === 'published' ? '已发布' : '草稿'}
              </span>
            </div>
          ))}
          {allPosts.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无文章</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)' }}>保存</button>
        </div>
      </div>
    </div>
  );
}
