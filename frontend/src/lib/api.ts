const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

function getCSRFToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const isMutating = fetchOptions.method && !['GET', 'HEAD', 'OPTIONS'].includes(fetchOptions.method.toUpperCase());

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(isMutating ? { 'X-CSRF-Token': getCSRFToken() } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch {
    throw new Error('网络连接失败');
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err.error) errMsg = err.error;
    } catch {}
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  // Public config
  getPublicConfig: () =>
    request<{ config: Record<string, string> }>('/api/v1/config/public'),

  // Posts
  getPosts: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/posts', { params }),
  getPost: (slug: string) =>
    request<{ post: any; reactions?: Record<string, number>; user_emojis?: string[] }>(`/api/v1/posts/${slug}`),
  getPostByPreview: (token: string) =>
    request<{ post: any }>('/api/v1/posts/preview', { params: { token } }),
  getTopPosts: () =>
    request<{ items: any[] }>('/api/v1/posts/top'),
  getTopViewed: () =>
    request<{ items: any[] }>('/api/v1/posts/top-viewed'),
  getArchive: () =>
    request<{ items: any[] }>('/api/v1/archive'),

  // Categories
  getCategories: () =>
    request<{ items: any[] }>('/api/v1/categories'),
  getCategory: (slug: string, params?: Record<string, string>) =>
    request<{ category: any; posts: any[]; total: number; page: number; size: number }>(`/api/v1/categories/${slug}`, { params }),

  // Tags
  getTags: () =>
    request<{ items: any[] }>('/api/v1/tags'),
  getTag: (slug: string, params?: Record<string, string>) =>
    request<{ tag: any; posts: any[]; total: number; page: number; size: number }>(`/api/v1/tags/${slug}`, { params }),

  // Comments
  getComments: (postId: string, sort?: string) =>
    request<{ items: any[] }>(`/api/v1/posts/${postId}/comments`, { params: sort ? { sort } : undefined }),
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

  // Series
  getSeries: () =>
    request<{ items: any[] }>('/api/v1/series'),
  getSeriesBySlug: (slug: string) =>
    request<{ series: any }>(`/api/v1/series/${slug}`),

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
  verifyPostPassword: (slug: string, password: string) =>
    request<{ verified: boolean }>(`/api/v1/posts/${slug}/verify-password`, { method: 'POST', body: JSON.stringify({ password }) }),

  // Auth
  login: (data: { username: string; password: string; remember_me?: boolean }) =>
    request<{ token: string; user: any; totp_required?: boolean; user_id?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  loginWithTOTP: (data: { user_id: string; code: string; remember_me?: boolean }) =>
    request('/api/v1/auth/login/totp', { method: 'POST', body: JSON.stringify(data) }),
  logout: () =>
    request('/api/v1/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ message: string; token?: string }>('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
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
      export: () => {
        window.open(`${API_BASE}/api/v1/admin/posts/export`, '_blank');
      },
    },
    categories: {
      list: () => request('/api/v1/admin/categories'),
      create: (data: any) => request('/api/v1/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/categories/${id}`, { method: 'DELETE' }),
    },
    tags: {
      list: () => request('/api/v1/admin/tags'),
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
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/comments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      batchUpdateStatus: (ids: string[], status: string) =>
        request('/api/v1/admin/comments/batch-status', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
      delete: (id: string) =>
        request(`/api/v1/admin/comments/${id}`, { method: 'DELETE' }),
    },
    media: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/media', { params }),
      delete: (id: string) =>
        request(`/api/v1/admin/media/${id}`, { method: 'DELETE' }),
      upload: async (file: File, tagIds?: string[]) => {
        const form = new FormData();
        form.append('file', file);
        if (tagIds && tagIds.length > 0) form.append('tag_ids', tagIds.join(','));
        const res = await fetch(`${API_BASE}/api/v1/admin/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': getCSRFToken() },
          body: form,
        });
        if (!res.ok) throw new Error('上传失败');
        return res.json();
      },
      updateTags: (id: string, tagIds: string[]) =>
        request(`/api/v1/admin/media/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids: tagIds }) }),
      tags: {
        list: () => request<{ items: any[] }>('/api/v1/admin/media/tags'),
        create: (name: string) => request('/api/v1/admin/media/tags', { method: 'POST', body: JSON.stringify({ name }) }),
        delete: (id: string) => request(`/api/v1/admin/media/tags/${id}`, { method: 'DELETE' }),
      },
    },
    config: {
      get: () => request<{ config: Record<string, string> }>('/api/v1/admin/config'),
      update: (data: Record<string, string>) =>
        request('/api/v1/admin/config', { method: 'PUT', body: JSON.stringify(data) }),
      testEmail: (to: string) =>
        request<{ message: string }>('/api/v1/admin/config/test-email', { method: 'POST', body: JSON.stringify({ to }) }),
    },
    series: {
      list: () => request<{ items: any[] }>('/api/v1/admin/series'),
      create: (data: any) => request('/api/v1/admin/series', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) => request(`/api/v1/admin/series/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) => request(`/api/v1/admin/series/${id}`, { method: 'DELETE' }),
      listPosts: (id: string) => request<{ items: any[] }>(`/api/v1/admin/series/${id}/posts`),
      setPosts: (id: string, postIds: string[]) => request(`/api/v1/admin/series/${id}/posts`, { method: 'PUT', body: JSON.stringify({ post_ids: postIds }) }),
    },
    accessLogs: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/access-logs', { params }),
      stats: () =>
        request<{ total_requests: number; unique_ips: number; total_errors: number; avg_response_ms: number; daily_counts: { date: string; count: number }[] }>('/api/v1/admin/access-logs/stats'),
      statsByDevice: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/device'),
      statsByBrowser: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/browser'),
      statsByOS: () => request<{ items: { name: string; count: number }[] }>('/api/v1/admin/access-logs/stats/os'),
      statsByHour: () => request<{ items: { hour: number; count: number }[] }>('/api/v1/admin/access-logs/stats/hour'),
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
      list: () =>
        request<{ items: any[] }>('/api/v1/admin/backups'),
      create: () =>
        request<{ message: string; filename: string }>('/api/v1/admin/backups', { method: 'POST' }),
      download: (filename: string) => {
        window.open(`${API_BASE}/api/v1/admin/backups/${filename}/download`, '_blank');
      },
      delete: (filename: string) =>
        request(`/api/v1/admin/backups/${filename}`, { method: 'DELETE' }),
    },
    restore: {
      upload: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API_BASE}/api/v1/admin/restore/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': getCSRFToken() },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '恢复失败');
        }
        return res.json();
      },
      url: (url: string) =>
        request<{ message: string; warning?: string }>('/api/v1/admin/restore/url', {
          method: 'POST',
          body: JSON.stringify({ url }),
        }),
      local: (filename: string) =>
        request<{ message: string; warning?: string }>('/api/v1/admin/restore/local', {
          method: 'POST',
          body: JSON.stringify({ filename }),
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
    links: {
      list: () =>
        request<{ items: any[] }>('/api/v1/admin/links'),
      create: (data: any) =>
        request('/api/v1/admin/links', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request(`/api/v1/admin/links/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/links/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      delete: (id: string) =>
        request(`/api/v1/admin/links/${id}`, { method: 'DELETE' }),
    },
  },
};
