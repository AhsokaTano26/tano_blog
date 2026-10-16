import 'server-only';

export interface PostResponse {
  post: any;
  reactions?: Record<string, number>;
  user_emojis?: string[];
}

export class ServerPostError extends Error {
  constructor(public readonly status: number) {
    super(`Article API returned HTTP ${status}`);
  }
}

// The cookie belongs to this request only. No module-level or persistent cache
// may retain the response, which can contain an admin draft or unlocked article.
export async function fetchServerPost(slug: string, cookie: string, timeoutMs = 4000): Promise<PostResponse> {
  const upstream = process.env.API_UPSTREAM_URL || 'http://localhost:8080';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(`/api/v1/posts/${encodeURIComponent(slug)}`, upstream), {
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json', 'X-Render-Request': '1', ...(cookie ? { Cookie: cookie } : {}) },
      signal: controller.signal,
    });
    if (!response.ok) throw new ServerPostError(response.status);
    return await response.json() as PostResponse;
  } finally { clearTimeout(timeout); }
}
