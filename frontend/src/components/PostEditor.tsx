'use client';
import { localDateTimeTimestamp } from '@/lib/date-value';

import { Tooltip } from '@/components/ui/Tooltip';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { FilePicker } from '@/components/ui/FilePicker';

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useDeferredValue } from 'react';
import dynamic from 'next/dynamic';
import { api, ApiError, type Post, type PostMutation, type PostRevision } from '@/lib/api';
import { draftFromPost, postVersion, type EditorDraft } from '@/lib/editor-draft';
import { useEditorDraft } from '@/lib/use-editor-draft';
import { useEditorNavigationGuard } from '@/lib/use-editor-navigation-guard';
import ImageEditDialog from './EditorImageDialog';
import EditorConflictDialog from './EditorConflictDialog';
import { toDateTimeLocal, scheduledTimestamp } from '@/lib/post-settings';
import {
  ExternalLink, X, FileText, MoreHorizontal,
  ArrowLeft, Save,
  Bold, Italic, Underline, Strikethrough, Link, Code, Quote, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Heading1, Heading2, Heading3, LayoutGrid,
  Minus, SquareCode, Superscript, GitBranch, Table, Video, Music, Palette, Settings,
  Info, Lightbulb, CircleAlert, TriangleAlert, OctagonAlert
} from 'lucide-react';
import { useConfirm } from '@/components/ConfirmDialog';
import { MediaPickerModal } from '@/components/MediaField';
import GalleryEditDialog from '@/components/GalleryEditDialog';
import { findGalleryInContent, createDefaultGalleryAttrs } from '@/lib/gallery';
import type { GalleryAttrs } from '@/lib/gallery';
import { generateImageHtml, findImageInContent, type ImageAttrs } from '@/lib/article-image';
import { getClipboardImages, isImageFile, replaceUploadPlaceholder, uploadSelection } from '@/lib/editor-upload';
import { alignSelection, selectionAlignment, type TextAlignment } from '@/lib/editor-alignment';
import { useEditorScrollSync } from '@/lib/use-editor-scroll-sync';

import PostDetailDialog from './PostDetailDialog';

const ArticleMarkdown = dynamic(() => import('./ArticleMarkdown'), {
  loading: () => <p className="text-sm" role="status">正在加载预览...</p>,
});

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

type SavedPostResponse = { post?: Partial<Post> };

/* ── Full-page post editor ── */
export default function PostEditor({ post, onClose }: { post: Partial<Post> | null; onClose: () => void }) {
  const { confirm, alert } = useConfirm();
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [savedPostId, setSavedPostId] = useState<string | undefined>(post?.id);
  const savedPostIdRef = useRef<string | undefined>(post?.id);
  const createSucceededRef = useRef(false);
  const savingRef = useRef(false);
  const editVersionRef = useRef(0);
  const statusEditVersionRef = useRef(0);
  const passwordRef = useRef('');
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(() => post?.slug || crypto.randomUUID().slice(0, 8));
  const [content, setContent] = useState<string>(post?.content || '');
  const deferredContent = useDeferredValue(content);
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [coverImage, setCoverImage] = useState(post?.cover_image || '');
  const [categoryId, setCategoryId] = useState(post?.category_id ?? post?.category?.id ?? '');
  const [tagIds, setTagIds] = useState<string[]>(post?.tags?.map(t => t.id) || []);
  const [status, setStatus] = useState(post?.status || 'draft');
  const [isTop, setIsTop] = useState(post?.is_top || false);
  const [allowComment, setAllowComment] = useState(post?.allow_comment !== false);
  const seriesList: { id: string; name: string }[] = [];
  const [selectedSeriesId, setSelectedSeriesId] = useState(post?.series?.[0]?.id || '');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
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
  const [rightTab, setRightTab] = useState<'outline' | 'history' | 'details'>('outline');
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [showMarkdownReference, setShowMarkdownReference] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [preferredView, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)');
    if (!query) return;
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const viewMode = compact && preferredView === 'split' ? 'edit' : preferredView;
  const [conflict, setConflict] = useState<{ currentPost: Post; publishStatus?: 'draft' | 'published' } | null>(null);
  const baselineVersion = useRef(postVersion(post?.updated_at));
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

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
  }

  function handleSlugChange(newSlug: string) {
    setSlug(newSlug);
  }

  function changeStatus(value: 'draft' | 'published') {
    // Saving settings can explicitly choose Draft while an older Publish is
    // pending, even if Draft was already the local value before that request.
    statusEditVersionRef.current++;
    editVersionRef.current++;
    setStatus(value);
  }

  useEffect(() => {
    api.getCategories().then(res => setCategories(res.items)).catch(() => {});
    api.getTags().then(res => setTags(res.items)).catch(() => {});
  }, []);

  const draft = useMemo<EditorDraft>(() => ({ title, slug, content, excerpt, excerptMode, coverImage, categoryId, tagIds, status, isTop,
    allowComment, authorName, selectedSeriesId, scheduledAt, createdAt, passwordHint, passwordCleared,
    passwordNeedsReentry: Boolean(password) || passwordNeedsReentry }), [title, slug, content, excerpt, excerptMode, coverImage,
    categoryId, tagIds, status, isTop, allowComment, authorName, selectedSeriesId, scheduledAt, createdAt, passwordHint,
    password, passwordCleared, passwordNeedsReentry]);
  const persistence = useEditorDraft({ draft, postId: post?.id, expectedUpdatedAt: postVersion(post?.updated_at), serverPasswordSet });
  const releaseNavigation = useEditorNavigationGuard({ isDirty: persistence.isDirty, flush: persistence.flush, confirm });
  const draftRef = persistence.latest;
  useLayoutEffect(() => {
    passwordRef.current = password;
    editVersionRef.current++;
  }, [draft, password]);

  function applyDraft(value: EditorDraft) {
    setTitle(value.title); setSlug(value.slug); setContent(value.content); setExcerpt(value.excerpt);
    setExcerptMode(value.excerptMode); setCoverImage(value.coverImage); setCategoryId(value.categoryId);
    setTagIds(value.tagIds); changeStatus(value.status); setIsTop(value.isTop); setAllowComment(value.allowComment);
    setAuthorName(value.authorName); setSelectedSeriesId(value.selectedSeriesId); setScheduledAt(value.scheduledAt);
    setCreatedAt(value.createdAt); setPasswordHint(value.passwordHint); setPassword('');
    setPasswordCleared(value.passwordCleared); setPasswordNeedsReentry(value.passwordNeedsReentry);
  }

  function acknowledgeVersion(value: unknown) {
    const updatedAt = postVersion(value);
    if (updatedAt) { baselineVersion.current = updatedAt; persistence.setVersion(updatedAt); }
  }

  function restoreDraft() {
    const recovered = persistence.restore();
    if (!recovered) return;
    applyDraft(recovered.draft);
    acknowledgeVersion(recovered.expectedUpdatedAt);
    if (recovered.draft.passwordNeedsReentry) setError('本地草稿不保存访问密码，请在文章设置中重新输入密码后保存。');
  }

  async function handleClose() {
    const persisted = persistence.flush();
    if (persistence.isDirty) {
      if (!await confirm(persisted ? '还有未提交到服务器的修改，已保留本地草稿。确定返回列表？' : '本地草稿保存失败，离开可能丢失修改。确定返回列表？')) return;
    }
    await releaseNavigation();
    if (mountedRef.current) onClose();
  }

  async function loadConflictServer() {
    if (!conflict || !await confirm('载入服务器版本会替换当前本地修改，确定继续？')) return;
    const current = conflict.currentPost;
    const replacement = draftFromPost(current);
    acknowledgeVersion(current.updated_at);
    const metadata = { passwordSet: Boolean(current.password_set), createdAt: toDateTimeLocal(current.created_at) };
    serverMetadataRef.current = metadata;
    setServerMetadata(metadata);
    persistence.markClean(replacement);
    applyDraft(replacement);
    setConflict(null);
    setError('');
  }

  function loadRevisions() {
    if (!savedPostId) return;
    api.admin.posts.revisions.list(savedPostId).then(res => setRevisions(res.items)).catch(() => {});
  }

  async function handleRestoreRevision(revId: string) {
    if (savingRef.current || conflict || !savedPostId || !await confirm('确定要恢复到此版本？当前内容将被保存为新版本。')) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await api.admin.posts.revisions.restore(savedPostId, revId, baselineVersion.current);
      acknowledgeVersion(res.post.updated_at);
      const restored = { ...draftFromPost(res.post), excerptMode: draftRef.current.excerptMode };
      const current = { ...draftRef.current, title: restored.title, content: restored.content, excerpt: restored.excerpt };
      persistence.acknowledgeBaseline(restored, current);
      persistence.flush(current, savedPostId, baselineVersion.current);
      setTitle(res.post.title);
      setContent(res.post.content || '');
      setExcerpt(res.post.excerpt || '');
      loadRevisions();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'post_conflict' && err.currentPost) {
        setConflict({ currentPost: err.currentPost });
        persistence.flush(draftRef.current);
      }
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally { savingRef.current = false; setSaving(false); }
  }

  async function handleSave(publishStatus?: 'draft' | 'published', reviewedPost?: Post) {
    if (conflict && !reviewedPost) return;
    if (reviewedPost) {
      acknowledgeVersion(reviewedPost.updated_at);
      serverMetadataRef.current = { passwordSet: Boolean(reviewedPost.password_set), createdAt: toDateTimeLocal(reviewedPost.created_at) };
      setServerMetadata(serverMetadataRef.current);
    }
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
    const submittedDraft = { ...draftRef.current };
    setSaving(true);
    setError('');
    try {
      const finalExcerpt = excerptMode === 'auto' ? generateExcerpt(content) : excerpt;
      const data: PostMutation = {
        title, slug, content, excerpt: finalExcerpt,
        cover_image: coverImage,
        status: publishStatus || status,
        is_top: isTop,
        allow_comment: allowComment,
      };
      if (savedPostIdRef.current && baselineVersion.current) data.expected_updated_at = baselineVersion.current;
      data.author_name = authorName;
      if (savedPostIdRef.current && createdAt && createdAt !== serverMetadataRef.current.createdAt) {
        data.created_at = localDateTimeTimestamp(createdAt, '文章创建时间');
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
      acknowledgeVersion(response?.post?.updated_at);
      setConflict(null);
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
        draft.status = savedStatus === 'draft' || savedStatus === 'published' ? savedStatus : data.status || 'draft';
        setStatus(draft.status);
      }
      const acknowledged: EditorDraft = {
        ...submittedDraft,
        status: response?.post?.status || data.status || submittedDraft.status,
        createdAt: metadata.createdAt || submittedDraft.createdAt,
        passwordCleared: typeof data.password === 'string' ? false : submittedDraft.passwordCleared,
        passwordNeedsReentry: typeof data.password === 'string' ? false : submittedDraft.passwordNeedsReentry,
      };
      persistence.acknowledgeBaseline(acknowledged, draft);
      if (!hasNewerEdits && !openDialogRef.current) {
        if (persistence.markClean(draft, true)) {
          await releaseNavigation();
          if (mountedRef.current) onClose();
        }
      } else {
        // The create response establishes the server identity, while the draft
        // keeps edits made after the request began and the acknowledged version.
        persistence.flush(draft, savedPostIdRef.current, baselineVersion.current);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'post_conflict' && err.currentPost) {
        setConflict({ currentPost: err.currentPost, publishStatus });
        persistence.flush(draftRef.current);
        setError('文章已被其他窗口修改。请对照版本后选择如何继续。');
      } else setError(err instanceof Error ? err.message : '保存失败');
    }
    savingRef.current = false;
    setSaving(false);
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

  return (
    <div className="post-editor fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <style>{`
        @keyframes fade-scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(-6px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pe-slide-down { animation: slide-down 0.25s ease-out both; }
      `}</style>
      {/* Top bar */}
      <header className="editor-header"
        style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center gap-3">
          <Tooltip content="返回列表"><button onClick={() => { void handleClose(); }} className="p-2 rounded-xl transition-colors btn-glass" style={{ color: 'var(--text-secondary)' }} data-tooltip="返回列表" aria-label="返回列表">
            <ArrowLeft className="w-5 h-5" />
          </button></Tooltip>
          <div className="h-5 w-px" style={{ background: 'var(--glass-border)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {savedPostId ? '编辑文章' : '新建文章'}
          </span>
        </div>
        <div className="editor-header-actions flex items-center gap-2">
          {savedPostId && status === 'draft' && (
            <Tooltip content="复制预览链接"><button onClick={async () => {
              try {
                const res = await api.admin.posts.generatePreviewToken(savedPostId);
                const url = `${window.location.origin}/posts/preview?token=${res.token}`;
                await navigator.clipboard.writeText(url);
                await alert('预览链接已复制到剪贴板');
              } catch { await alert('生成失败'); }
            }}
              className="p-2 rounded-xl transition-colors btn-glass"
              style={{ color: 'var(--text-info)' }}
              data-tooltip="复制预览链接" aria-label="复制预览链接">
              <ExternalLink className="w-4 h-4" />
            </button></Tooltip>
          )}
          <div className="editor-view-switch" role="group" aria-label="编辑器视图">
            {([['edit', '编辑'], ['split', '分屏'], ['preview', '预览']] as const).filter(([mode]) => !compact || mode !== 'split').map(([mode, label]) =>
              <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>{label}</button>)}
          </div>
          <Tooltip content="文章详情与设置"><button onClick={() => setShowDetailDialog(true)}
            className="px-3 py-2 rounded-xl transition-colors btn-glass text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
            data-tooltip="文章详情与设置" aria-label="文章详情与设置">
            <Settings className="w-3.5 h-3.5 inline mr-1" />详情
          </button></Tooltip>
          <Tooltip content="Markdown 语法参考"><button onClick={() => setShowMarkdownReference(value => !value)}
            className="editor-secondary flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors btn-glass"
            style={{ color: showMarkdownReference ? 'var(--primary)' : 'var(--text-secondary)' }}
            data-tooltip="Markdown 语法参考" aria-label="Markdown 语法参考">
            <FileText className="w-3.5 h-3.5" />语法参考
          </button></Tooltip>
          <Tooltip content="切换侧边栏"><button onClick={() => setShowRightPanel(!showRightPanel)}
            className="editor-secondary p-2 rounded-xl transition-colors btn-glass"
            aria-expanded={showRightPanel} aria-label="切换侧边栏"
            style={{ color: showRightPanel ? 'var(--primary)' : 'var(--text-info)' }}
            data-tooltip="切换侧边栏">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </button></Tooltip>
          <button onClick={() => handleSave()} disabled={saving || mediaUploading || Boolean(conflict)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm btn-glass disabled:opacity-50 transition-all"
            style={{ color: 'var(--text-primary)' }}>
            <Save className={`w-4 h-4${saving ? ' animate-spin' : ''}`} />
            {saving ? '保存中...' : '保存'}
          </button>
          <button onClick={() => handleSave('published')} disabled={saving || mediaUploading || Boolean(conflict)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
            {saving ? '发布中...' : '发布'}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" className={`${mediaUploading ? '' : 'editor-upload-hint'} px-4 sm:px-6 pt-2 text-xs flex-shrink-0`}
        style={{ color: mediaUploading ? 'var(--primary)' : 'var(--text-info)' }}>
        {mediaUploading ? `正在上传 ${mediaUploadCount} 个文件，可继续编辑，完成后会自动插入原位置` : '支持粘贴截图、图片文件或拖入多张图片，自动上传并插入正文'}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm flex-shrink-0 glass-card pe-slide-down"
          style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      <div className="px-4 sm:px-6 py-2 text-xs flex-shrink-0" role={persistence.storageError ? 'alert' : 'status'}
        style={{ color: persistence.storageError ? 'var(--color-error)' : 'var(--text-info)' }}>
        {persistence.storageError ? <>{persistence.storageError} <button type="button" className="underline" onClick={persistence.retry}>重试草稿保存</button></>
          : persistence.savedAt ? '本地草稿已保存' : persistence.isDirty ? '正在保留本地草稿…' : '修改后会自动保留本地草稿'}
      </div>

      {persistence.recoverable.length > 0 && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm flex-shrink-0 flex flex-wrap items-center justify-between gap-2 glass-card pe-slide-down"
          style={{ color: 'var(--text-primary)', borderLeft: '3px solid var(--primary)' }}>
          <span>检测到未保存的草稿，是否恢复？</span>
          <Select aria-label="选择恢复草稿" value={persistence.selectedKey} onChange={persistence.setSelectedKey}
            options={persistence.recoverable.map(item => ({ value: item.key,
              label: `${item.draft.title || item.draft.content.slice(0, 24) || '未命名草稿'} · ${item.savedAt ? new Date(item.savedAt).toLocaleString('zh-CN') : '旧版草稿'}`,
            }))}
            className="rounded-lg px-2 py-1 min-w-0 max-w-full" style={{ background: 'var(--color-bg)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="px-3 py-1 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--primary)' }}>恢复</button>
            <button onClick={persistence.discard} className="px-3 py-1 rounded-lg text-xs btn-glass" style={{ color: 'var(--text-secondary)' }}>丢弃</button>
          </div>
        </div>
      )}
      {conflict && <EditorConflictDialog currentPost={conflict.currentPost} localDraft={{ ...draft, status: conflict.publishStatus || draft.status }}
        saving={saving} onLoadServer={() => { void loadConflictServer(); }}
        onKeepLocal={() => { void handleSave(conflict.publishStatus, conflict.currentPost); }} />}

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
          <div style={{ display: viewMode === 'preview' ? 'none' : undefined, flex: viewMode === 'preview' ? '0 1 0%' : (viewMode === 'split' ? '0 0 50%' : '1 1 0%'), pointerEvents: viewMode === 'preview' ? 'none' : undefined }} className="flex flex-col overflow-hidden transition-all duration-300 ease-in-out">
            {/* Fixed header: title, slug, toolbar */}
            <div className="max-w-5xl mx-auto w-full pt-4 sm:pt-6 px-4 sm:px-6 flex-shrink-0">
              <Input
                type="text"
                aria-label="文章标题" placeholder="请输入标题"
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                className="w-full text-2xl sm:text-3xl font-bold outline-none border-0 bg-transparent mb-2"
                style={{ color: 'var(--text-primary)' }}
              />
              <label className="editor-field-label mb-4"><span>/posts/</span><Input
                type="text"
                aria-label="文章链接标识" placeholder="url-slug"
                value={slug}
                onChange={e => handleSlugChange(e.target.value)}
                className="w-full text-xs outline-none border-0 bg-transparent font-mono py-1"
                style={{ color: 'var(--text-info)' }}
              /></label>

              {/* Toolbar */}
              <div className="editor-toolbar" role="group" aria-label="正文格式">
                {toolbarButtons.map((btn, i) => {
                  if ('type' in btn && btn.type === 'divider') {
                    return null;
                  }
                  const commonTools = ['粗体 (Ctrl+B)', '斜体 (Ctrl+I)', '标题 1', '标题 2', '左对齐', '居中', '右对齐', '链接 (Ctrl+K)', '图片', '引用', '无序列表', '有序列表', '代码块'];
                  if (!showMoreTools && !commonTools.includes(btn.title!)) return null;
                  const Icon = btn.icon!;
                  return (
                    <Tooltip content={btn.title} key={i}><button type="button" onMouseDown={e => e.preventDefault()} onClick={(e) => { btn.action(); mediaPickerBtnRef.current = e.currentTarget; }} data-tooltip={btn.title} aria-label={btn.title}
                      aria-pressed={'alignment' in btn ? textAlignment === btn.alignment : undefined}
                      className="transition-colors duration-150" style={{ color: 'alignment' in btn && textAlignment === btn.alignment ? 'var(--primary)' : 'var(--text-secondary)' }}>
                      <Icon className="w-4 h-4" />
                    </button></Tooltip>
                  );
                })}
                <Tooltip content="公式、表格、提示块与更多格式"><button type="button" aria-expanded={showMoreTools} aria-label={showMoreTools ? '收起更多工具' : '更多格式工具'} onClick={() => setShowMoreTools(value => !value)} data-tooltip="公式、表格、提示块与更多格式">
                  <MoreHorizontal size={16} /><span className="text-xs">{showMoreTools ? '收起' : '更多'}</span>
                </button></Tooltip>
              </div>

              {/* Media picker & upload for toolbar */}
              <FilePicker ref={mediaFileRef} multiple accept={mediaPickerType ? `${mediaPickerType}/*` : undefined}
                label="上传媒体文件"
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
            <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full px-4 sm:px-6 pb-4 relative"
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              onDrop={handleEditorDrop}>
              <Textarea
                ref={textareaRef}
                aria-label="Markdown 正文"
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
            <div ref={previewContentRef} className="max-w-5xl mx-auto py-5 sm:py-6 px-4 sm:px-6">
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
        <div className="editor-sidebar flex-shrink-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out" inert={!showRightPanel || compact} aria-hidden={!showRightPanel || compact} style={{ width: showRightPanel ? '16rem' : '0px', borderLeft: showRightPanel ? '1px solid var(--glass-border)' : '1px solid transparent', opacity: showRightPanel ? 1 : 0 }}>
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
                      <DateTimePicker aria-label="文章创建时间"
                        value={createdAt}
                        onChange={setCreatedAt}
                        className="w-full px-2.5 py-1.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
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
                    revisions.map(rev => (
                      <div key={rev.id} className="p-3 rounded-xl glass-card">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                            {new Date(rev.created_at).toLocaleString('zh-CN')}
                          </span>
                          <button disabled={saving || Boolean(conflict)} onClick={() => handleRestoreRevision(rev.id)}
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
            if (data.category_id !== undefined) setCategoryId(data.category_id || '');
            if (data.tag_ids) setTagIds(data.tag_ids);
            if (data.series_id !== undefined) setSelectedSeriesId(data.series_id || '');
            if (data.cover_image !== undefined) setCoverImage(data.cover_image);
            if (data.excerpt !== undefined) setExcerpt(data.excerpt);
            if (data.scheduled_at !== undefined) setScheduledAt(toDateTimeLocal(data.scheduled_at));
            if ('password' in data) {
              setPassword(data.password || '');
              setPasswordCleared(data.password === '');
              setPasswordNeedsReentry(false);
              setPasswordHint(data.password_hint || '');
              setError('');
            }
            if ('password_hint' in data) setPasswordHint(data.password_hint || '');
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
