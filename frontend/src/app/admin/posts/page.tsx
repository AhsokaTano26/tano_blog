'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import {
  Plus, Pencil, Trash2, ExternalLink, Eye, Search, X, Check, FileText,
  ArrowLeft, Save, ChevronDown, ChevronRight,
  Bold, Italic, Underline, Strikethrough, Link, Code, Quote, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Heading1, Heading2, Heading3,
  Undo, Redo, Minus
} from 'lucide-react';

export default function AdminPosts() {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: '20' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.admin.posts.list(params);
      setPosts(res.items);
      setTotal(res.total);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, statusFilter]);

  async function handleDelete(id: string) {
    if (!confirm('确定删除此文章？此操作不可恢复。')) return;
    await api.admin.posts.delete(id);
    load();
  }

  async function handleStatus(id: string, status: string) {
    await api.admin.posts.updateStatus(id, status);
    load();
  }

  const totalPages = Math.ceil(total / 20);

  if (editing !== undefined) {
    return <PostEditor post={editing} onClose={() => { setEditing(undefined); load(); }} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>文章</h1>
        <button onClick={() => setEditing(null)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
          <Plus className="w-4 h-4" />
          新建
        </button>
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
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl text-sm outline-none glass-card"
            style={{ color: 'var(--text-primary)' }}>
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            加载中...
          </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-12" style={{ color: 'var(--text-info)' }}></th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>标题</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-info)' }}>状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-info)' }}>分类</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-20" style={{ color: 'var(--text-info)' }}>浏览</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-info)' }}>发布日期</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-info)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, index) => (
                  <tr key={post.id || post.slug || index} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td className="px-4 py-3">
                      {post.cover_image ? (
                        <img src={post.cover_image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center glass-card">
                          <FileText className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>{post.title}</span>
                        {post.is_top && (
                          <span className="px-1.5 py-0.5 text-xs rounded flex-shrink-0"
                            style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>置顶</span>
                        )}
                      </div>
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
                      <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Eye className="w-3.5 h-3.5" />
                        {post.view_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {post.published_at ? new Date(post.published_at).toLocaleDateString('zh-CN') : '-'}
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
                        <button onClick={() => handleDelete(post.id)}
                          className="p-1.5 rounded-lg transition-colors btn-glass"
                          style={{ color: '#f87171' }} title="删除">
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
    </div>
  );
}

/* ── Full-page post editor ── */
function PostEditor({ post, onClose }: { post: any; onClose: () => void }) {
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(post?.slug || '');
  const [content, setContent] = useState(post?.content || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [categoryId, setCategoryId] = useState(post?.category_id || post?.category?.id || '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map((t: any) => t.id) || []);
  const [status, setStatus] = useState(post?.status || 'draft');
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rightTab, setRightTab] = useState<'outline' | 'detail'>('outline');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function generateSlug() {
    return crypto.randomUUID().slice(0, 8);
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
  }, []);

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
      const data: any = {
        title, slug, content, excerpt,
        cover_image: coverImage,
        status: publishStatus || status,
        is_top: isTop,
      };
      if (categoryId) data.category_id = categoryId;
      if (tagIds.length > 0) data.tag_ids = tagIds;

      if (post?.id) {
        await api.admin.posts.update(post.id, data);
      } else {
        await api.admin.posts.create(data);
      }
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

  const headings = content.split('\n').filter((line: string) => /^#{1,3}\s/.test(line)).map((line: string, i: number) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    return { level: match?.[1].length || 1, text: match?.[2] || '', index: i };
  });

  const toolbarButtons = [
    { icon: Bold, action: () => insertMarkdown('**', '**'), title: '粗体' },
    { icon: Italic, action: () => insertMarkdown('*', '*'), title: '斜体' },
    { icon: Underline, action: () => insertMarkdown('<u>', '</u>'), title: '下划线' },
    { icon: Strikethrough, action: () => insertMarkdown('~~', '~~'), title: '删除线' },
    { type: 'divider' as const },
    { icon: Heading1, action: () => insertMarkdown('# '), title: '标题 1' },
    { icon: Heading2, action: () => insertMarkdown('## '), title: '标题 2' },
    { icon: Heading3, action: () => insertMarkdown('### '), title: '标题 3' },
    { type: 'divider' as const },
    { icon: Link, action: () => insertMarkdown('[', '](url)'), title: '链接' },
    { icon: ImageIcon, action: () => insertMarkdown('![alt](', ')'), title: '图片' },
    { icon: Code, action: () => insertMarkdown('`', '`'), title: '行内代码' },
    { icon: Quote, action: () => insertMarkdown('> '), title: '引用' },
    { type: 'divider' as const },
    { icon: List, action: () => insertMarkdown('- '), title: '无序列表' },
    { icon: ListOrdered, action: () => insertMarkdown('1. '), title: '有序列表' },
    { icon: Minus, action: () => insertMarkdown('\n---\n'), title: '分割线' },
  ];

  const inputStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-bg)' }}>
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
            <Save className="w-4 h-4" />
            保存
          </button>
          <button onClick={() => handleSave('published')} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            发布
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm flex-shrink-0 glass-card"
          style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)' }}>
          {error}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8 px-6">
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
                  <button key={i} onClick={btn.action} title={btn.title}
                    className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-secondary)' }}>
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>

            <textarea
              ref={textareaRef}
              placeholder="输入 Markdown 内容..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full min-h-[500px] outline-none border-0 bg-transparent resize-none leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Right sidebar */}
        {showRightPanel && (
          <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden" style={{ borderLeft: '1px solid var(--glass-border)' }}>
            <div className="flex" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <button onClick={() => setRightTab('outline')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{ color: rightTab === 'outline' ? 'var(--primary)' : 'var(--text-info)' }}>
                大纲
                {rightTab === 'outline' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
              </button>
              <button onClick={() => setRightTab('detail')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{ color: rightTab === 'detail' ? 'var(--primary)' : 'var(--text-info)' }}>
                详情
                {rightTab === 'detail' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
              </button>
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
                <div className="space-y-4">
                  {/* Status */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>发布状态</label>
                    <div className="flex gap-2">
                      <button onClick={() => setStatus('published')}
                        className="flex-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: status === 'published' ? 'var(--primary)' : 'var(--btn-card-bg)',
                          color: status === 'published' ? '#fff' : 'var(--text-secondary)',
                          boxShadow: status === 'published' ? '0 0 12px var(--primary-glow)' : 'none',
                        }}>发布</button>
                      <button onClick={() => setStatus('draft')}
                        className="flex-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                        style={{
                          background: status === 'draft' ? 'var(--btn-card-bg)' : 'transparent',
                          color: 'var(--text-secondary)',
                          border: status === 'draft' ? '1px solid var(--glass-border)' : '1px solid transparent',
                        }}>草稿</button>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>分类</label>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                      style={{ color: 'var(--text-primary)' }}>
                      <option value="">无分类</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>标签</label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                        <button key={tag.id} onClick={() => toggleTag(tag.id)}
                          className="px-2 py-0.5 rounded-lg text-xs transition-all"
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
                    <input type="url" placeholder="https://..." value={coverImage} onChange={e => setCoverImage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                      style={{ color: 'var(--text-primary)' }} />
                    {coverImage && (
                      <img src={coverImage} alt="" className="mt-2 w-full h-20 object-cover rounded-xl" onError={(e: any) => e.target.style.display = 'none'} />
                    )}
                  </div>

                  {/* Excerpt */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>摘要</label>
                    <textarea placeholder="文章摘要" value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={3}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none glass-card"
                      style={{ color: 'var(--text-primary)' }} />
                  </div>

                  {/* Top */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={isTop} onChange={e => setIsTop(e.target.checked)}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>置顶文章</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
