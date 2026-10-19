'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { api, ApiError, type Post, type PostMutation } from '@/lib/api';
import type { TaxonomyItem, SeriesItem } from '@/lib/admin-types';
import { useFeedbackMutation, useLatestRequest } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
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
  const [page, setPage] = useState(1);
  const [detailed, setDetailed] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [openingPost, setOpeningPost] = useState(false);
  const [openError, setOpenError] = useState('');
  const [editing, setEditing] = useState<Post | null | undefined>(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('compose') !== '1') return;
    setEditing(null);
  }, []);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const seriesList: SeriesItem[] = [];
  const openingRef = useRef(false);
  const settingsSavingRef = useRef(false);
  const mutation = useFeedbackMutation();
  const { data: listData, loading, error: loadError, reload: load } = useLatestRequest(
    useCallback(() => api.admin.posts.list({
      page: String(page), page_size: String(pageSize),
      ...(searchQuery ? { search: searchQuery } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }), [page, pageSize, searchQuery, statusFilter]), '加载文章失败，请重试',
  );
  const posts: Post[] = listData?.items || [];
  const total = listData?.total || 0;
  const metadata = useLatestRequest(
    useCallback(() => Promise.all([api.getCategories(), api.getTags()]), []), '分类和标签加载失败，请重试',
  );
  const categories: TaxonomyItem[] = metadata.data?.[0].items || [];
  const tags: TaxonomyItem[] = metadata.data?.[1].items || [];
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

  useEffect(() => { setSelectedPosts(new Set()); }, [page, pageSize, searchQuery, statusFilter]);

  async function handleBatchStatus(status: string) {
    await mutation.run(async () => {
      const ids = Array.from(selectedPosts);
      if (ids.length === 0) return;
      await api.admin.posts.batchUpdateStatus(ids, status);
      setSelectedPosts(new Set());
      await load();
    }, '批量更新状态失败，请重试');
  }

  async function handleBatchDelete() {
    await mutation.run(async () => {
      const ids = Array.from(selectedPosts);
      if (ids.length === 0) return;
      if (!await confirm(`确定删除选中的 ${ids.length} 篇文章？`)) return;
      await api.admin.posts.batchDelete(ids);
      setSelectedPosts(new Set());
      await load();
    }, '批量删除失败，请重试');
  }

  async function handleDelete(id: string) {
    await mutation.run(async () => {
      if (!await confirm('确定删除此文章？此操作不可恢复。')) return;
      await api.admin.posts.delete(id);
      await load();
    }, '删除文章失败，请重试');
  }

  async function handleStatus(id: string, status: string) {
    await mutation.run(async () => {
      await api.admin.posts.updateStatus(id, status);
      await load();
    }, '更新文章状态失败，请重试');
  }

  async function handleSaveSettings(data: PostMutation) {
    if (settingsSavingRef.current) throw new Error('设置正在保存，请稍候');
    if (!detailPost?.updated_at) throw new Error('文章版本信息缺失，请保留修改并重新打开设置后再保存');
    settingsSavingRef.current = true;
    try {
      await api.admin.posts.update(detailPost.id, { ...data, expected_updated_at: detailPost.updated_at });
      setDetailPost(null);
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'post_conflict') {
        throw new Error('文章已被其他编辑更新。当前设置已保留；请先复制需要保留的修改，取消后重新打开设置，与最新版本比较再保存。');
      }
      throw error;
    } finally {
      settingsSavingRef.current = false;
    }
  }

  async function openPost(id: string, mode: 'edit' | 'settings') {
    if (openingRef.current) return;
    openingRef.current = true;
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
      openingRef.current = false;
      setOpeningPost(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function closeEditor() {
    // Keep the intent in the URL until closing: auth refresh can remount this page.
    const url = new URL(window.location.href);
    url.searchParams.delete('compose');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    setEditing(undefined);
    void load();
  }

  if (openingPost) return <Loading />;

  if (editing !== undefined) {
    return createPortal(
      <PostEditor post={editing} onClose={closeEditor} />,
      document.body
    );
  }

  return (
    <div>
      <RequestFeedback error={openError} />
      <RequestFeedback error={mutation.error} />
      <RequestFeedback error={metadata.error} onRetry={metadata.reload} pending={metadata.loading} />
      <header className="admin-page-heading">
        <div><h1>文章</h1><p>管理草稿与发布内容，点击标题继续编辑。</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => api.admin.posts.export()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm btn-glass"
            style={{ color: 'var(--text-secondary)' }}>
            导出
          </button>
          <button disabled={mutation.pending} onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </header>

      <RequestFeedback error={loadError} onRetry={load} pending={loading} />
      {/* Filters bar */}
      <div className="glass-card rounded-2xl mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="relative flex-1 min-w-[150px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
            <input aria-label="搜索文章" type="text" placeholder="搜索文章..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); setSearchQuery(search.trim()); } }}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
          </div>
          <button onClick={() => { setPage(1); setSearchQuery(search.trim()); }} className="admin-secondary-action">搜索</button>
          <div className="w-32">
            <Select value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1); }}
              options={[
                { value: '', label: '全部状态' },
                { value: 'published', label: '已发布' },
                { value: 'draft', label: '草稿' },
              ]} />
          </div>
          <button aria-pressed={detailed} onClick={() => setDetailed(value => !value)} className="ml-auto text-xs min-h-9 px-2" style={{ color: 'var(--text-secondary)' }}>{detailed ? '精简列' : '显示全部列'}</button>
          {(searchQuery || statusFilter) && <button onClick={() => { setSearch(''); setSearchQuery(''); setStatusFilter(''); setPage(1); }} className="text-xs min-h-9 px-2" style={{ color: 'var(--primary)' }}>清除筛选</button>}
        </div>

        {/* Batch actions */}
        {selectedPosts.size > 0 && (
          <div className="glass-card rounded-2xl mb-4 p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>已选 {selectedPosts.size} 篇</span>
            <button disabled={mutation.pending} onClick={() => handleBatchStatus('published')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--primary)' }}>
              批量发布
            </button>
            <button disabled={mutation.pending} onClick={() => handleBatchStatus('draft')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium btn-glass transition-all"
              style={{ color: 'var(--text-secondary)' }}>
              批量下架
            </button>
            <button disabled={mutation.pending} onClick={handleBatchDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all ml-auto"
              style={{ color: 'var(--color-error)' }}>
              批量删除
            </button>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : loadError ? null : posts.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{searchQuery || statusFilter ? '没有找到符合条件的文章' : '还没有文章，从一个想法开始'}</p>
            {searchQuery || statusFilter ? <button onClick={() => { setSearch(''); setSearchQuery(''); setStatusFilter(''); setPage(1); }} className="mt-3 text-sm underline" style={{ color: 'var(--primary)' }}>查看全部文章</button> : <button disabled={mutation.pending} onClick={() => setEditing(null)} className="mt-3 text-sm hover:underline" style={{ color: 'var(--primary)' }}>写第一篇</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-post-table" data-detailed={detailed} aria-label="文章列表">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left w-10">
                    <input aria-label="选择全部文章" disabled={mutation.pending} type="checkbox" checked={selectedPosts.size === posts.length && posts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>标题</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>作者</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>编辑者</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-20" style={{ color: 'var(--text-info)' }}>状态</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-info)' }}>分类</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>标签</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-16" style={{ color: 'var(--text-info)' }}>浏览</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>发布日期</th>
                  <th className="post-extra px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>创建时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-28" style={{ color: 'var(--text-info)' }}>更新时间</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-info)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, index) => (
                  <tr key={post.id || post.slug || index} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td className="px-4 py-3">
                      <input aria-label={`选择文章 ${post.title}`} disabled={mutation.pending} type="checkbox" checked={selectedPosts.has(post.id)}
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
                          <button disabled={openingPost} className="text-sm font-medium truncate text-left hover:underline transition-opacity" style={{ color: 'var(--text-primary)' }}
                            onClick={() => openPost(post.id, 'edit')}>{post.title}</button>
                          <button onClick={(e) => { e.stopPropagation(); window.open(`/posts/${post.slug}`, '_blank'); }}
                            className="p-0.5 rounded transition-colors opacity-60 hover:opacity-100 focus-visible:opacity-100 flex-shrink-0"
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
                    <td className="post-extra px-4 py-3 whitespace-nowrap">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {post.author_name || '-'}
                      </span>
                    </td>
                    <td className="post-extra px-4 py-3 whitespace-nowrap">
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
                    <td className="post-extra px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{post.category?.name || '-'}</td>
                    <td className="post-extra px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {post.tags?.length ? post.tags.map((tag: TaxonomyItem) => (
                          <span key={tag.id} className="px-1.5 py-0.5 text-xs rounded"
                            style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}>
                            {tag.name}
                          </span>
                        )) : <span style={{ color: 'var(--text-info)' }}>-</span>}
                      </div>
                    </td>
                    <td className="post-extra px-4 py-3">
                      <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Eye className="w-3.5 h-3.5" />
                        {post.view_count}
                      </span>
                    </td>
                    <td className="post-extra px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {post.published_at ? new Date(post.published_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td className="post-extra px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
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
                        <button disabled={mutation.pending} onClick={() => openPost(post.id, 'edit')}
                          className="inline-flex items-center p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-primary)' }} title="编辑">
                          <Pencil className="w-4 h-4" /><span className="text-xs ml-1">编辑</span>
                        </button>
                        <button disabled={mutation.pending} onClick={() => handleStatus(post.id, post.status === 'published' ? 'draft' : 'published')}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: post.status === 'published' ? 'var(--text-info)' : 'var(--primary)' }}
                          title={post.status === 'published' ? '下架' : '发布'}>
                          {post.status === 'published' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button disabled={mutation.pending || metadata.loading || !!metadata.error} onClick={() => openPost(post.id, 'settings')}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: 'var(--text-info)' }} title="设置">
                          <Settings className="w-4 h-4" />
                        </button>
                        <button disabled={mutation.pending} onClick={() => handleDelete(post.id)}
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 篇</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs whitespace-nowrap shrink-0" style={{ color: 'var(--text-info)' }}>每页</span>
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
          onSave={handleSaveSettings}
          onClose={() => setDetailPost(null)}
        />
      )}
    </div>
  );
}
