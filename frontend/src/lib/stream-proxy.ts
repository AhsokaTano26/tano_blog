type UploadPath = '/api/v1/admin/upload' | '/api/v1/admin/restore/upload';

/** These fixed routes bypass the rewrite proxy's cloned-body buffering. */
export async function streamUpload(request: Request, path: UploadPath): Promise<Response> {
  const upstream = new URL(path, process.env.API_UPSTREAM_URL || 'http://localhost:8080');
  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'cookie', 'x-csrf-token', 'authorization', 'origin', 'referer', 'user-agent']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set('accept-encoding', 'identity');
  try {
    const options: RequestInit & { duplex: 'half' } = {
      method: 'POST', headers, body: request.body, duplex: 'half',
      cache: 'no-store', redirect: 'manual', signal: request.signal,
    };
    const response = await fetch(upstream, options);
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'cache-control', 'content-disposition', 'retry-after', 'location']) {
      const value = response.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: request.signal.aborted ? '上传已取消' : '上传服务暂时不可用' }, { status: request.signal.aborted ? 499 : 502 });
  }
}
