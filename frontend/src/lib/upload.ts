import { httpErrorMessage } from './http-error';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number | null;
}

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

/** XHR reports bytes sent without reading or copying the File into JavaScript. */
export function uploadForm<T>(url: string, form: FormData, csrfToken: string, options: UploadOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => new DOMException('上传已取消', 'AbortError');
    if (options.signal?.aborted) { reject(aborted()); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    xhr.open('POST', url);
    // A stalled transfer must release its queue worker, while allowing large
    // media and backup uploads to finish on slower connections.
    xhr.timeout = 30 * 60 * 1000;
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.addEventListener('progress', event => {
      options.onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : 0,
        percent: event.lengthComputable && event.total > 0 ? Math.min(100, event.loaded / event.total * 100) : null,
      });
    });
    xhr.addEventListener('load', () => {
      cleanup();
      let response: T & { error?: string };
      try { response = JSON.parse(xhr.responseText); }
      catch {
        reject(new Error(xhr.status >= 200 && xhr.status < 300 ? `上传响应无效 (HTTP ${xhr.status})` : httpErrorMessage(xhr.status)));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(response);
      else reject(new Error(httpErrorMessage(xhr.status, response?.error)));
    });
    xhr.addEventListener('error', () => { cleanup(); reject(new Error('网络连接失败')); });
    xhr.addEventListener('timeout', () => { cleanup(); reject(new Error('上传超时，请重试')); });
    xhr.addEventListener('abort', () => { cleanup(); reject(aborted()); });
    options.signal?.addEventListener('abort', abort, { once: true });
    try { xhr.send(form); }
    catch (error) { cleanup(); reject(error); }
  });
}
