import type { Post } from './post-types';
import { toDateTimeLocal } from './post-settings';

export interface EditorDraft {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  excerptMode: 'manual' | 'auto';
  coverImage: string;
  categoryId: string;
  tagIds: string[];
  status: 'draft' | 'published';
  isTop: boolean;
  allowComment: boolean;
  authorName: string;
  selectedSeriesId: string;
  scheduledAt: string;
  createdAt: string;
  passwordHint: string;
  passwordCleared: boolean;
  passwordNeedsReentry: boolean;
}

export interface RecoverableDraft {
  key: string;
  raw: string;
  draft: EditorDraft;
  savedAt: number;
  expectedUpdatedAt?: string;
}

export function postVersion(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function sameDraft(left: EditorDraft, right: EditorDraft): boolean {
  return (Object.keys(left) as (keyof EditorDraft)[]).every(key => key === 'tagIds'
    ? left.tagIds.length === right.tagIds.length && left.tagIds.every((id, index) => id === right.tagIds[index])
    : left[key] === right[key]);
}

export function draftFromPost(post?: Partial<Post> | null): EditorDraft {
  return {
    title: post?.title || '', slug: post?.slug || '', content: post?.content || '',
    excerpt: post?.excerpt || '', excerptMode: post?.excerpt ? 'manual' : 'auto',
    coverImage: post?.cover_image || '', categoryId: post?.category_id ?? post?.category?.id ?? '',
    tagIds: post?.tags?.map(tag => tag.id) || [], status: post?.status || 'draft',
    isTop: post?.is_top || false, allowComment: post?.allow_comment !== false,
    authorName: post?.author_name || '', selectedSeriesId: post?.series?.[0]?.id || '',
    scheduledAt: toDateTimeLocal(post?.scheduled_at), createdAt: toDateTimeLocal(post?.created_at),
    passwordHint: post?.password_hint || '', passwordCleared: false, passwordNeedsReentry: false,
  };
}

// Explicitly select allowed fields so credentials cannot enter storage, even if
// an older backup or a future caller accidentally includes extra properties.
export function sanitizeDraft(value: Record<string, unknown>, fallback: EditorDraft, serverPasswordSet = false): EditorDraft {
  const string = (key: keyof EditorDraft) => typeof value[key] === 'string' ? value[key] as string : fallback[key] as string;
  const boolean = (key: keyof EditorDraft) => typeof value[key] === 'boolean' ? value[key] as boolean : fallback[key] as boolean;
  return {
    title: string('title'), slug: string('slug'), content: string('content'), excerpt: string('excerpt'),
    excerptMode: value.excerptMode === 'manual' || value.excerptMode === 'auto' ? value.excerptMode : fallback.excerptMode,
    coverImage: string('coverImage'), categoryId: string('categoryId'),
    tagIds: Array.isArray(value.tagIds) && value.tagIds.every(id => typeof id === 'string') ? value.tagIds : fallback.tagIds,
    status: value.status === 'published' || value.status === 'draft' ? value.status : fallback.status, isTop: boolean('isTop'), allowComment: boolean('allowComment'),
    authorName: string('authorName'), selectedSeriesId: string('selectedSeriesId'), scheduledAt: string('scheduledAt'),
    createdAt: string('createdAt'), passwordHint: string('passwordHint'),
    passwordCleared: value.passwordCleared === true || (value.passwordSet === false && serverPasswordSet),
    passwordNeedsReentry: value.passwordNeedsReentry === true ||
      (value.passwordNeedsReentry === undefined && value.passwordSet === true),
  };
}

export function serializeDraft(draft: EditorDraft, expectedUpdatedAt?: string): string {
  return JSON.stringify({ schema: 2, ...sanitizeDraft({ ...draft }, draft), savedAt: Date.now(), expectedUpdatedAt });
}

export function findDrafts(storage: Storage, postId: string | undefined, fallback: EditorDraft, serverPasswordSet: boolean): RecoverableDraft[] {
  const prefix = `post_autosave_${postId || 'new'}`;
  const drafts: RecoverableDraft[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || (key !== prefix && !key.startsWith(`${prefix}:`))) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('本地草稿读取失败，草稿数据损坏；原数据已保留。'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (typeof record.title !== 'string' && typeof record.content !== 'string') continue;
    drafts.push({ key, raw, draft: sanitizeDraft(record, fallback, serverPasswordSet),
      savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0, expectedUpdatedAt: postVersion(record.expectedUpdatedAt) });
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}
