'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, ExternalLink, Eye, Search, X, Check, FileText, Settings } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Select } from '@/components/ConfirmDialog';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import PostDetailDialog from '@/components/PostDetailDialog';

const PostEditor = dynamic(() => import('@/components/PostEditor'), {
  loading: () => <Loading />,
});

export default function AdminPosts() {
  const { confirm } = useConfirm();
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [openingPost, setOpeningPost] = useState(false);
  const [openError, setOpenError] = useState('');
  const [editing, setEditing] = useState<any>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailPost, setDetailPost] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());

  function toggleSelectPost(id: string) {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedPosts.size === posts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(posts.map(p => p.id)));
    }
  }

  async function handleBatchStatus(status: string) {
    const ids = Array.from(selectedPosts);
    if (ids.length === 0) return;
    try {
      await api.admin.posts.batchUpdateStatus(ids, status);
      setSelectedPosts(new Set());
      load();
    } catch (e: any) {
      alert(e.message || '批量操作失败');
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedPosts);
    if (ids.length === 0) return;
    if (!await confirm(`确定删除选中的 ${ids.length} 篇文章？`)) return;
    try {
      await api.admin.posts.batchDelete(ids);
      setSelectedPosts(new Set());
      load();
    } catch (e: any) {
      alert(e.message || '批量删除失败');
    }
  }

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.admin.posts.list(params);
      setPosts(res.items);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, pageSize, statusFilter]);
  useEffect(() => {
    api.getCategories().then(res => setCategories(res.items)).catch(() => {});
    api.getTags().then(res => setTags(res.items)).catch(() => {});
    api.admin.series.list().then(res => setSeriesList(res.items || [])).catch(() => {});
  }, []);

  async function handleDelete(id: string) {
    if (!await confirm('确定删除此文章？此操作不可恢复。')) return;
    await api.admin.posts.delete(id);
    load();
  }

  async function handleStatus(id: string, status: string) {
    await api.admin.posts.updateStatus(id, status);
    load();
  }

  async function openPost(id: string, mode: 'edit' | 'settings') {
    if (openingPost) return;
    setOpeningPost(true);
    setOpenError('');
    try {
      const { post } = await api.admin.posts.get(id);
      if (!post || typeof post.content !== 'string') throw new Error('文章详情不完整，请重试');
      if (mode === 'edit') setEditing(post);
      else setDetailPost(post);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : '读取文章失败，请重试');
    } finally {
      setOpeningPost(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  if (openingPost) return <Loading />;

  if (editing !== undefined) {
    return createPortal(
      <PostEditor post={editing} onClose={() => { setEditing(undefined); load(); }} />,
      document.body
    );
  }

  return (
    <div>
      {openError && <p role="alert" className="mb-4 text-sm" style={{ color: 'var(--color-error)' }}>{openError}</p>}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>文章</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => api.admin.posts.export()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm btn-glass"
            style={{ color: 'var(--text-secondary)' }}>
            导出
          </button>
          <button onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="glass-card rounded-2xl mb-4">
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
            <input type="text" placeholder="搜索文章..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
          </div>
          <div className="w-32">
            <Select value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1); }}
              options={[
                { value: '', label: '全部状态' },
                { value: 'published', label: '已发布' },
                { value: 'draft', label: '草稿' },
              ]} />
          </div>
        </div>

        {/* Batch actions */}
        {selectedPosts.size > 0 && (
          <div className="glass-card rounded-2xl mb-4 p-3 flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>已选 {selectedPosts.size} 篇</span>
            <button onClick={() => handleBatchStatus('published')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--primary)' }}>
              批量发布
            </button>
            <button onClick={() => handleBatchStatus('draft')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium btn-glass transition-all"
              style={{ color: 'var(--text-secondary)' }}>
              批量下架
            </button>
            <button onClick={handleBatchDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all ml-auto"
              style={{ color: 'var(--color-error)' }}>
              批量删除
            </button>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : posts.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无文章</p>
            <button onClick={() => setEditing(null)}
              className="mt-3 text-sm hover:underline" style={{ color: 'var(--primary)' }}>写第一篇</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left w-10">
                    <input type="checkbox" checked={selectedPosts.size === posts.length && posts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>标题</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>作者</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>编辑者</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-20" style={{ color: 'var(--text-info)' }}>状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-info)' }}>分类</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>标签</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-16" style={{ color: 'var(--text-info)' }}>浏览</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>发布日期</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>创建时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>更新时间</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-info)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, index) => (
                  <tr key={post.id || post.slug || index} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedPosts.has(post.id)}
                        onChange={() => toggleSelectPost(post.id)}
                        className="w-4 h-4 rounded cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {post.cover_image ? (
                          <ImageWithFallback src={post.cover_thumbnail_url || post.cover_image} fallbackSrc={post.cover_image} alt={post.title} loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center glass-card flex-shrink-0">
                            <FileText className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </div>
                        )}
                        <div className="flex items-center gap-2 min-w-0 group">
                          <span className="text-sm font-medium truncate cursor-pointer hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}
                            onClick={() => openPost(post.id, 'edit')}>{post.title}</span>
                          <button onClick={(e) => { e.stopPropagation(); window.open(`/posts/${post.slug}`, '_blank'); }}
                            className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100 flex-shrink-0"
                            style={{ color: 'var(--text-info)' }}
                            title="预览文章">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          {post.is_top && (
                            <span className="px-1.5 py-0.5 text-xs rounded flex-shrink-0"
                              style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>置顶</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {post.author_name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm" style={{ color: 'var(--text-info)' }}>
                        {post.editor?.display_name || post.editor?.username || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{
                          background: post.status === 'published' ? 'var(--primary-sub)' : 'var(--btn-card-bg)',
                          color: post.status === 'published' ? 'var(--primary)' : 'var(--text-info)',
                        }}>
                        {post.status === 'published' ? '已发布' : '草稿'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{post.category?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {post.tags?.length > 0 ? post.tags.map((tag: any) => (
                          <span key={tag.id} className="px-1.5 py-0.5 text-xs rounded"
                            style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}>
                            {tag.name}
                          </span>
                        )) : <span style={{ color: 'var(--text-info)' }}>-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Eye className="w-3.5 h-3.5" />
                        {post.view_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {post.published_at ? new Date(post.published_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {post.created_at ? new Date(post.created_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {post.updated_at ? new Date(post.updated_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => window.open(`/posts/${post.slug}`, '_blank')}
                          className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }} title="预览">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button onClick={() => openPost(post.id, 'edit')}
                          className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }} title="编辑">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleStatus(post.id, post.status === 'published' ? 'draft' : 'published')}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: post.status === 'published' ? 'var(--text-info)' : 'var(--primary)' }}
                          title={post.status === 'published' ? '下架' : '发布'}>
                          {post.status === 'published' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openPost(post.id, 'settings')}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: 'var(--text-info)' }} title="设置">
                          <Settings className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(post.id)}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: 'var(--color-error)' }} title="删除">
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
      </div>

      <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 篇</span>
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
      {detailPost && (
        <PostDetailDialog
          post={detailPost}
          categories={categories}
          tags={tags}
          seriesList={seriesList}
          onSave={async (data) => {
            await api.admin.posts.update(detailPost.id, data);
            setDetailPost(null);
            load();
          }}
          onClose={() => setDetailPost(null)}
        />
      )}
    </div>
  );
}
