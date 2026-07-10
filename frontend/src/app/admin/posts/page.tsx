'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import {
  Plus, Pencil, Trash2, ExternalLink, Eye, Search, X, Check, FileText,
  ArrowLeft, Save,
  Bold, Italic, Underline, Strikethrough, Link, Code, Quote, List, ListOrdered,
  Image as ImageIcon, Heading1, Heading2, Heading3,
  Minus, SquareCode, Superscript, GitBranch, Table, Video, Music, Palette, Settings
} from 'lucide-react';
import { Loading } from '@/components/Loading';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { ArticleAudioPlayer } from '@/components/ArticleAudioPlayer';
import { useConfirm, Checkbox, Select } from '@/components/ConfirmDialog';
import { MediaField, MediaPickerModal } from '@/components/MediaField';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';

export default function AdminPosts() {
  const { confirm } = useConfirm();
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
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
      const params: Record<string, string> = { page: String(page), page_size: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.admin.posts.list(params);
      setPosts(res.items);
      setTotal(res.total);
    } catch (e) { /* empty */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, statusFilter]);
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

  const totalPages = Math.ceil(total / 20);

  if (editing !== undefined) {
    return createPortal(
      <PostEditor post={editing} onClose={() => { setEditing(undefined); load(); }} />,
      document.body
    );
  }

  return (
    <div>
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
                          <img src={post.cover_image} alt={post.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center glass-card flex-shrink-0">
                            <FileText className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </div>
                        )}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{post.title}</span>
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
                        <button onClick={() => setEditing(post)}
                          className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }} title="编辑">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleStatus(post.id, post.status === 'published' ? 'draft' : 'published')}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: post.status === 'published' ? 'var(--text-info)' : 'var(--primary)' }}
                          title={post.status === 'published' ? '下架' : '发布'}>
                          {post.status === 'published' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDetailPost(post)}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>共 {total} 篇</span>
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
      )}
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

/* ── Post Detail Dialog ── */
function PostDetailDialog({ post, categories, tags, seriesList, onSave, onClose }: {
  post: any;
  categories: any[];
  tags: any[];
  seriesList: any[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [authorName, setAuthorName] = useState(post?.author_name || '');
  const [status, setStatus] = useState(post?.status || 'draft');
  const [scheduledAt, setScheduledAt] = useState(post?.published_at && post?.status === 'draft' ? post.published_at.slice(0, 16) : '');
  const [categoryId, setCategoryId] = useState(post?.category_id || post?.category?.id || '');
  const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series?.[0]?.id || '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map((t: any) => t.id) || []);
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [excerptMode, setExcerptMode] = useState<'manual' | 'auto'>(post?.excerpt ? 'manual' : 'auto');
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [allowComment, setAllowComment] = useState(post?.allow_comment !== false);
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(post?.password_hint || '');
  const [passwordSet, setPasswordSet] = useState(post?.password_set || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  function generateExcerpt(md: string): string {
    const text = md
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_~>|-]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    return text.length > 200 ? text.slice(0, 200) + '...' : text;
  }

  function toggleTag(id: string) {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const data: any = {
        author_name: authorName,
        status,
        is_top: isTop,
        allow_comment: allowComment,
      };
      if (categoryId) data.category_id = categoryId;
      if (tagIds.length > 0) data.tag_ids = tagIds;
      if (selectedSeriesId) data.series_id = selectedSeriesId;
      if (coverImage) data.cover_image = coverImage;
      data.excerpt = excerptMode === 'manual' ? excerpt : generateExcerpt(post?.content || '');
      if (scheduledAt && status === 'draft') {
        data.scheduled_at = scheduledAt;
      }
      if (password) {
        data.password = password;
        data.password_hint = passwordHint;
      } else if (passwordSet === false && post?.id) {
        data.password = '';
        data.password_hint = '';
      }
      await onSave(data);
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    }
    setSaving(false);
  }

  const inputStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden pe-animate-in" style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {post?.title ? `设置：${post.title.slice(0, 30)}` : '文章详情与设置'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-error)', background: 'var(--glass-bg)' }}>
              {error}
            </div>
          )}

          {/* Author */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>作者（文章创作者）</label>
            <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)}
              placeholder="输入作者名称" className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-info)' }}>留空则不显示作者</p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>发布状态</label>
            <div className="flex gap-2">
              <button onClick={() => setStatus('published')}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: status === 'published' ? 'var(--primary)' : 'var(--btn-card-bg)',
                  color: status === 'published' ? '#fff' : 'var(--text-secondary)',
                  boxShadow: status === 'published' ? '0 0 12px var(--primary-glow)' : 'none',
                }}>发布</button>
              <button onClick={() => setStatus('draft')}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: status === 'draft' ? 'var(--btn-card-bg)' : 'transparent',
                  color: 'var(--text-secondary)',
                  border: status === 'draft' ? '1px solid var(--glass-border)' : '1px solid transparent',
                }}>草稿</button>
            </div>
          </div>

          {/* Scheduled publish */}
          {status === 'draft' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>定时发布</label>
              <input type="datetime-local" value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              {scheduledAt && (
                <p className="mt-1 text-xs" style={{ color: 'var(--primary)' }}>
                  将在 {new Date(scheduledAt).toLocaleString('zh-CN')} 自动发布
                </p>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>分类</label>
            <Select value={categoryId} onChange={setCategoryId}
              options={[
                { value: '', label: '无分类' },
                ...categories.map(cat => ({ value: cat.id, label: cat.name })),
              ]} />
          </div>

          {/* Series */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>系列</label>
            <Select value={selectedSeriesId} onChange={setSelectedSeriesId}
              options={[
                { value: '', label: '无系列' },
                ...seriesList.map(s => ({ value: s.id, label: s.name })),
              ]} />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>标签</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className="px-2.5 py-1 rounded-lg text-xs transition-all"
                  style={{
                    background: tagIds.includes(tag.id) ? 'var(--primary-sub)' : 'var(--btn-card-bg)',
                    color: tagIds.includes(tag.id) ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          {/* Cover image */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>封面图</label>
            <MediaField value={coverImage} onChange={setCoverImage} placeholder="https://..." filterType="image" />
          </div>

          {/* Excerpt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-info)' }}>摘要</label>
              <div className="flex gap-1">
                <button onClick={() => setExcerptMode('manual')}
                  className="px-2 py-0.5 rounded text-xs transition-all"
                  style={{
                    background: excerptMode === 'manual' ? 'var(--primary-sub)' : 'transparent',
                    color: excerptMode === 'manual' ? 'var(--primary)' : 'var(--text-info)',
                  }}>手动</button>
                <button onClick={() => setExcerptMode('auto')}
                  className="px-2 py-0.5 rounded text-xs transition-all"
                  style={{
                    background: excerptMode === 'auto' ? 'var(--primary-sub)' : 'transparent',
                    color: excerptMode === 'auto' ? 'var(--primary)' : 'var(--text-info)',
                  }}>自动</button>
                <div className="w-px h-4 mx-1 self-center" style={{ background: 'var(--glass-border)' }} />
                <button onClick={async () => {
                  if (aiGenerating || !post?.id) return;
                  setAiGenerating(true);
                  setError('');
                  try {
                    const res = await api.admin.posts.generateExcerpt(post.id);
                    setExcerpt(res.excerpt);
                    setExcerptMode('manual');
                  } catch (err: any) {
                    setError(err.message || 'AI 生成失败');
                  }
                  setAiGenerating(false);
                }}
                  className="px-2 py-0.5 rounded text-xs transition-all flex items-center gap-1"
                  style={{
                    background: 'var(--primary-sub)',
                    color: 'var(--primary)',
                    opacity: aiGenerating ? 0.6 : 1,
                  }}>
                  {aiGenerating ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--primary)', borderRightColor: 'var(--primary)' }} />
                      生成中
                    </>
                  ) : 'AI 生成'}
                </button>
              </div>
            </div>
            {excerptMode === 'manual' ? (
              <textarea placeholder="文章摘要" value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
            ) : (
              <div className="px-3 py-2 rounded-xl text-sm glass-card" style={{ color: 'var(--text-secondary)' }}>
                {post?.content ? generateExcerpt(post.content) : '输入内容后自动生成摘要'}
              </div>
            )}
          </div>

          {/* Top & Allow comment */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={isTop} onChange={setIsTop} label="置顶文章" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={allowComment} onChange={setAllowComment} label="允许评论" />
            </div>
          </div>

          {/* Password protection */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>密码保护</label>
            {post?.id && passwordSet ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm glass-card" style={{ color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--color-success)' }}>已设置密码</span>
                  <button type="button" onClick={() => { setPasswordSet(false); setPassword(''); }}
                    className="ml-auto text-xs px-2 py-0.5 rounded btn-glass" style={{ color: 'var(--color-error)' }}>清除密码</button>
                </div>
              </div>
            ) : (
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="设置访问密码（留空则不设密码）" maxLength={100}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>密码提示</label>
            <input type="text" value={passwordHint} onChange={e => setPasswordHint(e.target.value)}
              placeholder="如：请输入文章访问密码（选填）" maxLength={200}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
            style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}>
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Full-page post editor ── */
function PostEditor({ post, onClose }: { post: any; onClose: () => void }) {
  const { confirm } = useConfirm();
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(post?.slug || '');
  const [content, setContent] = useState(post?.content || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [categoryId, setCategoryId] = useState(post?.category_id || post?.category?.id || '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map((t: any) => t.id) || []);
  const [status, setStatus] = useState(post?.status || 'draft');
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [allowComment, setAllowComment] = useState(post?.allow_comment !== false);
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series?.[0]?.id || '');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authorName, setAuthorName] = useState(post?.author_name || '');
  const [excerptMode, setExcerptMode] = useState<'manual' | 'auto'>(post?.excerpt ? 'manual' : 'auto');
  const [scheduledAt, setScheduledAt] = useState(post?.published_at && post?.status === 'draft' ? post.published_at.slice(0, 16) : '');
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(post?.password_hint || '');
  const [passwordSet, setPasswordSet] = useState(post?.password_set || false);
  const [users, setUsers] = useState<any[]>([]);
  const [rightTab, setRightTab] = useState<'outline' | 'history'>('outline');
  const [revisions, setRevisions] = useState<any[]>([]);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mediaPickerType, setMediaPickerType] = useState<'image' | 'video' | 'audio' | null>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const mediaPickerBtnRef = useRef<HTMLButtonElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<'editor' | 'preview' | null>(null);

  const handleEditorScroll = useCallback(() => {
    if (!textareaRef.current || !previewScrollRef.current || syncingRef.current === 'preview') return;
    syncingRef.current = 'editor';
    const editor = textareaRef.current;
    const preview = previewScrollRef.current;
    const ratio = editor.scrollHeight > editor.clientHeight ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight) : 0;
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
    setTimeout(() => { syncingRef.current = null; }, 30);
  }, []);

  const handlePreviewScroll = useCallback(() => {
    if (!previewScrollRef.current || !textareaRef.current || syncingRef.current === 'editor') return;
    syncingRef.current = 'preview';
    const preview = previewScrollRef.current;
    const editor = textareaRef.current;
    const ratio = preview.scrollHeight > preview.clientHeight ? preview.scrollTop / (preview.scrollHeight - preview.clientHeight) : 0;
    editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight);
    setTimeout(() => { syncingRef.current = null; }, 30);
  }, []);

  function generateSlug() {
    return crypto.randomUUID().slice(0, 8);
  }

  function generateExcerpt(md: string): string {
    const text = md
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_~>|-]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    return text.length > 200 ? text.slice(0, 200) + '...' : text;
  }

  useEffect(() => {
    if (!post?.id && !slug) {
      setSlug(generateSlug());
    }
  }, []);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
  }

  function handleSlugChange(newSlug: string) {
    setSlug(newSlug);
  }

  useEffect(() => {
    api.getCategories().then(res => setCategories(res.items)).catch(() => {});
    api.getTags().then(res => setTags(res.items)).catch(() => {});
    api.admin.users.list().then(res => setUsers(res.items)).catch(() => {});
    api.admin.series.list().then(res => setSeriesList(res.items || [])).catch(() => {});
  }, []);

  // Auto-save key
  const autosaveKey = post?.id ? `post_autosave_${post.id}` : 'post_autosave_new';

  // Check for saved draft on mount
  useEffect(() => {
    if (post?.id) return; // Only for new posts
    try {
      const saved = localStorage.getItem(autosaveKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.content || data.title) {
          setShowRestoreBanner(true);
        }
      }
    } catch {}
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!title && !content) return;
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          title, slug, content, excerpt, coverImage, categoryId, tagIds, status, isTop, allowComment, authorName,
          savedAt: Date.now(),
        }));
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [title, slug, content, excerpt, coverImage, categoryId, tagIds, status, isTop, allowComment, authorName]);

  function restoreDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(autosaveKey) || '{}');
      if (saved.title) setTitle(saved.title);
      if (saved.slug) setSlug(saved.slug);
      if (saved.content) setContent(saved.content);
      if (saved.excerpt) setExcerpt(saved.excerpt);
      if (saved.coverImage) setCoverImage(saved.coverImage);
      if (saved.categoryId) setCategoryId(saved.categoryId);
      if (saved.tagIds) setTagIds(saved.tagIds);
      if (saved.status) setStatus(saved.status);
      if (saved.isTop !== undefined) setIsTop(saved.isTop);
      if (saved.authorName) setAuthorName(saved.authorName);
    } catch {}
    setShowRestoreBanner(false);
  }

  function dismissRestore() {
    localStorage.removeItem(autosaveKey);
    setShowRestoreBanner(false);
  }

  function loadRevisions() {
    if (!post?.id) return;
    api.admin.posts.revisions.list(post.id).then(res => setRevisions(res.items)).catch(() => {});
  }

  async function handleRestoreRevision(revId: string) {
    if (!post?.id || !await confirm('确定要恢复到此版本？当前内容将被保存为新版本。')) return;
    try {
      const res = await api.admin.posts.revisions.restore(post.id, revId);
      setTitle(res.post.title);
      setContent(res.post.content);
      setExcerpt(res.post.excerpt || '');
      loadRevisions();
    } catch (err: any) {
      setError(err.message || '恢复失败');
    }
  }

  async function handleSave(publishStatus?: string) {
    if (!title.trim()) {
      setError('标题为必填项');
      return;
    }
    if (!slug.trim()) {
      setError('Slug 为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const finalExcerpt = excerptMode === 'auto' ? generateExcerpt(content) : excerpt;
      const data: any = {
        title, slug, content, excerpt: finalExcerpt,
        cover_image: coverImage,
        status: publishStatus || status,
        is_top: isTop,
        allow_comment: allowComment,
      };
      data.author_name = authorName;
      if (password) {
        data.password = password;
        data.password_hint = passwordHint;
      } else if (passwordSet === false && post?.id) {
        data.password = '';
        data.password_hint = '';
      }
      if (categoryId) data.category_id = categoryId;
      if (tagIds.length > 0) data.tag_ids = tagIds;
      if (selectedSeriesId) data.series_id = selectedSeriesId;
      // If saving as draft with a scheduled date
      if (scheduledAt && (publishStatus || status) === 'draft') {
        data.scheduled_at = scheduledAt;
      }

      if (post?.id) {
        await api.admin.posts.update(post.id, data);
      } else {
        await api.admin.posts.create(data);
      }
      localStorage.removeItem(autosaveKey);
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    }
    setSaving(false);
  }

  function toggleTag(id: string) {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  function insertMarkdown(before: string, after: string = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newText = content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }

  function insertMedia(url: string, type: 'image' | 'video' | 'audio') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    let before = '', after = '';
    if (type === 'image') {
      before = '![](';
      after = ')';
    } else if (type === 'video') {
      before = '<video src="';
      after = '" controls></video>';
    } else {
      before = '<audio src="';
      after = '" controls></audio>';
    }
    const newText = content.substring(0, start) + before + url + after + content.substring(end);
    setContent(newText);
    setMediaPickerType(null);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length + url.length + after.length, start + before.length + url.length + after.length); }, 0);
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'audio') {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaUploading(true);
    try {
      const res = await api.admin.media.upload(file);
      const url = res.media?.url;
      if (url) insertMedia(url, type);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setMediaUploading(false);
      if (mediaFileRef.current) mediaFileRef.current.value = '';
    }
  }

  // Image paste from clipboard
  async function handleEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        setMediaUploading(true);
        try {
          const res = await api.admin.media.upload(file);
          if (res.media?.url) insertMedia(res.media.url, 'image');
        } catch (err) {
          console.error('Paste upload failed', err);
        } finally {
          setMediaUploading(false);
        }
        return;
      }
    }
  }

  // Drag-and-drop image upload
  const [dragOver, setDragOver] = useState(false);
  function handleEditorDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleEditorDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  async function handleEditorDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        setMediaUploading(true);
        try {
          const res = await api.admin.media.upload(file);
          if (res.media?.url) insertMedia(res.media.url, 'image');
        } catch (err) {
          console.error('Drop upload failed', err);
        } finally {
          setMediaUploading(false);
        }
        return;
      }
    }
  }

  const headings = content.split('\n').filter((line: string) => /^#{1,3}\s/.test(line)).map((line: string, i: number) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    return { level: match?.[1].length || 1, text: match?.[2] || '', index: i };
  });

  const toolbarButtons = [
    { icon: Bold, action: () => insertMarkdown('**', '**'), title: '粗体 (Ctrl+B)' },
    { icon: Italic, action: () => insertMarkdown('*', '*'), title: '斜体 (Ctrl+I)' },
    { icon: Underline, action: () => insertMarkdown('<u>', '</u>'), title: '下划线' },
    { icon: Strikethrough, action: () => insertMarkdown('~~', '~~'), title: '删除线 (Ctrl+Shift+X)' },
    { type: 'divider' as const },
    { icon: Heading1, action: () => insertMarkdown('# '), title: '标题 1' },
    { icon: Heading2, action: () => insertMarkdown('## '), title: '标题 2' },
    { icon: Heading3, action: () => insertMarkdown('### '), title: '标题 3' },
    { type: 'divider' as const },
    { icon: Link, action: () => insertMarkdown('[', '](url)'), title: '链接 (Ctrl+K)' },
    { icon: ImageIcon, action: () => setMediaPickerType('image'), title: '图片' },
    { icon: Code, action: () => insertMarkdown('`', '`'), title: '行内代码' },
    { icon: SquareCode, action: () => insertMarkdown('```\n', '\n```'), title: '代码块' },
    { icon: Quote, action: () => insertMarkdown('> '), title: '引用' },
    { type: 'divider' as const },
    { icon: Superscript, action: () => insertMarkdown('$', '$'), title: '行内公式' },
    { icon: Superscript, action: () => insertMarkdown('$$\n', '\n$$'), title: '公式块' },
    { icon: GitBranch, action: () => insertMarkdown('```mermaid\n', '\n```'), title: 'Mermaid 图' },
    { type: 'divider' as const },
    { icon: List, action: () => insertMarkdown('- '), title: '无序列表' },
    { icon: ListOrdered, action: () => insertMarkdown('1. '), title: '有序列表' },
    { icon: Table, action: () => insertMarkdown('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| ', ' |  |  |\n'), title: '表格' },
    { icon: Minus, action: () => insertMarkdown('\n---\n'), title: '分割线' },
    { type: 'divider' as const },
    { icon: Palette, action: () => insertMarkdown('<span style="color: ', '">文字</span>'), title: '文字颜色' },
    { icon: Video, action: () => setMediaPickerType('video'), title: '视频' },
    { icon: Music, action: () => setMediaPickerType('audio'), title: '音频' },
  ];

  function handleKeyDown(e: React.KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    const shortcuts: Record<string, () => void> = {
      'b': () => insertMarkdown('**', '**'),
      'i': () => insertMarkdown('*', '*'),
      'k': () => insertMarkdown('[', '](url)'),
      's': () => { e.preventDefault(); handleSave(); },
    };

    const shifted = e.shiftKey;
    if (shifted && e.key === 'X') {
      e.preventDefault();
      insertMarkdown('~~', '~~');
      return;
    }
    if (shifted && e.key === 'K') {
      e.preventDefault();
      insertMarkdown('```\n', '\n```');
      return;
    }

    const fn = shortcuts[e.key.toLowerCase()];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }

  const inputStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <style>{`
        @keyframes fade-scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pe-animate-in { animation: fade-scale-in 0.2s ease-out both; }
        .pe-slide-down { animation: slide-down 0.25s ease-out both; }
      `}</style>
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-4 flex-shrink-0 glass-card"
        style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-xl transition-colors btn-glass" style={{ color: 'var(--text-secondary)' }} title="返回列表">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-5 w-px" style={{ background: 'var(--glass-border)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {post?.id ? '编辑文章' : '新建文章'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {post?.id && status === 'draft' && (
            <button onClick={async () => {
              try {
                const res = await api.admin.posts.generatePreviewToken(post.id);
                const url = `${window.location.origin}/posts/preview?token=${res.token}`;
                await navigator.clipboard.writeText(url);
                alert('预览链接已复制到剪贴板');
              } catch { alert('生成失败'); }
            }}
              className="p-2 rounded-xl transition-colors btn-glass"
              style={{ color: 'var(--text-info)' }}
              title="复制预览链接">
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setViewMode(viewMode === 'edit' ? 'split' : viewMode === 'split' ? 'preview' : 'edit')}
            className="px-3 py-2 rounded-xl transition-colors btn-glass text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
            title="切换编辑/预览模式">
            {viewMode === 'edit' ? '编辑' : viewMode === 'preview' ? '预览' : '分屏'}
          </button>
          <button onClick={() => setShowDetailDialog(true)}
            className="px-3 py-2 rounded-xl transition-colors btn-glass text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
            title="文章详情与设置">
            <Settings className="w-3.5 h-3.5 inline mr-1" />详情
          </button>
          <button onClick={() => setShowRightPanel(!showRightPanel)}
            className="p-2 rounded-xl transition-colors btn-glass"
            style={{ color: showRightPanel ? 'var(--primary)' : 'var(--text-info)' }}
            title="切换侧边栏">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </button>
          <button onClick={() => handleSave()} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm btn-glass disabled:opacity-50 transition-all"
            style={{ color: 'var(--text-primary)' }}>
            <Save className={`w-4 h-4${saving ? ' animate-spin' : ''}`} />
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => handleSave('published')} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm flex-shrink-0 glass-card pe-slide-down"
          style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      {/* Auto-save restore banner */}
      {showRestoreBanner && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm flex-shrink-0 flex items-center justify-between glass-card pe-slide-down"
          style={{ color: 'var(--text-primary)', borderLeft: '3px solid var(--primary)' }}>
          <span>检测到未保存的草稿，是否恢复？</span>
          <div className="flex gap-2">
            <button onClick={restoreDraft}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white"
              style={{ background: 'var(--primary)' }}>恢复</button>
            <button onClick={dismissRestore}
              className="px-3 py-1 rounded-lg text-xs btn-glass"
              style={{ color: 'var(--text-secondary)' }}>丢弃</button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor + Preview container (takes remaining space) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          <div style={{ opacity: viewMode === 'preview' ? 0 : 1, flex: viewMode === 'preview' ? '0 1 0%' : (viewMode === 'split' ? '0 0 50%' : '1 1 0%'), pointerEvents: viewMode === 'preview' ? 'none' : undefined }} className="flex flex-col overflow-hidden transition-all duration-300 ease-in-out">
            {/* Fixed header: title, slug, toolbar */}
            <div className="max-w-5xl mx-auto w-full pt-8 px-6 flex-shrink-0">
              <input
                type="text"
                placeholder="请输入标题"
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                className="w-full text-3xl font-bold outline-none border-0 bg-transparent mb-2"
                style={{ color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="url-slug"
                value={slug}
                onChange={e => handleSlugChange(e.target.value)}
                className="w-full text-sm outline-none border-0 bg-transparent font-mono mb-6"
                style={{ color: 'var(--text-info)' }}
              />

              {/* Toolbar */}
              <div className="flex items-center gap-0.5 pb-3 mb-4 flex-wrap" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {toolbarButtons.map((btn, i) => {
                  if ('type' in btn && btn.type === 'divider') {
                    return <div key={`d-${i}`} className="w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />;
                  }
                  const Icon = btn.icon!;
                  return (
                    <button key={i} onClick={(e) => { btn.action(); mediaPickerBtnRef.current = e.currentTarget; }} title={btn.title}
                      className="p-1.5 rounded-lg transition-all duration-150 btn-glass hover:scale-110" style={{ color: 'var(--text-secondary)' }}>
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>

              {/* Media picker & upload for toolbar */}
              <input ref={mediaFileRef} type="file" accept="image/*,video/*,audio/*"
                onChange={e => mediaPickerType && handleMediaUpload(e, mediaPickerType)}
                style={{ display: 'none' }} />
              {mediaPickerType && (
                <MediaPickerModal
                  triggerRect={mediaPickerBtnRef.current?.getBoundingClientRect()}
                  onSelect={(url) => insertMedia(url, mediaPickerType)}
                  onClose={() => setMediaPickerType(null)}
                  onUpload={() => mediaFileRef.current?.click()}
                  filterType={mediaPickerType}
                />
              )}
            </div>

            {/* Scrollable textarea */}
            <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full px-6 pb-8 relative"
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              onDrop={handleEditorDrop}>
              <textarea
                ref={textareaRef}
                placeholder="输入 Markdown 内容..."
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleEditorScroll}
                onPaste={handleEditorPaste}
                className="w-full h-full outline-none border-0 bg-transparent resize-none leading-relaxed"
                style={{ color: 'var(--text-primary)', overflowY: 'auto' }}
              />
              {/* Drag overlay */}
              {dragOver && (
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center z-10"
                  style={{ background: 'var(--primary-sub)', border: '2px dashed var(--primary)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--primary)' }}>释放以上传图片</p>
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div ref={previewScrollRef} style={{ opacity: viewMode === 'edit' ? 0 : 1, flex: viewMode === 'edit' ? '0 1 0%' : (viewMode === 'split' ? '0 0 50%' : '1 1 0%'), borderLeft: viewMode === 'split' ? '1px solid var(--glass-border)' : '1px solid transparent', pointerEvents: viewMode === 'edit' ? 'none' : undefined }} className="overflow-y-auto transition-all duration-300 ease-in-out" onScroll={handlePreviewScroll}>
            <div className="max-w-5xl mx-auto py-8 px-6">
              <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
                {content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeRaw, rehypeSlug]}
                    components={{
                      code: ({ className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (match?.[1] === 'mermaid') {
                          return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
                        }
                        return <code className={className} {...props}>{children}</code>;
                      },
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{children}</a>
                      ),
                      img: ({ src, alt }) => (
                        <img src={src} alt={alt || ''} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      ),
                      audio: ({ src }) => <ArticleAudioPlayer src={src || ''} />,
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-info)' }}>输入内容开始预览...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex-shrink-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out" style={{ width: showRightPanel ? '16rem' : '0px', borderLeft: showRightPanel ? '1px solid var(--glass-border)' : '1px solid transparent', opacity: showRightPanel ? 1 : 0 }}>
            <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <button onClick={() => setRightTab('outline')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{ color: rightTab === 'outline' ? 'var(--primary)' : 'var(--text-info)' }}>
                大纲
                {rightTab === 'outline' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
              </button>
              {post?.id && (
                <button onClick={() => { setRightTab('history'); loadRevisions(); }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative"
                  style={{ color: rightTab === 'history' ? 'var(--primary)' : 'var(--text-info)' }}>
                  历史
                  {rightTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === 'outline' ? (
                <div>
                  {headings.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无大纲</p>
                  ) : (
                    <div className="space-y-1">
                      {headings.map((h: { level: number; text: string; index: number }, i: number) => (
                        <div key={i} className={`text-sm cursor-pointer py-0.5 transition-colors hover:opacity-80 ${h.level === 1 ? '' : h.level === 2 ? 'pl-4' : 'pl-8'}`}
                          style={{ color: 'var(--text-secondary)' }}>
                          {h.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {revisions.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无修订历史</p>
                  ) : (
                    revisions.map((rev: any) => (
                      <div key={rev.id} className="p-3 rounded-xl glass-card">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                            {new Date(rev.created_at).toLocaleString('zh-CN')}
                          </span>
                          <button onClick={() => handleRestoreRevision(rev.id)}
                            className="text-xs px-2 py-0.5 rounded btn-glass"
                            style={{ color: 'var(--primary)' }}>恢复</button>
                        </div>
                        <p className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>{rev.title}</p>
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {rev.content?.slice(0, 100)}...
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
      </div>

      {showDetailDialog && (
        <PostDetailDialog
          post={post}
          categories={categories}
          tags={tags}
          seriesList={seriesList}
          onSave={async (data) => {
            if (data.author_name !== undefined) setAuthorName(data.author_name);
            if (data.status !== undefined) setStatus(data.status);
            if (data.is_top !== undefined) setIsTop(data.is_top);
            if (data.allow_comment !== undefined) setAllowComment(data.allow_comment);
            if (data.category_id !== undefined) setCategoryId(data.category_id);
            if (data.tag_ids) setTagIds(data.tag_ids);
            if (data.series_id !== undefined) setSelectedSeriesId(data.series_id);
            if (data.cover_image !== undefined) setCoverImage(data.cover_image);
            if (data.excerpt !== undefined) setExcerpt(data.excerpt);
            if (data.scheduled_at !== undefined) setScheduledAt(data.scheduled_at);
            if ('password' in data) { setPassword(data.password); setPasswordHint(data.password_hint || ''); }
            if ('password_set' in data) setPasswordSet(data.password_set);
          }}
          onClose={() => setShowDetailDialog(false)}
        />
      )}
    </div>
  );
}
