const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const res = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Posts
  getPosts: (params?: Record<string, string>) =>
    request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/posts', { params }),
  getPost: (slug: string) =>
    request<{ post: any }>(`/api/v1/posts/${slug}`),
  getTopPosts: () =>
    request<{ items: any[] }>('/api/v1/posts/top'),
  getArchive: () =>
    request<{ items: any[] }>('/api/v1/archive'),

  // Categories
  getCategories: () =>
    request<{ items: any[] }>('/api/v1/categories'),
  getCategory: (slug: string) =>
    request<{ category: any; posts: any[] }>(`/api/v1/categories/${slug}`),

  // Tags
  getTags: () =>
    request<{ items: any[] }>('/api/v1/tags'),
  getTag: (slug: string) =>
    request<{ tag: any; posts: any[] }>(`/api/v1/tags/${slug}`),

  // Comments
  getComments: (postId: string) =>
    request<{ items: any[] }>(`/api/v1/posts/${postId}/comments`),
  createComment: (postId: string, data: any) =>
    request(`/api/v1/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Auth
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: any; totp_required?: boolean; user_id?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  loginWithTOTP: (data: { user_id: string; code: string }) =>
    request('/api/v1/auth/login/totp', { method: 'POST', body: JSON.stringify(data) }),
  logout: () =>
    request('/api/v1/auth/logout', { method: 'POST' }),
  getMe: () =>
    request<{ id: string; username: string; display_name: string; avatar_url: string; role: string; totp_enabled: boolean }>('/api/v1/auth/me'),
  setupTOTP: () =>
    request<{ secret: string; qr_code: string }>('/api/v1/auth/totp/setup', { method: 'POST' }),
  verifyTOTP: (code: string) =>
    request('/api/v1/auth/totp/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  disableTOTP: () =>
    request('/api/v1/auth/totp', { method: 'DELETE' }),

  // Passkey
  passkeyLoginOptions: () =>
    request<{ challenge: string; timeout: number; rpId: string }>('/api/v1/auth/passkey/login/options', { method: 'POST' }),
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

  // Admin
  admin: {
    posts: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/posts', { params }),
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
    comments: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/comments', { params }),
      updateStatus: (id: string, status: string) =>
        request(`/api/v1/admin/comments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      delete: (id: string) =>
        request(`/api/v1/admin/comments/${id}`, { method: 'DELETE' }),
    },
    media: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/media', { params }),
      delete: (id: string) =>
        request(`/api/v1/admin/media/${id}`, { method: 'DELETE' }),
      upload: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API_BASE}/api/v1/admin/upload`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) throw new Error('上传失败');
        return res.json();
      },
    },
    config: {
      get: () => request<{ config: Record<string, string> }>('/api/v1/admin/config'),
      update: (data: Record<string, string>) =>
        request('/api/v1/admin/config', { method: 'PUT', body: JSON.stringify(data) }),
    },
    accessLogs: {
      list: (params?: Record<string, string>) =>
        request<{ items: any[]; total: number; page: number; size: number }>('/api/v1/admin/access-logs', { params }),
      stats: () =>
        request('/api/v1/admin/access-logs/stats'),
    },
  },
};
