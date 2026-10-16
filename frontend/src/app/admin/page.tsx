'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, MessageSquare, Image, Eye, Activity, PenSquare, MessageCircle, Upload, Settings } from 'lucide-react';
import { Loading } from '@/components/Loading';
import VisitTrendChart from '@/components/VisitTrendChart';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [counts, setCounts] = useState({ posts: 0, comments: 0, media: 0 });
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [pendingComments, setPendingComments] = useState(0);
  const [pendingLinks, setPendingLinks] = useState(0);
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [tagsCount, setTagsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<{ device: any[]; browser: any[]; os: any[]; hour: any[] } | null>(null);

  useEffect(() => {
    Promise.all([
      api.admin.accessLogs.overview().catch(() => null),
      api.admin.summary().catch(() => null),
      api.getTopViewed().catch(() => ({ items: [] })),
    ]).then(([overview, summary, topViewedRes]) => {
      setStats(overview?.stats || null);
      setCounts({ posts: summary?.posts || 0, comments: summary?.comments || 0, media: summary?.media || 0 });
      setTopViewed(topViewedRes.items || []);
      setPendingComments(summary?.pending_comments || 0);
      setPendingLinks(summary?.pending_links || 0);
      setCategoriesCount(summary?.categories || 0);
      setTagsCount(summary?.tags || 0);
      setAnalytics(overview ? { device: overview.device, browser: overview.browser, os: overview.os, hour: overview.hour } : null);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Loading />;
  }

  const statCards = [
    { label: '文章', value: counts.posts, icon: FileText, color: 'hsl(210, 60%, 55%)', bg: 'hsla(210, 60%, 50%, 0.1)' },
    { label: '评论', value: counts.comments, icon: MessageSquare, color: 'hsl(142, 60%, 50%)', bg: 'hsla(142, 60%, 50%, 0.1)' },
    { label: '待审核评论', value: pendingComments, icon: MessageSquare, color: 'hsl(40, 80%, 55%)', bg: 'hsla(40, 80%, 50%, 0.1)' },
    { label: '待审核友链', value: pendingLinks, icon: MessageSquare, color: 'hsl(40, 80%, 55%)', bg: 'hsla(40, 80%, 50%, 0.1)' },
    { label: '附件', value: counts.media, icon: Image, color: 'hsl(270, 60%, 55%)', bg: 'hsla(270, 60%, 50%, 0.1)' },
    { label: '近30天访问量', value: stats?.total_requests || 0, icon: Eye, color: 'hsl(30, 60%, 55%)', bg: 'hsla(30, 60%, 50%, 0.1)' },
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
      <VisitTrendChart data={stats?.daily_counts ?? []} unavailable={!stats} />

      {/* System info */}
      <div className="glass-card rounded-xl p-5 mt-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>系统信息</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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

      {/* Analytics breakdowns */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Device breakdown */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>设备分布</h2>
            <div className="space-y-2">
              {analytics.device.slice(0, 6).map((d: any) => {
                const total = analytics.device.reduce((s: number, x: any) => s + x.count, 0);
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs w-16 truncate flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    <div className="flex-1 h-4 rounded-full" style={{ background: 'var(--btn-card-bg)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                    </div>
                    <span className="text-xs w-12 text-right" style={{ color: 'var(--text-info)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Browser breakdown */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>浏览器分布</h2>
            <div className="space-y-2">
              {analytics.browser.slice(0, 6).map((d: any) => {
                const total = analytics.browser.reduce((s: number, x: any) => s + x.count, 0);
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs w-20 truncate flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    <div className="flex-1 h-4 rounded-full" style={{ background: 'var(--btn-card-bg)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                    </div>
                    <span className="text-xs w-12 text-right" style={{ color: 'var(--text-info)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* OS breakdown */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>操作系统分布</h2>
            <div className="space-y-2">
              {analytics.os.slice(0, 6).map((d: any) => {
                const total = analytics.os.reduce((s: number, x: any) => s + x.count, 0);
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs w-20 truncate flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    <div className="flex-1 h-4 rounded-full" style={{ background: 'var(--btn-card-bg)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                    </div>
                    <span className="text-xs w-12 text-right" style={{ color: 'var(--text-info)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hourly distribution */}
          <div className="glass-card rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>热门时段</h2>
            <div className="flex items-end gap-1" style={{ height: '100px' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const found = analytics.hour.find((x: any) => x.hour === h);
                const count = found?.count || 0;
                const maxCount = Math.max(...analytics.hour.map((x: any) => x.count), 1);
                const barH = Math.max(4, Math.round((count / maxCount) * 80));
                return (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${h}时: ${count}次`}>
                    <div className="w-full rounded-t-sm transition-all" style={{ height: `${barH}px`, background: 'var(--primary)', opacity: 0.4 + (count / maxCount) * 0.6 }} />
                  </div>
                );
              })}
            </div>
            <div className="flex mt-1">
              <span className="text-[10px]" style={{ color: 'var(--text-info)' }}>0时</span>
              <span className="flex-1 text-center text-[10px]" style={{ color: 'var(--text-info)' }}>12时</span>
              <span className="text-[10px]" style={{ color: 'var(--text-info)' }}>24时</span>
            </div>
          </div>
        </div>
      )}

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
