'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useDeferredValue } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { toDateTimeLocal, scheduledTimestamp } from '@/lib/post-settings';
import {
  ExternalLink, X, FileText,
  ArrowLeft, Save,
  Bold, Italic, Underline, Strikethrough, Link, Code, Quote, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Heading1, Heading2, Heading3, LayoutGrid,
  Minus, SquareCode, Superscript, GitBranch, Table, Video, Music, Palette, Settings,
  Info, Lightbulb, CircleAlert, TriangleAlert, OctagonAlert
} from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { MediaPickerModal } from '@/components/MediaField';
import GalleryEditDialog from '@/components/GalleryEditDialog';
import { generateGalleryHtml, findGalleryInContent, createDefaultGalleryAttrs } from '@/lib/gallery';
import type { GalleryAttrs } from '@/lib/gallery';
import { generateImageHtml, findImageInContent, type ImageAttrs } from '@/lib/article-image';
import { getClipboardImages, isImageFile, replaceUploadPlaceholder, uploadSelection } from '@/lib/editor-upload';
import { alignSelection, selectionAlignment, type TextAlignment } from '@/lib/editor-alignment';
import { useEditorScrollSync } from '@/lib/use-editor-scroll-sync';

import PostDetailDialog from './PostDetailDialog';

const ArticleMarkdown = dynamic(() => import('./ArticleMarkdown'), {
  loading: () => <p className="text-sm" role="status">正在加载预览...</p>,
});

// ===== Image helper types and functions =====


const markdownReference = [
  { title: '标题与强调', example: '# 一级标题\n## 二级标题\n**粗体**  *斜体*  ~~删除线~~' },
  { title: '链接与图片', example: '[链接文字](https://example.com)\n![图片替代文字](https://example.com/image.jpg)' },
  { title: '列表与引用', example: '- 无序列表\n1. 有序列表\n> 普通引用' },
  { title: '代码与表格', example: '```ts\nconst message = "Hello";\n```\n\n| 名称 | 值 |\n| --- | --- |\n| 示例 | 内容 |' },
  { title: '数学与化学公式', example: '行内：$E = mc^2$\n\n块级：$$\\frac{a}{b}$$\n\n化学：$\\ce{2H2 + O2 -> 2H2O}$' },
  { title: 'Mermaid 图表', example: '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```' },
  { title: '提示块', example: '> [!NOTE]\n> 这是 Note 提示。\n\n[!WARNING] 这是 Warning 提示。' },
] as const;

const DEFAULT_IMAGE_ATTRS: ImageAttrs = {
  url: '',
  alt: '',
  width: '100%',
  height: '',
  align: 'center',
  caption: '',
  linkUrl: '',
};

type SavedPostResponse = { post?: { id?: string; status?: string; created_at?: string; password_set?: boolean } };

const WIDTH_PRESETS = [
  { label: '小', value: '50%' },
  { label: '中', value: '75%' },
  { label: '大', value: '100%' },
  { label: '原始', value: '' },
];

// ===== ImageEditDialog Component =====

function ImageEditDialog({ attrs, onSave, onClose }: {
  attrs: ImageAttrs;
  onSave: (attrs: ImageAttrs) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(attrs.url ?? '');
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const [width, setWidth] = useState(attrs.width ?? '100%');
  const [height, setHeight] = useState(attrs.height ?? '');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(attrs.align ?? 'center');
  const [caption, setCaption] = useState(attrs.caption ?? '');
  const [linkUrl, setLinkUrl] = useState(attrs.linkUrl ?? '');
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    if (!url) return;
    onSave({ url, alt, width, height, align, caption, linkUrl });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden pe-animate-in" style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>编辑图片</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>图片 URL</label>
            <div className="flex gap-2">
              <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }}
                placeholder="输入图片地址" />
              <button onClick={() => setShowMediaPicker(true)}
                className="px-3 py-2 rounded-xl text-sm btn-glass whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                媒体库
              </button>
            </div>
          </div>

          {/* Alt Text */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>替代文本 (Alt)</label>
            <input type="text" value={alt} onChange={e => setAlt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="图片描述" />
          </div>

          {/* Width Presets */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>尺寸</label>
            <div className="flex gap-2 mb-2">
              {WIDTH_PRESETS.map(p => (
                <button key={p.value} onClick={() => setWidth(p.value)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: width === p.value ? 'var(--btn-card-bg)' : 'transparent',
                    color: width === p.value ? 'var(--primary)' : 'var(--text-secondary)',
                    border: width === p.value ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>宽度</label>
                <input type="text" value={width} onChange={e => setWidth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder="100%" />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>高度</label>
                <input type="text" value={height} onChange={e => setHeight(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder="auto" />
              </div>
            </div>
          </div>

          {/* Alignment */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>对齐方式</label>
            <div className="flex gap-2">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} onClick={() => setAlign(a)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: align === a ? 'var(--btn-card-bg)' : 'transparent',
                    color: align === a ? 'var(--primary)' : 'var(--text-secondary)',
                    border: align === a ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>描述文本</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="图片下方的描述文字" />
          </div>

          {/* Link URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>跳转链接</label>
            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="点击图片跳转的 URL" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>
            取消
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}>
            确认
          </button>
        </div>
      </div>

      {showMediaPicker && (
        <MediaPickerModal
          filterType="image"
          onSelect={(url: string) => { setUrl(url); setShowMediaPicker(false); }}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </div>
  );
}

/* ── Full-page post editor ── */
export default function PostEditor({ post, onClose }: { post: any; onClose: () => void }) {
  const { confirm } = useConfirm();
  const [savedPostId, setSavedPostId] = useState<string | undefined>(post?.id);
  const savedPostIdRef = useRef<string | undefined>(post?.id);
  const createSucceededRef = useRef(false);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const statusEditVersionRef = useRef(0);
  const passwordRef = useRef('');
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(post?.slug || '');
  const [content, setContent] = useState<string>(post?.content || '');
  const deferredContent = useDeferredValue(content);
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [categoryId, setCategoryId] = useState(post?.category_id ?? post?.category?.id ?? '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map((t: any) => t.id) || []);
  const [status, setStatus] = useState(post?.status || 'draft');
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [allowComment, setAllowComment] = useState(post?.allow_comment !== false);
  const seriesList: any[] = [];
  const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series?.[0]?.id || '');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authorName, setAuthorName] = useState(post?.author_name || '');
  const [excerptMode, setExcerptMode] = useState<'manual' | 'auto'>(post?.excerpt ? 'manual' : 'auto');
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(post?.scheduled_at));
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState(post?.password_hint || '');
  const [serverMetadata, setServerMetadata] = useState(() => ({
    passwordSet: Boolean(post?.password_set), createdAt: toDateTimeLocal(post?.created_at),
  }));
  const serverMetadataRef = useRef(serverMetadata);
  const [createdAt, setCreatedAt] = useState(serverMetadata.createdAt);
  const serverPasswordSet = serverMetadata.passwordSet;
  const [passwordCleared, setPasswordCleared] = useState(false);
  const [passwordNeedsReentry, setPasswordNeedsReentry] = useState(false);
  const passwordSet = serverPasswordSet && !passwordCleared;
  const [users, setUsers] = useState<any[]>([]);
  const [rightTab, setRightTab] = useState<'outline' | 'history' | 'details'>('outline');
  const [revisions, setRevisions] = useState<any[]>([]);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showMarkdownReference, setShowMarkdownReference] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textAlignment, setTextAlignment] = useState<TextAlignment>('left');
  const [mediaPickerType, setMediaPickerType] = useState<'image' | 'video' | 'audio' | null>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const mediaPickerBtnRef = useRef<HTMLButtonElement>(null);
  const [mediaUploadCount, setMediaUploadCount] = useState(0);
  const mediaUploading = mediaUploadCount > 0;
  const pendingEditorSelection = useRef<{ start: number; end: number; scrollTop: number } | null>(null);
  useLayoutEffect(() => {
    const selection = pendingEditorSelection.current;
    const editor = textareaRef.current;
    if (selection && editor && document.activeElement === editor) {
      editor.setSelectionRange(selection.start, selection.end);
      editor.scrollTop = selection.scrollTop;
    }
    pendingEditorSelection.current = null;
  }, [content]);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const [imageDialog, setImageDialog] = useState<{ attrs: ImageAttrs; range?: { start: number; end: number; contentSnapshot: string } } | null>(null);
  const [galleryDialog, setGalleryDialog] = useState<{ attrs: GalleryAttrs; range?: { start: number; end: number } } | null>(null);
  const openDialogRef = useRef(false);
  useLayoutEffect(() => {
    openDialogRef.current = showDetailDialog || imageDialog !== null || galleryDialog !== null || mediaPickerType !== null;
  }, [showDetailDialog, imageDialog, galleryDialog, mediaPickerType]);

  useEditorScrollSync({ editorRef: textareaRef, previewRef: previewScrollRef,
    contentRef: previewContentRef, content: deferredContent, enabled: viewMode === 'split' });

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

  function changeStatus(value: string) {
    // Saving settings can explicitly choose Draft while an older Publish is
    // pending, even if Draft was already the local value before that request.
    statusEditVersionRef.current++;
    editVersionRef.current++;
    setStatus(value);
  }

  useEffect(() => {
    api.getCategories().then(res => setCategories(res.items)).catch(() => {});
    api.getTags().then(res => setTags(res.items)).catch(() => {});
    api.admin.users.list().then(res => setUsers(res.items)).catch(() => {});
  }, []);

  // Auto-save key
  const autosaveKey = savedPostId ? `post_autosave_${savedPostId}` : 'post_autosave_new';

  // Check for saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(autosaveKey);
      if (saved) {
        const data = JSON.parse(saved);
        const serverUpdatedAt = Date.parse(post?.updated_at || '') || 0;
        if ((data.content !== undefined || data.title !== undefined) && (!post?.id || data.savedAt > serverUpdatedAt)) {
          setShowRestoreBanner(true);
        }
      }
    } catch {}
  }, []);

  // The interval remains stable while its ref tracks the latest committed edits.
  const draftRef = useRef<Record<string, any>>({});
  useLayoutEffect(() => {
    passwordRef.current = password;
    draftRef.current = { title, slug, content, excerpt, excerptMode, coverImage, categoryId, tagIds, status, isTop,
      allowComment, authorName, selectedSeriesId, scheduledAt, createdAt, passwordHint, passwordCleared,
      passwordNeedsReentry: Boolean(password) || passwordNeedsReentry };
    editVersionRef.current++;
  }, [title, slug, content, excerpt, excerptMode, coverImage, categoryId, tagIds, status, isTop, allowComment,
    authorName, selectedSeriesId, scheduledAt, createdAt, passwordHint, password, passwordCleared, passwordNeedsReentry]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (showRestoreBanner) return;
      const draft = draftRef.current;
      if (!draft.title && !draft.content) return;
      try { localStorage.setItem(autosaveKey, JSON.stringify({ ...draft, savedAt: Date.now() })); } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [autosaveKey, showRestoreBanner]);

  function restoreDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(autosaveKey) || '{}');
      const setters: Record<string, (value: any) => void> = { title: setTitle, slug: setSlug, content: setContent,
        excerpt: setExcerpt, excerptMode: setExcerptMode, coverImage: setCoverImage, categoryId: setCategoryId,
        tagIds: setTagIds, status: changeStatus, isTop: setIsTop, allowComment: setAllowComment, authorName: setAuthorName,
        selectedSeriesId: setSelectedSeriesId, scheduledAt: setScheduledAt, createdAt: setCreatedAt,
        passwordHint: setPasswordHint };
      for (const [key, setter] of Object.entries(setters)) {
        if (saved[key] !== undefined) setter(saved[key]);
      }
      // Older backups used passwordSet for both a server password and a pending
      // local password. Treat that ambiguous state conservatively on recovery.
      const needsPassword = saved.passwordNeedsReentry === true ||
        (saved.passwordNeedsReentry === undefined && saved.passwordSet === true);
      setPassword('');
      setPasswordCleared(saved.passwordCleared === true || (saved.passwordSet === false && serverPasswordSet));
      setPasswordNeedsReentry(needsPassword);
      if (needsPassword) setError('本地草稿不保存访问密码，请在文章设置中重新输入密码后保存。');
    } catch {}
    setShowRestoreBanner(false);
  }

  function dismissRestore() {
    localStorage.removeItem(autosaveKey);
    setShowRestoreBanner(false);
  }

  function loadRevisions() {
    if (!savedPostId) return;
    api.admin.posts.revisions.list(savedPostId).then(res => setRevisions(res.items)).catch(() => {});
  }

  async function handleRestoreRevision(revId: string) {
    if (!savedPostId || !await confirm('确定要恢复到此版本？当前内容将被保存为新版本。')) return;
    try {
      const res = await api.admin.posts.revisions.restore(savedPostId, revId);
      setTitle(res.post.title);
      setContent(res.post.content);
      setExcerpt(res.post.excerpt || '');
      loadRevisions();
    } catch (err: any) {
      setError(err.message || '恢复失败');
    }
  }

  async function handleSave(publishStatus?: string) {
    if (savingRef.current) return;
    if (createSucceededRef.current && !savedPostIdRef.current) {
      setError('文章已保存，但响应缺少文章标识。请返回列表重新打开文章后继续保存。');
      return;
    }
    if (passwordNeedsReentry && !password) {
      setError('请重新输入访问密码后再保存或发布文章。');
      setShowDetailDialog(true);
      return;
    }
    if (mediaUploading) {
      setError('文件仍在上传，请等待上传完成后保存');
      return;
    }
    if (!title.trim()) {
      setError('标题为必填项');
      return;
    }
    if (!slug.trim()) {
      setError('Slug 为必填项');
      return;
    }
    savingRef.current = true;
    const savedVersion = editVersionRef.current;
    const savedStatusVersion = statusEditVersionRef.current;
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
      if (savedPostIdRef.current && createdAt && createdAt !== serverMetadataRef.current.createdAt) {
        const timestamp = new Date(createdAt);
        if (!Number.isNaN(timestamp.getTime())) data.created_at = timestamp.toISOString();
      }
      if (password) {
        data.password = password;
        data.password_hint = passwordHint;
      } else if (passwordCleared && serverMetadataRef.current.passwordSet) {
        data.password = '';
        data.password_hint = '';
      }
      data.category_id = categoryId;
      data.tag_ids = tagIds;
      data.series_id = selectedSeriesId;
      data.password_hint = passwordHint;
      data.scheduled_at = scheduledTimestamp(scheduledAt, publishStatus || status);

      let response: SavedPostResponse | undefined;
      if (savedPostIdRef.current) {
        response = await api.admin.posts.update(savedPostIdRef.current, data) as SavedPostResponse | undefined;
      } else {
        response = await api.admin.posts.create(data) as SavedPostResponse | undefined;
        createSucceededRef.current = true;
        const id = response?.post?.id;
        if (typeof id !== 'string' || !id) throw new Error('文章已保存，但响应缺少文章标识。请返回列表重新打开文章后继续保存。');
        savedPostIdRef.current = id;
        setSavedPostId(id);
      }
      const hasNewerEdits = editVersionRef.current !== savedVersion;
      const draft = { ...draftRef.current };
      const metadata = {
        passwordSet: typeof response?.post?.password_set === 'boolean' ? response.post.password_set :
          typeof data.password === 'string' ? Boolean(data.password) : serverMetadataRef.current.passwordSet,
        createdAt: toDateTimeLocal(response?.post?.created_at) ||
          toDateTimeLocal(data.created_at) || serverMetadataRef.current.createdAt,
      };
      serverMetadataRef.current = metadata;
      setServerMetadata(metadata);
      if (draft.createdAt === createdAt && metadata.createdAt) {
        draft.createdAt = metadata.createdAt;
        setCreatedAt(metadata.createdAt);
      }
      if (typeof data.password === 'string' && passwordRef.current === password && draft.passwordCleared === passwordCleared) {
        // Acknowledged credentials belong to the server baseline. Do not clear
        // a newer local password or removal entered during the request.
        setPassword('');
        setPasswordCleared(false);
        setPasswordNeedsReentry(false);
        draft.passwordCleared = false;
        draft.passwordNeedsReentry = false;
      }
      if (statusEditVersionRef.current === savedStatusVersion) {
        const savedStatus = response?.post?.status;
        draft.status = savedStatus === 'draft' || savedStatus === 'published' ? savedStatus : data.status;
        setStatus(draft.status);
      }
      if (!hasNewerEdits && !openDialogRef.current) {
        localStorage.removeItem(autosaveKey);
        onClose();
      } else {
        // Persist newer edits immediately, migrating a new article's draft only
        // after its create response has supplied the stable server identity.
        try {
          const currentKey = `post_autosave_${savedPostIdRef.current}`;
          localStorage.setItem(currentKey, JSON.stringify({ ...draft, savedAt: Date.now() }));
          if (currentKey !== autosaveKey) localStorage.removeItem(autosaveKey);
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || '保存失败');
    }
    savingRef.current = false;
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

  function alignText(align: TextAlignment) {
    const editor = textareaRef.current;
    if (!editor) return;
    const result = alignSelection(content, editor.selectionStart, editor.selectionEnd, align);
    editor.focus({ preventScroll: true });
    if (result.content === content) { setTextAlignment(align); return; }
    pendingEditorSelection.current = { start: result.start, end: result.end, scrollTop: editor.scrollTop };
    setContent(result.content);
    setTextAlignment(align);
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


  function finishEditorUpload(placeholder: string, replacement: string) {
    const editor = textareaRef.current;
    pendingEditorSelection.current = null;
    if (editor && document.activeElement === editor) {
      const selection = uploadSelection(editor.value, placeholder, replacement, editor.selectionStart, editor.selectionEnd);
      if (selection) pendingEditorSelection.current = { ...selection, scrollTop: editor.scrollTop };
    }
    setContent((previous: string) => replaceUploadPlaceholder(previous, placeholder, replacement));
  }

  async function uploadEditorFiles(files: File[], fallbackType: 'image' | 'video' | 'audio' = 'image') {
    if (!files.length) return;
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? content.length;
    const end = ta?.selectionEnd ?? start;
    const tasks = files.map(file => ({
      file,
      type: isImageFile(file) ? 'image' : file.type.startsWith('video/') ? 'video' : fallbackType,
      placeholder: `<!-- upload:${crypto.randomUUID()} -->`,
    }));
    const insertion = tasks.map(task => task.placeholder).join('\n') + '\n';
    setError('');
    setMediaUploadCount(count => count + tasks.length);
    setContent((previous: string) => previous.slice(0, start) + insertion + previous.slice(end));
    setMediaPickerType(null);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(start + insertion.length, start + insertion.length);
    });

    for (const task of tasks) {
      try {
        const res = await api.admin.media.upload(task.file);
        const url = res.media?.url;
        if (typeof url !== 'string' || !url) throw new Error('上传响应缺少文件地址');
        const name = task.file.name.replace(/[\[\]\\]/g, '\\$&').replace(/[\r\n]/g, ' ');
        const markup = task.type === 'image'
          ? `![${name}](${url})`
          : `<${task.type} src="${url}" controls></${task.type}>`;
        finishEditorUpload(task.placeholder, markup);
      } catch (err) {
        finishEditorUpload(task.placeholder, '');
        const message = `${task.file.name || '图片'}：${err instanceof Error ? err.message : '上传失败'}，请重新上传`;
        setError((previous: string) => previous ? `${previous}\n${message}` : message);
      } finally {
        setMediaUploadCount(count => count - 1);
      }
    }
  }

  function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'audio') {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    void uploadEditorFiles(files, type);
  }

  function handleEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = getClipboardImages(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    void uploadEditorFiles(files);
  }

  function handleEditImage(image: HTMLImageElement) {
    if (content !== deferredContent) {
      setError('图片预览正在更新，请稍后重新点击图片。');
      return;
    }
    const srcUrl = image.dataset.markdownSrc || image.getAttribute('src') || '';
    const start = Number(image.dataset.imageSourceStart), end = Number(image.dataset.imageSourceEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      setError('无法定位图片源内容，请等待预览更新后重新点击图片。');
      return;
    }
    const found = findImageInContent(content, srcUrl, { start, end });
    if (found) {
      const merged: ImageAttrs = { ...DEFAULT_IMAGE_ATTRS, ...found.attrs, url: found.attrs.url || srcUrl, alt: found.attrs.alt ?? image.alt };
      setImageDialog({ attrs: merged, range: { start: found.start, end: found.end, contentSnapshot: content } });
    } else {
      setError('图片源内容已变化，请等待预览更新后重新点击图片。');
    }
  }

  function handleEditGallery(imgEl: HTMLElement) {
    const galleryEl = imgEl.closest('.editor-image-gallery');
    if (!galleryEl) return;
    const preview = previewScrollRef.current;
    if (!preview) return;
    // Count how many galleries precede this one in the preview DOM
    const allGalleries = preview.querySelectorAll('.editor-image-gallery');
    let galleryIndex = -1;
    for (let i = 0; i < allGalleries.length; i++) {
      if (allGalleries[i] === galleryEl) { galleryIndex = i; break; }
    }
    if (galleryIndex < 0) return;
    // Find the nth gallery in raw content
    let searchStart = 0;
    let foundIndex = 0;
    while (true) {
      const found = findGalleryInContent(content.slice(searchStart));
      if (!found) break;
      const absStart = searchStart + found.start;
      const absEnd = searchStart + found.end;
      if (foundIndex === galleryIndex) {
        setGalleryDialog({ attrs: found.attrs, range: { start: absStart, end: absEnd } });
        return;
      }
      foundIndex++;
      searchStart = absEnd;
    }
  }

  // Drag-and-drop image upload
  const [dragOver, setDragOver] = useState(false);
  function handleEditorDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleEditorDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function handleEditorDrop(e: React.DragEvent) {
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    void uploadEditorFiles(files);
  }

  const headings = useMemo(() => deferredContent.split('\n').filter((line: string) => /^#{1,3}\s/.test(line)).map((line: string, i: number) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    return { level: match?.[1].length || 1, text: match?.[2] || '', index: i };
  }), [deferredContent]);

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
    { icon: AlignLeft, action: () => alignText('left'), title: '左对齐', alignment: 'left' },
    { icon: AlignCenter, action: () => alignText('center'), title: '居中', alignment: 'center' },
    { icon: AlignRight, action: () => alignText('right'), title: '右对齐', alignment: 'right' },
    { type: 'divider' as const },
    { icon: Link, action: () => insertMarkdown('[', '](url)'), title: '链接 (Ctrl+K)' },
    { icon: ImageIcon, action: () => setImageDialog({ attrs: { ...DEFAULT_IMAGE_ATTRS } }), title: '图片' },
    { icon: LayoutGrid, action: () => setGalleryDialog({ attrs: createDefaultGalleryAttrs(3) }), title: '图片画廊' },
    { icon: Code, action: () => insertMarkdown('`', '`'), title: '行内代码' },
    { icon: SquareCode, action: () => insertMarkdown('```\n', '\n```'), title: '代码块' },
    { icon: Quote, action: () => insertMarkdown('> '), title: '引用' },
    { type: 'divider' as const },
    { icon: Info, action: () => insertMarkdown('> [!NOTE]\n> '), title: '提示块：Note' },
    { icon: Lightbulb, action: () => insertMarkdown('> [!TIP]\n> '), title: '提示块：Tip' },
    { icon: CircleAlert, action: () => insertMarkdown('> [!IMPORTANT]\n> '), title: '提示块：Important' },
    { icon: TriangleAlert, action: () => insertMarkdown('> [!WARNING]\n> '), title: '提示块：Warning' },
    { icon: OctagonAlert, action: () => insertMarkdown('> [!CAUTION]\n> '), title: '提示块：Caution' },
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
            {savedPostId ? '编辑文章' : '新建文章'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {savedPostId && status === 'draft' && (
            <button onClick={async () => {
              try {
                const res = await api.admin.posts.generatePreviewToken(savedPostId);
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
          <button onClick={() => setShowMarkdownReference(value => !value)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors btn-glass"
            style={{ color: showMarkdownReference ? 'var(--primary)' : 'var(--text-secondary)' }}
            title="Markdown 语法参考">
            <FileText className="w-3.5 h-3.5" />语法参考
          </button>
          <button onClick={() => setShowRightPanel(!showRightPanel)}
            className="p-2 rounded-xl transition-colors btn-glass"
            style={{ color: showRightPanel ? 'var(--primary)' : 'var(--text-info)' }}
            title="切换侧边栏">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </button>
          <button onClick={() => handleSave()} disabled={saving || mediaUploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm btn-glass disabled:opacity-50 transition-all"
            style={{ color: 'var(--text-primary)' }}>
            <Save className={`w-4 h-4${saving ? ' animate-spin' : ''}`} />
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => handleSave('published')} disabled={saving || mediaUploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" className="px-6 py-2 text-xs flex-shrink-0"
        style={{ color: mediaUploading ? 'var(--primary)' : 'var(--text-info)' }}>
        {mediaUploading ? `正在上传 ${mediaUploadCount} 个文件，可继续编辑，完成后会自动插入原位置` : '支持粘贴截图、图片文件或拖入多张图片，自动上传并插入正文'}
      </div>

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

      {showMarkdownReference && (
        <section className="mx-4 mt-3 flex-shrink-0 rounded-2xl glass-card overflow-hidden" aria-label="Markdown 语法参考">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Markdown 语法参考</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>示例可直接复制到正文中使用</p>
            </div>
            <button onClick={() => setShowMarkdownReference(false)} className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--text-secondary)' }} aria-label="收起语法参考">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-4 max-h-[42vh] overflow-y-auto">
            {markdownReference.map((section) => (
              <div key={section.title} className="rounded-xl p-3" style={{ background: 'var(--btn-card-bg)' }}>
                <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>{section.title}</h3>
                <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed font-mono" style={{ color: 'var(--text-primary)' }}>
                  <code>{section.example}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>
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
                    <button key={i} type="button" onMouseDown={e => e.preventDefault()} onClick={(e) => { btn.action(); mediaPickerBtnRef.current = e.currentTarget; }} title={btn.title} aria-label={btn.title}
                      aria-pressed={'alignment' in btn ? textAlignment === btn.alignment : undefined}
                      className="p-1.5 rounded-lg transition-all duration-150 btn-glass hover:scale-110" style={{ color: 'alignment' in btn && textAlignment === btn.alignment ? 'var(--primary)' : 'var(--text-secondary)' }}>
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>

              {/* Media picker & upload for toolbar */}
              <input ref={mediaFileRef} type="file" multiple accept={mediaPickerType ? `${mediaPickerType}/*` : undefined}
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
                placeholder="输入 Markdown 内容，可直接粘贴截图或拖入多张图片自动上传..."
                value={content}
                onChange={e => {
                  setContent(e.target.value);
                  setTextAlignment(selectionAlignment(e.target.value, e.target.selectionStart, e.target.selectionEnd));
                }}
                onKeyDown={handleKeyDown}
                onPaste={handleEditorPaste}
                onSelect={e => setTextAlignment(selectionAlignment(content, e.currentTarget.selectionStart, e.currentTarget.selectionEnd))}
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
          {viewMode !== 'edit' && <div ref={previewScrollRef} aria-label="文章预览" style={{ flex: viewMode === 'split' ? '0 0 50%' : '1 1 0%', borderLeft: viewMode === 'split' ? '1px solid var(--glass-border)' : '1px solid transparent', overflowAnchor: 'none' }} className="overflow-y-auto transition-all duration-300 ease-in-out"
            onClick={(event) => {
              const target = event.target;
              if (!(target instanceof HTMLImageElement)) return;
              event.preventDefault();
              event.stopPropagation();
              if (target.closest('.editor-image-gallery')) handleEditGallery(target);
              else handleEditImage(target);
            }}>
            <div ref={previewContentRef} className="max-w-5xl mx-auto py-8 px-6">
              <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
                {deferredContent ? (
                  <ArticleMarkdown content={deferredContent} variant="editor" />
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-info)' }}>输入内容开始预览...</p>
                )}
              </div>
            </div>
          </div>}
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
              <button onClick={() => setRightTab('details')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{ color: rightTab === 'details' ? 'var(--primary)' : 'var(--text-info)' }}>
                详情
                {rightTab === 'details' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--primary)' }} />}
              </button>
              {savedPostId && (
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
              ) : rightTab === 'details' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>字符数</p>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{content.length.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>词数量</p>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{content.trim() ? content.trim().split(/\s+/).length.toLocaleString() : 0}</p>
                  </div>
                  {serverMetadata.createdAt && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>创建时间</p>
                      <input
                        type="datetime-local"
                        value={createdAt}
                        onChange={e => setCreatedAt(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', colorScheme: 'dark' }}
                      />
                    </div>
                  )}
                  {post?.published_at && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>发布时间</p>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{new Date(post.published_at).toLocaleString('zh-CN')}</p>
                    </div>
                  )}
                  {authorName && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>创建者 / 作者</p>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{authorName}</p>
                    </div>
                  )}
                  {post?.slug && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>访问链接</p>
                      <a href={`${typeof window !== 'undefined' ? window.location.origin : ''}/posts/${post.slug}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm break-all hover:underline"
                        style={{ color: 'var(--primary)' }}>
                        /posts/{post.slug}
                      </a>
                    </div>
                  )}
                  {!savedPostId && (
                    <p className="text-sm" style={{ color: 'var(--text-info)' }}>保存后可见更多详情</p>
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
          post={{ ...post, id: savedPostId, title, content, author_name: authorName, status, is_top: isTop, allow_comment: allowComment,
            category_id: categoryId, series_id: selectedSeriesId, tags: tagIds.map(id => ({ id })), cover_image: coverImage,
            excerpt, excerpt_mode: excerptMode, scheduled_at: scheduledAt, password, password_set: passwordSet, password_hint: passwordHint }}
          passwordNeedsReentry={passwordNeedsReentry}
          categories={categories}
          tags={tags}
          seriesList={seriesList}
          onSave={async (data, mode) => {
            setExcerptMode(mode);
            if (data.author_name !== undefined) setAuthorName(data.author_name);
            if (data.status !== undefined) changeStatus(data.status);
            if (data.is_top !== undefined) setIsTop(data.is_top);
            if (data.allow_comment !== undefined) setAllowComment(data.allow_comment);
            if (data.category_id !== undefined) setCategoryId(data.category_id);
            if (data.tag_ids) setTagIds(data.tag_ids);
            if (data.series_id !== undefined) setSelectedSeriesId(data.series_id);
            if (data.cover_image !== undefined) setCoverImage(data.cover_image);
            if (data.excerpt !== undefined) setExcerpt(data.excerpt);
            if (data.scheduled_at !== undefined) setScheduledAt(toDateTimeLocal(data.scheduled_at));
            if ('password' in data) {
              setPassword(data.password);
              setPasswordCleared(data.password === '');
              setPasswordNeedsReentry(false);
              setPasswordHint(data.password_hint || '');
              setError('');
            }
            if ('password_hint' in data) setPasswordHint(data.password_hint);
          }}
          onClose={() => setShowDetailDialog(false)}
        />
      )}

      {imageDialog && (
        <ImageEditDialog
          attrs={imageDialog.attrs}
          onSave={(newAttrs) => {
            const html = generateImageHtml(newAttrs);
            if (imageDialog.range) {
              if (content !== imageDialog.range.contentSnapshot) {
                setError('图片源内容已变化，请关闭对话框并重新点击图片。');
                return;
              }
              const newContent = content.substring(0, imageDialog.range.start) + '\n' + html + '\n' + content.substring(imageDialog.range.end);
              setContent(newContent);
            } else {
              const ta = textareaRef.current;
              if (ta) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newContent = content.substring(0, start) + html + '\n' + content.substring(end);
                setContent(newContent);
                setTimeout(() => { ta.focus(); ta.setSelectionRange(start + html.length + 1, start + html.length + 1); }, 0);
              } else {
                setContent((prev: string) => prev + '\n' + html + '\n');
              }
            }
            setImageDialog(null);
          }}
          onClose={() => setImageDialog(null)}
        />
      )}

      {galleryDialog && (
        <GalleryEditDialog
          initialAttrs={galleryDialog.attrs}
          onSave={(html) => {
            if (galleryDialog.range) {
              const newContent = content.substring(0, galleryDialog.range.start) + '\n' + html + '\n' + content.substring(galleryDialog.range.end);
              setContent(newContent);
            } else {
              const ta = textareaRef.current;
              if (ta) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newContent = content.substring(0, start) + '\n' + html + '\n' + content.substring(end);
                setContent(newContent);
                setTimeout(() => { ta.focus(); ta.setSelectionRange(start + html.length + 1, start + html.length + 1); }, 0);
              } else {
                setContent((prev: string) => prev + '\n' + html + '\n');
              }
            }
            setGalleryDialog(null);
          }}
          onClose={() => setGalleryDialog(null)}
        />
      )}
    </div>
  );
}
