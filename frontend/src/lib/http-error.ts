/** Preserve API reasons while making HTML/empty proxy failures actionable. */
export function httpErrorMessage(status: number, reason?: unknown): string {
  const hints: Record<number, string> = {
    400: '请求参数有误，请检查填写内容',
    401: '登录已失效，请重新登录',
    403: '没有执行此操作的权限',
    404: '请求的内容不存在或接口不可用',
    408: '请求超时，请重试',
    409: '当前状态冲突，请重新读取数据后重试',
    413: '提交内容或文件过大，请缩小后重试',
    429: '请求过于频繁，请稍后重试',
    500: '服务器处理失败，请查看服务日志',
    502: '后端服务连接失败，请检查服务状态',
    503: '服务暂时不可用，请稍后重试',
    504: '后端响应超时，请稍后重试',
  };
  const detail = typeof reason === 'string' ? reason.trim() : '';
  return `${detail || hints[status] || '请求失败'}（HTTP ${status}）`;
}
