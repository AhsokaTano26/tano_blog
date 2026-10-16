'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { toDateTimeLocal, scheduledTimestamp, type ExcerptMode } from '@/lib/post-settings';
import { Checkbox, Select } from './ConfirmDialog';
import { MediaField } from './MediaField';
import { SeriesSelect } from './SeriesSelect';

export default function PostDetailDialog({ post, categories, tags, seriesList, passwordNeedsReentry = false, onSave, onClose }: {
  post: any;
  categories: any[];
  tags: any[];
  seriesList: any[];
  passwordNeedsReentry?: boolean;
  onSave: (data: any, excerptMode: ExcerptMode) => Promise<void>;
  onClose: () => void;
}) {
  const [authorName, setAuthorName] = useState(post?.author_name || '');
  const [status, setStatus] = useState(post?.status || 'draft');
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(post?.scheduled_at));
  const [categoryId, setCategoryId] = useState(post?.category_id ?? post?.category?.id ?? '');
  const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series_id ?? post?.series?.[0]?.id ?? '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map((t: any) => t.id) || []);
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [excerptMode, setExcerptMode] = useState<'manual' | 'auto'>(post?.excerpt_mode || (post?.excerpt ? 'manual' : 'auto'));
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [allowComment, setAllowComment] = useState(post?.allow_comment !== false);
  const [password, setPassword] = useState(post?.password || '');
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
    if (passwordNeedsReentry && !password) {
      setError('请重新输入访问密码，本地草稿不会保存密码明文。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data: any = {
        author_name: authorName,
        status,
        is_top: isTop,
        allow_comment: allowComment,
      };
      data.category_id = categoryId;
      data.tag_ids = tagIds;
      data.series_id = selectedSeriesId;
      data.cover_image = coverImage;
      data.password_hint = passwordHint;
      data.excerpt = excerptMode === 'manual' ? excerpt : generateExcerpt(post?.content || '');
      data.scheduled_at = scheduledTimestamp(scheduledAt, status);
      if (password) {
        data.password = password;
        data.password_hint = passwordHint;
      } else if (passwordSet === false) {
        data.password = '';
        data.password_hint = '';
      }
      await onSave(data, excerptMode);
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
            <SeriesSelect value={selectedSeriesId} onChange={setSelectedSeriesId}
              initialOptions={[...(post?.series || []), ...seriesList]} />
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
              <textarea placeholder="文章摘要" value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={8}
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
            {passwordNeedsReentry && <p role="alert" className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>此草稿的访问密码尚未保存，请重新输入密码后保存。</p>}
            {post?.id && passwordSet && !passwordNeedsReentry ? (
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
