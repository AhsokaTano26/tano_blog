'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Bell, CheckCheck, MessageSquare, Link as LinkIcon, ExternalLink } from 'lucide-react';

const typeIcons: Record<string, any> = {
  new_comment: MessageSquare,
  link_apply: LinkIcon,
  reply: MessageSquare,
  comment_approved: MessageSquare,
};

const typeLabels: Record<string, string> = {
  new_comment: '新评论',
  link_apply: '友链申请',
  reply: '回复',
  comment_approved: '评论通过',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications({ page: page.toString(), page_size: pageSize.toString() });
      setNotifications(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    load();
  };

  const handleMarkRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">通知中心</h1>
        <button onClick={handleMarkAllRead}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm">
          <CheckCheck className="w-4 h-4" />
          全部标记已读
        </button>
      </div>

      {loading ? (
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
                className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${
                  n.is_read ? 'bg-white/5' : 'bg-blue-500/10 border border-blue-500/20'
                }`}>
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
                    <button onClick={() => handleMarkRead(n.id)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="标记已读">
                      <CheckCheck className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                  {n.link && (
                    <a href={n.link}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="查看详情">
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </a>
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
