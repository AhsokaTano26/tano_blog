import 'server-only';

import { cache } from 'react';
import { fetchPublicApi } from '@/lib/server-api';
import type { FriendLinkItem } from '@/lib/admin-types';
import type { PostSummary, TaxonomyItem } from '@/lib/home-data';
import { legacyDateKey } from './legacy-time';

export const LEGACY_HOME = '/legacy';
export const LEGACY_LIST = '/legacy/posts';

export type LegacySearchParams = Record<string, string | string[] | undefined>;
export type LegacyImage = { id: string; url: string; thumbnail_url?: string; title?: string; created_at?: string };
export type ArchiveMonth = { year: number; month: number; posts: PostSummary[] };
export type Collection<T> = { items: T[] | null; total: number; page: number; size: number };

export function tryRead<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  return fetchPublicApi<T>(path, params).catch(() => null);
}

export async function isLegacyOpen() {
  return (await tryRead<{ enabled: boolean }>('/api/v1/config/legacy'))?.enabled === true;
}

export function legacyPostHref(slug: string) {
  return `${LEGACY_LIST}/${encodeURIComponent(slug)}`;
}

export function withQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
  return query ? `${path}?${query}` : path;
}

export function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || '';
}

export function readListQuery(params: LegacySearchParams) {
  const raw = first(params.page);
  const page = /^\d{1,7}$/.test(raw) ? Math.max(1, Number(raw)) : 1;
  return { page, search: first(params.q).trim().slice(0, 200), category: first(params.category).slice(0, 200) };
}

export function readPosts(page: number, size: number, filters: Record<string, string> = {}) {
  return tryRead<Collection<PostSummary>>('/api/v1/posts', { page: String(page), page_size: String(size), ...filters });
}

export function readGallery(page: number, size: number) {
  return tryRead<Collection<LegacyImage>>('/api/v1/gallery', { page: String(page), page_size: String(size) });
}

export const readCategories = cache(() => tryRead<{ items: TaxonomyItem[] }>('/api/v1/categories'));

export function readFriends() {
  return tryRead<{ items: FriendLinkItem[] }>('/api/v1/links');
}

export function formatDay(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? legacyDateKey(date) : '';
}

export function dateOf(post: Pick<PostSummary, 'published_at' | 'created_at'>) {
  return formatDay(post.published_at || post.created_at);
}

export function friendHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
