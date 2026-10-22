'use client';

import { useCallback } from 'react';
import { api } from '@/lib/api';
import { useLatestRequest } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';

/** Informational only; write permissions are always enforced by the server. */
export function AdminServerNotice() {
  const status = useLatestRequest(useCallback(() => api.admin.sync.status(), []), '读取主备状态失败');
  return <>
    <RequestFeedback error={status.error} onRetry={status.reload} pending={status.loading} />
    {status.data?.enabled && status.data.role === 'standby' &&
      <div role="status" className="mb-4 rounded-lg border p-3 text-sm" style={{ color: 'var(--text-primary)', borderColor: 'var(--glass-border)', background: 'var(--card-bg)' }}>
        当前为备服务器，只读模式。文章、附件、页脚等站点设置请在主服务器修改，完成同步后在本机生效；跨机同步配置可在本机调整。
        <button type="button" onClick={status.reload} disabled={status.loading} className="ml-2 underline underline-offset-2 disabled:opacity-50">刷新主备状态</button>
      </div>}
  </>;
}
