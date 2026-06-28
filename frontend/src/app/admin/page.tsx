'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, MessageSquare, Image, Eye, Activity, PenSquare, MessageCircle, Upload, Settings, TrendingUp } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [counts, setCounts] = useState({ posts: 0, comments: 0, media: 0 });
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.admin.accessLogs.stats().catch(() => null),
      api.admin.posts.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.admin.comments.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.admin.media.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.getTopViewed().catch(() => ({ items: [] })),
    ]).then(([statRes, postsRes, commentsRes, mediaRes, topViewedRes]) => {
      setStats(statRes);
      setCounts({
        posts: postsRes?.total || 0,
        comments: commentsRes?.total || 0,
        media: mediaRes?.total || 0,
      });
      setTopViewed(topViewedRes?.items?.slice(0, 5) || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Loading />;
  }

  const statCards = [
    { label: '文章', value: counts.posts, icon: FileText, color: 'hsl(210, 60%, 55%)', bg: 'hsla(210, 60%, 50%, 0.1)' },
    { label: '评论', value: counts.comments, icon: MessageSquare, color: 'hsl(142, 60%, 50%)', bg: 'hsla(142, 60%, 50%, 0.1)' },
    { label: '附件', value: counts.media, icon: Image, color: 'hsl(270, 60%, 55%)', bg: 'hsla(270, 60%, 50%, 0.1)' },
    { label: '访问量', value: stats?.total_requests || 0, icon: Eye, color: 'hsl(30, 60%, 55%)', bg: 'hsla(30, 60%, 50%, 0.1)' },
  ];

  const quickActions = [
    { label: '写文章', icon: PenSquare, href: '/admin/posts', color: 'hsl(210, 60%, 55%)' },
    { label: '评论管理', icon: MessageCircle, href: '/admin/comments', color: 'hsl(142, 60%, 50%)' },
    { label: '上传附件', icon: Upload, href: '/admin/media', color: 'hsl(270, 60%, 55%)' },
    { label: '系统设置', icon: Settings, href: '/admin/settings', color: 'var(--text-secondary)' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-5" style={{ color: 'var(--text-primary)' }}>概览</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="glass-card rounded-xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
              <card.icon className="w-6 h-6" style={{ color: card.color }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{card.value}</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick access */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>快捷入口</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <a key={action.label} href={action.href}
                className="flex items-center gap-3 p-3 rounded-lg btn-glass transition-colors group">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: action.color }}>
                  <action.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{action.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>最近动态</h2>
          <div className="space-y-3">
            {stats?.daily_counts?.slice(-5).reverse().map((day: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-sub)' }}>
                    <Activity className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>网站访问</div>
                    <div className="text-xs" style={{ color: 'var(--text-info)' }}>{day.date}</div>
                  </div>
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{day.count} 次</span>
              </div>
            ))}
            {(!stats?.daily_counts || stats.daily_counts.length === 0) && (
              <div className="text-center py-8 text-sm" style={{ color: 'var(--text-info)' }}>暂无动态</div>
            )}
          </div>
        </div>
      </div>

      {/* Visit trend chart */}
      {stats?.daily_counts && stats.daily_counts.length > 0 && (
        <div className="glass-card rounded-xl p-5 mt-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>访问趋势（近7天）</h2>
          <div className="flex items-end gap-2" style={{ height: '160px' }}>
            {stats.daily_counts.slice(-7).map((day: any, i: number) => {
              const maxCount = Math.max(...stats.daily_counts.slice(-7).map((d: any) => d.count), 1);
              const h = Math.max(4, Math.round((day.count / maxCount) * 140));
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{day.count}</span>
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: `${h}px`,
                      background: `linear-gradient(to top, var(--primary), color-mix(in srgb, var(--primary) 60%, white))`,
                    }}
                  />
                  <span className="text-xs truncate w-full text-center" style={{ color: 'var(--text-info)' }}>{day.date?.slice(5) || ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* System info */}
      <div className="glass-card rounded-xl p-5 mt-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>系统信息</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>独立 IP</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats?.unique_ips || 0}</div>
          </div>
          <div className="text-center p-4 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>平均响应</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats ? `${Math.round(stats.avg_response_ms)}ms` : '-'}</div>
          </div>
          <div className="text-center p-4 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>今日访问</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats?.daily_counts?.slice(-1)[0]?.count || 0}</div>
          </div>
          <div className="text-center p-4 rounded-lg" style={{ background: 'var(--surface-bg)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>错误请求</div>
            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats?.total_errors || 0}</div>
          </div>
        </div>
      </div>

      {/* Popular posts */}
      {topViewed.length > 0 && (
        <div className="glass-card rounded-xl p-5 mt-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>热门文章</h2>
          <div className="space-y-2">
            {topViewed.map((post: any, i: number) => (
              <a key={post.id} href={`/admin/posts`} className="flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:opacity-80">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: i < 3 ? 'var(--primary)' : 'var(--surface-bg)', color: i < 3 ? '#fff' : 'var(--text-secondary)' }}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{post.title}</div>
                </div>
                <div className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'var(--text-info)' }}>
                  <Eye className="w-3.5 h-3.5" />
                  {post.view_count || 0}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
