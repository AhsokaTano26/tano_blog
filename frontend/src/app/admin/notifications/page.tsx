'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import { useState, useCallback } from 'react';
import { useLatestRequest, useFeedbackMutation } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { api } from '@/lib/api';
import { Bell, CheckCheck, MessageSquare, Link as LinkIcon, ExternalLink, LogIn, KeyRound } from 'lucide-react';

const typeIcons: Record<string, any> = {
  new_comment: MessageSquare,
  link_apply: LinkIcon,
  reply: MessageSquare,
  comment_approved: MessageSquare,
  login: LogIn,
  password_reset: KeyRound,
};

const typeLabels: Record<string, string> = {
  new_comment: '新评论',
  link_apply: '友链申请',
  reply: '回复',
  comment_approved: '评论通过',
  login: '登录',
  password_reset: '密码重置',
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, setData, loading, error, reload: load } = useLatestRequest(
    useCallback(() => api.getNotifications({ page: page.toString(), page_size: pageSize.toString() }), [page]), '加载通知失败');
  const notifications = data?.items || [];
  const total = data?.total || 0;
  const mutation = useFeedbackMutation();

  const handleMarkAllRead = async () => {
    await mutation.run(async () => { await api.markAllNotificationsRead(); await load(); }, '标记通知已读失败');
  };
  const handleMarkRead = async (id: string) => {
    await mutation.run(async () => {
      await api.markNotificationRead(id);
      setData(prev => prev ? { ...prev, items: prev.items.map(n => n.id === id ? { ...n, is_read: true } : n) } : prev);
    }, '标记通知已读失败');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">通知中心</h1>
        <button onClick={handleMarkAllRead} disabled={mutation.pending || loading || !data}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm btn-press">
          <CheckCheck className="w-4 h-4" />
          全部标记已读
        </button>
      </div>

      <RequestFeedback error={error} onRetry={load} pending={loading} />
      <RequestFeedback error={mutation.error} />
      {error ? null : loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
          暂无通知
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = typeIcons[n.type] || Bell;
            return (
              <div key={n.id}
                className={`flex items-start gap-4 p-4 rounded-xl transition-colors cursor-pointer ${
                  n.is_read ? 'bg-white/5 hover:bg-white/10' : 'bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15'
                }`}
                onClick={() => { if (n.link) window.location.href = n.link; }}>
                <div className={`p-2 rounded-lg ${
                  n.is_read ? 'bg-white/10' : 'bg-blue-500/20'
                }`}>
                  <Icon className={`w-5 h-5 ${n.is_read ? 'text-gray-400' : 'text-blue-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
                      {typeLabels[n.type] || n.type}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <div className="font-medium">{n.title}</div>
                  {n.content && (
                    <div className="text-sm text-gray-400 mt-1 line-clamp-2">{n.content}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(n.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!n.is_read && (
                    <Tooltip content="标记已读"><button onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors btn-press"
                      data-tooltip="标记已读" aria-label="标记已读">
                      <CheckCheck className="w-4 h-4 text-gray-400" />
                    </button></Tooltip>
                  )}
                  {n.link && (
                    <Tooltip content="查看详情"><a href={n.link} onClick={(e) => e.stopPropagation()}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors btn-press"
                      data-tooltip="查看详情" aria-label="查看详情">
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </a></Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-30 hover:bg-white/20 transition-colors text-sm">
            上一页
          </button>
          <span className="px-4 py-2 text-sm text-gray-400">
            {page} / {Math.ceil(total / pageSize)}
          </span>
          <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 rounded-lg bg-white/10 disabled:opacity-30 hover:bg-white/20 transition-colors text-sm">
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
