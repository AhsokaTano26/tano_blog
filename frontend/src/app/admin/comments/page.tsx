'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, Check, X, Trash2, ExternalLink, User, CheckSquare, Square } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminComments() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: '20' };
      if (filter) params.status = filter;
      const res = await api.admin.comments.list(params);
      setItems(res.items);
      setTotal(res.total);
      setSelected(new Set());
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, filter]);

  async function handleStatus(id: string, status: string) {
    try {
      await api.admin.comments.updateStatus(id, status);
      load();
    } catch (e) { /* empty */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此评论？')) return;
    try {
      await api.admin.comments.delete(id);
      load();
    } catch (e) { /* empty */ }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  }

  async function handleBatchStatus(status: string) {
    if (selected.size === 0) return;
    try {
      await api.admin.comments.batchUpdateStatus(Array.from(selected), status);
      load();
    } catch (e) { /* empty */ }
  }

  const tabs = [
    { key: '', label: '全部' },
    { key: 'pending', label: '待审核' },
    { key: 'approved', label: '已批准' },
    { key: 'rejected', label: '已拒绝' },
  ];

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>评论</h1>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="glass-card rounded-xl mb-4 px-4 py-3 flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>已选 {selected.size} 条</span>
          <button onClick={() => handleBatchStatus('approved')}
            className="btn-glass px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: 'hsl(142, 60%, 50%)' }}>
            批量批准
          </button>
          <button onClick={() => handleBatchStatus('rejected')}
            className="btn-glass px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: 'hsl(0, 60%, 50%)' }}>
            批量拒绝
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="glass-card rounded-xl mb-4">
        <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => { setFilter(tab.key); setPage(1); }}
              className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                filter === tab.key ? '' : ''
              }`}
              style={{ color: filter === tab.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
              {tab.label}
              {filter === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <MessageSquare className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-info)' }} />
            <p>暂无评论</p>
          </div>
        ) : (
          <div>
            {/* Select all header */}
            <div className="px-5 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <button onClick={toggleSelectAll} className="p-0.5" style={{ color: 'var(--text-info)' }}>
                {selected.size === items.length && items.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
              <span className="text-xs" style={{ color: 'var(--text-info)' }}>全选</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="px-5 py-4 transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(item.id)} className="p-0.5 mt-1 flex-shrink-0" style={{ color: selected.has(item.id) ? 'var(--primary)' : 'var(--text-info)' }}>
                    {selected.has(item.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-sub)' }}>
                    <User className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{item.nickname}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{
                          background: item.status === 'approved' ? 'hsla(142, 60%, 50%, 0.1)' :
                            item.status === 'rejected' ? 'hsla(0, 60%, 50%, 0.1)' :
                            'hsla(45, 60%, 50%, 0.1)',
                          color: item.status === 'approved' ? 'hsl(142, 60%, 50%)' :
                            item.status === 'rejected' ? 'hsl(0, 60%, 50%)' :
                            'hsl(45, 60%, 50%)',
                        }}>
                        {item.status === 'approved' ? '已批准' : item.status === 'rejected' ? '已拒绝' : '待审核'}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-info)' }}>{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                    </div>

                    {item.post && (
                      <a href={`/posts/${item.post.slug}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs hover:underline flex items-center gap-1 mb-1.5" style={{ color: 'var(--primary)' }}>
                        回复于：{item.post.title}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <p className="text-sm whitespace-pre-wrap line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{item.content}</p>

                    {item.email && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>{item.email}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.status !== 'approved' && (
                      <button onClick={() => handleStatus(item.id, 'approved')}
                        className="btn-glass p-1.5 rounded transition-colors" title="批准" aria-label="批准评论">
                        <Check className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                    )}
                    {item.status !== 'rejected' && (
                      <button onClick={() => handleStatus(item.id, 'rejected')}
                        className="btn-glass p-1.5 rounded transition-colors" title="拒绝" aria-label="拒绝评论">
                        <X className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(item.id)}
                      className="btn-glass p-1.5 rounded transition-colors" title="删除" aria-label="删除评论">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 条</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="btn-glass px-3 py-1.5 rounded disabled:opacity-40 transition-colors" style={{ color: 'var(--text-secondary)' }}>上一页</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.max(1, page - 2) + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-8 h-8 rounded text-sm font-bold transition-all"
                  style={{
                    background: p === page ? 'var(--primary)' : 'var(--card-bg)',
                    color: p === page ? '#fff' : 'var(--text-primary)',
                  }}>{p}</button>
              );
            })}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="btn-glass px-3 py-1.5 rounded disabled:opacity-40 transition-colors" style={{ color: 'var(--text-secondary)' }}>下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
