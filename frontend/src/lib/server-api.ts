import 'server-only';

/** Anonymous public reads only. User credentials and proxy identity stay on the incoming request. */
export async function fetchPublicApi<T>(path: string, params?: Record<string, string>, timeoutMs = 2000): Promise<T> {
  const upstream = process.env.API_UPSTREAM_URL || 'http://localhost:8080';
  const url = new URL(path, upstream);
  if (params) url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'X-Render-Request': '1' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Public API returned HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
