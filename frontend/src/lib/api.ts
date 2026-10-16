import { isPublicAuthRoute } from './auth-routes';
import { uploadFilename } from './editor-upload';
import { uploadForm, type UploadOptions } from './upload';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
  timeoutMs?: number;
}

// Browser-only cache: never share cookie-dependent data across server requests.
const publicRequests = new Map<string, { expires: number; promise: Promise<any> }>();
function publicRequest<T>(path: string, ttl = 60_000): Promise<T> {
  if (typeof window === 'undefined') return request<T>(path);
  const cached = publicRequests.get(path);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = request<T>(path).catch(error => {
    publicRequests.delete(path);
    throw error;
  });
  publicRequests.set(path, { expires: Date.now() + ttl, promise });
  return promise;
}

function getCSRFToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, timeoutMs = 30_000, signal: callerSignal, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const isMutating = fetchOptions.method && !['GET', 'HEAD', 'OPTIONS'].includes(fetchOptions.method.toUpperCase());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(isMutating ? { 'X-CSRF-Token': getCSRFToken() } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch {
    clearTimeout(timeout);
    if (signal.aborted) throw new Error(callerSignal?.aborted ? '请求已取消' : '请求超时，请重试');
    throw new Error('网络连接失败');
  }
  try {
  if (!res.ok) {
    // Optional authentication on public pages must never interrupt reading.
    if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/') && !isPublicAuthRoute(window.location.pathname)) {
      window.location.href = '/admin/login';
    }

    let errMsg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err.error) errMsg = err.error;
    } catch {}
    throw new Error(errMsg);
  }

  if (isMutating && (path.startsWith('/api/v1/admin/') || path.startsWith('/api/v1/auth/'))) publicRequests.clear();
  return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  // Public config
  getPublicConfig: () =>
    publicRequest<{ config: Record<string, string> }>('/api/v1/config/public'),
  getAboutConfig: () =>
    publicRequest<{ config: Record<string, string> }>('/api/v1/config/about'),
  getMusicConfig: () =>
    request<{ config: Record<string, string> }>('/api/v1/config/music'),

  // Posts
  getPosts: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/posts', { params }),
  getPost: (slug: string) =>
    request<{ post: any; reactions?: Record<string, number>; user_emojis?: string[] }>(`/api/v1/posts/${slug}`),
  recordPostView: (slug: string) =>
    request<{ reactions?: Record<string, number>; user_emojis?: string[] }>(`/api/v1/posts/${slug}/view`, { method: 'POST' }),
  getPostByPreview: (token: string) =>
    request<{ post: any }>('/api/v1/posts/preview', { params: { token } }),
  getTopPosts: () =>
    request<{ items: any[] }>('/api/v1/posts/top'),
  getTopViewed: () =>
    request<{ items: any[] }>('/api/v1/posts/top-viewed'),
  getArchive: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/archive', { params }),

  // Categories
  getCategories: () =>
    publicRequest<{ items: any[] }>('/api/v1/categories'),
  getCategory: (slug: string, params?: Record<string, string>) =>
    request<{ category: any; posts: any[]; total: number; page: number; size: number }>(`/api/v1/categories/${slug}`, { params }),

  // Tags
  getTags: () =>
    publicRequest<{ items: any[] }>('/api/v1/tags'),
  getTag: (slug: string, params?: Record<string, string>) =>
    request<{ tag: any; posts: any[]; total: number; page: number; size: number }>(`/api/v1/tags/${slug}`, { params }),

  // Comments
  getComments: (postId: string, sort?: string, params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>(`/api/v1/posts/${postId}/comments`, { params: { ...(sort ? { sort } : {}), ...params } }),
  createComment: (postId: string, data: any) =>
    request(`/api/v1/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Comments reactions
  toggleReaction: (slug: string, commentId: string, emoji: string) =>
    request<{ active: boolean; emoji: string }>(`/api/v1/posts/${slug}/comments/${commentId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  // Post reactions
  togglePostReaction: (slug: string, emoji: string) =>
    request<{ active: boolean; emoji: string }>(`/api/v1/posts/${slug}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  // Post calendar (public)
  getPostCalendar: (params: { year: string; month: string }) =>
    request<{ items: any[] }>('/api/v1/posts/calendar', { params }),

  // Series
  getSeries: () =>
    publicRequest<{ items: any[] }>('/api/v1/series'),
  getSeriesBySlug: (slug: string, params?: Record<string, string>) =>
    request<{ series: any; total: number; page: number; size: number }>(`/api/v1/series/${slug}`, { params }),
  getSeriesProgress: (slug: string, postSlug: string) =>
    request<{ position: number; total: number }>(`/api/v1/series/${slug}/progress`, { params: { post: postSlug } }),

  // Adjacent posts
  getAdjacentPosts: (slug: string) =>
    request<{ prev: { slug: string; title: string } | null; next: { slug: string; title: string } | null }>(`/api/v1/posts/${slug}/adjacent`),

  // Related posts
  getRelatedPosts: (slug: string) =>
    request<{ items: any[] }>(`/api/v1/posts/${slug}/related`),

  // Friend links
  getLinks: () =>
    request<{ items: any[] }>('/api/v1/links'),
  applyLink: (data: any) =>
    request('/api/v1/links/apply', { method: 'POST', body: JSON.stringify(data) }),
  getNavLinks: () =>
    request<{ items: any[] }>('/api/v1/nav-links'),

  // Gallery
  getGalleryImages: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/gallery', { params }),
  verifyPostPassword: (slug: string, password: string) =>
    request<{ verified: boolean }>(`/api/v1/posts/${slug}/verify-password`, { method: 'POST', body: JSON.stringify({ password }) }),

  // Music
  verifyMusicPassword: (password: string) =>
    request<{ success: boolean }>('/api/v1/music/verify-password', { method: 'POST', body: JSON.stringify({ password }) }),

  // Notifications
  getNotifications: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/notifications', { params }),
  getUnreadCount: () =>
    request<{ count: number }>('/api/v1/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request(`/api/v1/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request('/api/v1/notifications/read-all', { method: 'PATCH' }),

  // Auth
  login: (data: { username: string; password: string; remember_me?: boolean }) =>
    request<{ token: string; user: any; totp_required?: boolean; totp_token?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  loginWithTOTP: (data: { totp_token: string; code: string; remember_me?: boolean }) =>
    request('/api/v1/auth/login/totp', { method: 'POST', body: JSON.stringify(data) }),
  logout: () =>
    request('/api/v1/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ message: string; token?: string; reset_link?: string }>('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    request<{ message: string }>('/api/v1/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) }),
  getMe: () =>
    request<{ id: string; username: string; email: string; display_name: string; avatar_url: string; bio: string; role: string; totp_enabled: boolean }>('/api/v1/auth/me'),
  updateProfile: (data: { display_name?: string; email?: string; avatar_url?: string; bio?: string }) =>
    request('/api/v1/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data: { old_password: string; new_password: string }) =>
    request('/api/v1/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
  setupTOTP: () =>
    request<{ secret: string; qr_code: string }>('/api/v1/auth/totp/setup', { method: 'POST' }),
  verifyTOTP: (code: string) =>
    request('/api/v1/auth/totp/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  disableTOTP: () =>
    request('/api/v1/auth/totp', { method: 'DELETE' }),

  // Passkey
  passkeyLoginOptions: () =>
    request<any>('/api/v1/auth/passkey/login/options', { method: 'POST' }),
  passkeyLoginVerify: (data: any) =>
    request<{ token: string; user: any }>('/api/v1/auth/passkey/login/verify', { method: 'POST', body: JSON.stringify(data) }),
  passkeyRegisterOptions: () =>
    request<any>('/api/v1/auth/passkey/register/options', { method: 'POST' }),
  passkeyRegisterVerify: (data: any) =>
    request('/api/v1/auth/passkey/register/verify', { method: 'POST', body: JSON.stringify(data) }),
  passkeysList: () =>
    request<{ id: string; nickname: string; created_at: string }[]>('/api/v1/auth/passkeys'),
  passkeyDelete: (id: string) =>
    request(`/api/v1/auth/passkey/${id}`, { method: 'DELETE' }),
  passkeyRename: (id: string, nickname: string) =>
    request(`/api/v1/auth/passkey/${id}/rename`, { method: 'PUT', body: JSON.stringify({ nickname }) }),

  // Admin
  admin: {
    summary: () => publicRequest<{ posts: number; comments: number; media: number; categories: number; tags: number; pending_comments: number; pending_links: number }>('/api/v1/admin/summary', 5000),
    posts: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/posts', { params }),
      get: (id: string) =>
        request<{ post: any }>(`/api/v1/admin/posts/${id}`),
      create: (data: any) =>
        request('/api/v1/admin/posts', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request(`/api/v1/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request(`/api/v1/admin/posts/${id}`, { method: 'DELETE' }),
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      toggleTop: (id: string, isTop: boolean) =>
        request(`/api/v1/admin/posts/${id}/top`, { method: 'PATCH', body: JSON.stringify({ is_top: isTop }) }),
      batchUpdateStatus: (ids: string[], status: string) =>
        request('/api/v1/admin/posts/batch-status', { method: 'POST', body: JSON.stringify({ ids, status }) }),
      batchDelete: (ids: string[]) =>
        request('/api/v1/admin/posts/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
      revisions: {
        list: (postId: string) =>
          request<{ items: any[] }>(`/api/v1/admin/posts/${postId}/revisions`),
        restore: (postId: string, revId: string) =>
          request<{ post: any }>(`/api/v1/admin/posts/${postId}/revisions/${revId}/restore`, { method: 'POST' }),
      },
      generatePreviewToken: (postId: string) =>
        request<{ token: string }>(`/api/v1/admin/posts/${postId}/preview-token`, { method: 'POST' }),
      generateExcerpt: (postId: string) =>
        request<{ excerpt: string }>(`/api/v1/admin/posts/${postId}/generate-excerpt`, { method: 'POST' }),
      export: () => {
        window.open(`${API_BASE}/api/v1/admin/posts/export`, '_blank');
      },
      calendar: (params: { year: string; month: string }) =>
        request<{ items: any[] }>('/api/v1/admin/posts/calendar', { params }),
    },
    categories: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/categories', { params }),
      create: (data: any) => request('/api/v1/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/categories/${id}`, { method: 'DELETE' }),
    },
    tags: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/tags', { params }),
      create: (data: any) => request('/api/v1/admin/tags', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/tags/${id}`, { method: 'DELETE' }),
    },
    users: {
      list: () =>
        request<{ items: any[] }>('/api/v1/admin/users'),
    },
    comments: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/comments', { params }),
      update: (id: string, data: { content: string }) =>
        request(`/api/v1/admin/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      revisions: (id: string) =>
        request<{ items: any[] }>(`/api/v1/admin/comments/${id}/revisions`),
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/comments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      batchUpdateStatus: (ids: string[], status: string) =>
        request('/api/v1/admin/comments/batch-status', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
      delete: (id: string) =>
        request(`/api/v1/admin/comments/${id}`, { method: 'DELETE' }),
      exportComments: (params?: Record<string, string>) => {
        const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
        window.open(`${API_BASE}/api/v1/admin/comments/export${searchParams}`, '_blank');
      },
    },
    media: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/media', { params }),
      delete: (id: string) =>
        request(`/api/v1/admin/media/${id}`, { method: 'DELETE' }),
      batchDelete: (ids: string[]) =>
        request('/api/v1/admin/media/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
      batchUpdateTags: (ids: string[], tagIds: string[]) =>
        request('/api/v1/admin/media/batch-tag', { method: 'POST', body: JSON.stringify({ ids, tag_ids: tagIds }) }),
      upload: async (file: File, tagIds?: string[], options?: UploadOptions) => {
        const form = new FormData();
        form.append('file', file, uploadFilename(file));
        if (tagIds && tagIds.length > 0) form.append('tag_ids', tagIds.join(','));
        return uploadForm<{ media: { id: string; url: string; filename: string; thumbnail_url?: string } }>(`${API_BASE}/api/v1/admin/upload`, form, getCSRFToken(), options);
      },
      updateTags: (id: string, tagIds: string[]) =>
        request(`/api/v1/admin/media/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids: tagIds }) }),
      updateMetadata: (id: string, data: Record<string, string>) =>
        request(`/api/v1/admin/media/${id}/metadata`, { method: 'PUT', body: JSON.stringify(data) }),
      tags: {
        list: () => request<{ items: any[] }>('/api/v1/admin/media/tags'),
        create: (name: string) => request('/api/v1/admin/media/tags', { method: 'POST', body: JSON.stringify({ name }) }),
        delete: (id: string) => request(`/api/v1/admin/media/tags/${id}`, { method: 'DELETE' }),
      },
    },
    config: {
      get: () => request<{ config: Record<string, string> }>('/api/v1/admin/config'),
      update: async (data: Record<string, string>) => {
        const result = await request('/api/v1/admin/config', { method: 'PUT', body: JSON.stringify(data) });
        publicRequests.clear();
        return result;
      },
      testEmail: () =>
        request<{ message: string }>('/api/v1/admin/config/test-email', { method: 'POST' }),
    },
    checkVersion: (version?: string) =>
      request<{ latest: string; changelog?: string[] }>('/api/v1/admin/check-version' + (version ? `?version=${version}` : '')),
    series: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/series', { params }),
      create: (data: any) => request('/api/v1/admin/series', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/series/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/series/${id}`, { method: 'DELETE' }),
      listPosts: (id: string) => request<{ items: any[] }>(`/api/v1/admin/series/${id}/posts`),
      setPosts: (id: string, postIds: string[]) => request(`/api/v1/admin/series/${id}/posts`, { method: 'PUT', body: JSON.stringify({ post_ids: postIds }) }),
    },
    accessLogs: {
      overview: (params?: Record<string, string>) => request<{ stats: { total_requests: number; unique_ips: number; total_errors: number; avg_response_ms: number; daily_counts: { date: string; count: number }[] }; path: { name: string; count: number }[]; referrer: { name: string; count: number }[]; country: { name: string; count: number }[]; status: { name: string; count: number }[]; device: { name: string; count: number }[]; browser: { name: string; count: number }[]; os: { name: string; count: number }[]; hour: { hour: number; count: number }[] }>('/api/v1/admin/access-logs/overview', { params }),
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number; next_cursor: string }>('/api/v1/admin/access-logs', { params }),
      stats: () =>
        request<{ total_requests: number; unique_ips: number; total_errors: number; avg_response_ms: number; daily_counts: { date: string; count: number }[] }>('/api/v1/admin/access-logs/stats'),
      statsByDevice: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/device'),
      statsByBrowser: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/browser'),
      statsByOS: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/os'),
      statsByHour: () => request<{ items: { hour: number; count: number }[] }>('/api/v1/admin/access-logs/stats/hour'),
      statsByCountry: (params?: Record<string, string>) =>
        request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/country', { params }),
      statsByReferrer: (params?: Record<string, string>) =>
        request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/referrer', { params }),
      statsByPath: (params?: Record<string, string>) =>
        request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/path', { params }),
      statsByStatusCode: (params?: Record<string, string>) =>
        request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/status-code', { params }),
      statsTimeRange: (params: { start: string; end: string }) =>
        request<{ total_requests: number; unique_ips: number; total_errors: number; avg_response_ms: number; daily_counts: { date: string; count: number }[] }>('/api/v1/admin/access-logs/stats/time-range', { params }),
      export: (params?: Record<string, string>) => {
        const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
        window.open(`${API_BASE}/api/v1/admin/access-logs/export${searchParams}`, '_blank');
      },
      delete: (id: string) =>
        request(`/api/v1/admin/access-logs/${id}`, { method: 'DELETE' }),
      clear: () =>
        request('/api/v1/admin/access-logs/clear', { method: 'POST', body: JSON.stringify({ confirm: 'CLEAR_ALL' }) }),
    },
    backups: {
      status: () => request<{ running: boolean; phase: string; table: string; rows: number; bytes: number; error?: string }>('/api/v1/admin/backup/status'),
      cancel: () => request('/api/v1/admin/backup/cancel', { method: 'POST' }),
      list: () =>
        request<{ items: any[] }>('/api/v1/admin/backups'),
      create: (signal?: AbortSignal) =>
        request<{ message: string; filename: string }>('/api/v1/admin/backups', { method: 'POST', timeoutMs: 30 * 60_000, signal }),
      download: async (filename: string) => {
        const a = document.createElement('a');
        a.href = `${API_BASE}/api/v1/admin/backups/${encodeURIComponent(filename)}/download`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      delete: (filename: string) =>
        request(`/api/v1/admin/backups/${filename}`, { method: 'DELETE' }),
    },
    sync: {
      status: () => request<{ enabled: boolean; role: string; schedule_mode: string; last_status: string; last_message: string; last_finished_at: string; last_snapshot: string; running: boolean; has_private_key: boolean }>('/api/v1/admin/sync/status'),
      run: () => request<{ message: string }>('/api/v1/admin/sync/run', { method: 'POST' }),
    },
    restore: {
      upload: async (file: File, options?: UploadOptions) => {
        const form = new FormData();
        form.append('file', file);
        return uploadForm<{ message: string; warning?: string }>(`${API_BASE}/api/v1/admin/restore/upload`, form, getCSRFToken(), options);
      },
      url: (url: string, signal?: AbortSignal) =>
        request<{ message: string; warning?: string }>('/api/v1/admin/restore/url', {
          method: 'POST',
          timeoutMs: 30 * 60_000, signal,
          body: JSON.stringify({ url }),
        }),
      local: (filename: string, signal?: AbortSignal) =>
        request<{ message: string; warning?: string }>('/api/v1/admin/restore/local', {
          method: 'POST',
          timeoutMs: 30 * 60_000, signal,
          body: JSON.stringify({ filename }),
        }),
      clearAll: () =>
        request<{ message: string }>('/api/v1/admin/restore/clear-all', {
          method: 'POST',
          body: JSON.stringify({ confirm: 'CLEAR_ALL' }),
        }),
    },
    navLinks: {
      list: () =>
        request<{ items: any[] }>('/api/v1/admin/nav-links'),
      create: (data: any) =>
        request('/api/v1/admin/nav-links', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request(`/api/v1/admin/nav-links/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request(`/api/v1/admin/nav-links/${id}`, { method: 'DELETE' }),
      reorder: (ids: string[]) =>
        request('/api/v1/admin/nav-links/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
    },
    ipBans: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/ip-bans', { params }),
      create: (data: { ip_address: string; scope: string; reason?: string; expires_at?: string }) =>
        request('/api/v1/admin/ip-bans', { method: 'POST', body: JSON.stringify(data) }),
      remove: (id: string) =>
        request(`/api/v1/admin/ip-bans/${id}`, { method: 'DELETE' }),
      getConfig: () =>
        request<Record<string, string>>('/api/v1/admin/ip-bans/config'),
      updateConfig: (data: Record<string, string>) =>
        request('/api/v1/admin/ip-bans/config', { method: 'PUT', body: JSON.stringify(data) }),
    },
    links: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/links', { params }),
      create: (data: any) =>
        request('/api/v1/admin/links', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request(`/api/v1/admin/links/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/links/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      delete: (id: string) =>
        request(`/api/v1/admin/links/${id}`, { method: 'DELETE' }),
      exportLinks: (params?: Record<string, string>) => {
        const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
        window.open(`${API_BASE}/api/v1/admin/links/export${searchParams}`, '_blank');
      },
    },
    gallery: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/gallery', { params }),
      create: (data: { url: string; title?: string; description?: string; width?: number; height?: number }) =>
        request('/api/v1/admin/gallery', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request(`/api/v1/admin/gallery/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        request(`/api/v1/admin/gallery/${id}`, { method: 'DELETE' }),
      reorder: (items: { id: string; sort_order: number }[]) =>
        request('/api/v1/admin/gallery/reorder', { method: 'PUT', body: JSON.stringify({ items }) }),
      toggle: (url: string, title?: string) =>
        request<{ in_gallery: boolean; image?: any }>('/api/v1/admin/gallery/toggle', { method: 'POST', body: JSON.stringify({ url, title }) }),
    },
  },
};
