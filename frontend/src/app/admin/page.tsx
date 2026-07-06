'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { FileText, MessageSquare, Image, Eye, Activity, PenSquare, MessageCircle, Upload, Settings, BarChart3, LineChart } from 'lucide-react';
import { Loading } from '@/components/Loading';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [counts, setCounts] = useState({ posts: 0, comments: 0, media: 0 });
  const [topViewed, setTopViewed] = useState<any[]>([]);
  const [pendingComments, setPendingComments] = useState(0);
  const [pendingLinks, setPendingLinks] = useState(0);
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [tagsCount, setTagsCount] = useState(0);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [loading, setLoading] = useState(true);
  const [chartWidth, setChartWidth] = useState(600);
  const chartRef = useRef<HTMLDivElement>(null);
  const [analytics, setAnalytics] = useState<{ device: any[]; browser: any[]; os: any[]; hour: any[] } | null>(null);

  useEffect(() => {
    Promise.all([
      api.admin.accessLogs.stats().catch(() => null),
      api.admin.posts.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.admin.comments.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.admin.media.list({ page: '1', page_size: '1' }).catch(() => ({ total: 0 })),
      api.getTopViewed().catch(() => ({ items: [] })),
      api.admin.comments.list({ page: '1', page_size: '1', status: 'pending' }).catch(() => ({ total: 0 })),
      api.admin.links.list().catch(() => ({ items: [] })),
      api.getCategories().catch(() => ({ items: [] })),
      api.getTags().catch(() => ({ items: [] })),
      api.admin.accessLogs.statsByDevice().catch(() => ({ items: [] })),
      api.admin.accessLogs.statsByBrowser().catch(() => ({ items: [] })),
      api.admin.accessLogs.statsByOS().catch(() => ({ items: [] })),
      api.admin.accessLogs.statsByHour().catch(() => ({ items: [] })),
    ]).then(([statRes, postsRes, commentsRes, mediaRes, topViewedRes, pendingCommentsRes, linksRes, categoriesRes, tagsRes, deviceRes, browserRes, osRes, hourRes]) => {
      setStats(statRes);
      setCounts({
        posts: postsRes?.total || 0,
        comments: commentsRes?.total || 0,
        media: mediaRes?.total || 0,
      });
      setTopViewed(topViewedRes?.items?.slice(0, 5) || []);
      setPendingComments(pendingCommentsRes?.total || 0);
      const pending = linksRes?.items?.filter((i: any) => i.status === 'pending').length || 0;
      setPendingLinks(pending);
      setCategoriesCount(categoriesRes?.items?.length || 0);
      setTagsCount(tagsRes?.items?.length || 0);
      setAnalytics({
        device: deviceRes?.items || [],
        browser: browserRes?.items || [],
        os: osRes?.items || [],
        hour: hourRes?.items || [],
      });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    ro.observe(el);
    setChartWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, [stats?.daily_counts]);

  if (loading) {
    return <Loading />;
  }

  const statCards = [
    { label: '文章', value: counts.posts, icon: FileText, color: 'hsl(210, 60%, 55%)', bg: 'hsla(210, 60%, 50%, 0.1)' },
    { label: '评论', value: counts.comments, icon: MessageSquare, color: 'hsl(142, 60%, 50%)', bg: 'hsla(142, 60%, 50%, 0.1)' },
    { label: '待审核评论', value: pendingComments, icon: MessageSquare, color: 'hsl(40, 80%, 55%)', bg: 'hsla(40, 80%, 50%, 0.1)' },
    { label: '待审核友链', value: pendingLinks, icon: MessageSquare, color: 'hsl(40, 80%, 55%)', bg: 'hsla(40, 80%, 50%, 0.1)' },
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
      {stats?.daily_counts && stats.daily_counts.length > 0 && (
        <div className="glass-card rounded-xl p-5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>访问趋势（近7天）</h2>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--btn-card-bg)' }}>
              <button onClick={() => setChartType('bar')}
                className="px-2.5 py-1 rounded-md text-xs transition-all"
                style={{
                  background: chartType === 'bar' ? 'var(--primary)' : 'transparent',
                  color: chartType === 'bar' ? '#fff' : 'var(--text-secondary)',
                }}>
                <BarChart3 className="w-3.5 h-3.5 inline mr-1" />柱状图
              </button>
              <button onClick={() => setChartType('line')}
                className="px-2.5 py-1 rounded-md text-xs transition-all"
                style={{
                  background: chartType === 'line' ? 'var(--primary)' : 'transparent',
                  color: chartType === 'line' ? '#fff' : 'var(--text-secondary)',
                }}>
                <LineChart className="w-3.5 h-3.5 inline mr-1" />折线图
              </button>
            </div>
          </div>
          {chartType === 'bar' ? (
            <div className="flex items-end gap-2" style={{ height: '160px' }}>
              {stats.daily_counts.map((day: any, i: number) => {
                const maxCount = Math.max(...stats.daily_counts.map((d: any) => d.count), 1);
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
          ) : (
            <div ref={chartRef} style={{ height: '160px', position: 'relative' }}>
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} 160`} style={{ pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {(() => {
                  const data = stats.daily_counts;
                  const maxV = Math.max(...data.map((d: any) => d.count), 1);
                  const padBottom = 24;
                  const padTop = 24;
                  const plotH = 160 - padTop - padBottom;
                  const pts = data.map((d: any, i: number) => {
                    const x = (i / (data.length - 1)) * chartWidth;
                    const y = padTop + plotH - (d.count / maxV) * plotH;
                    return `${x},${y}`;
                  });
                  const baseY = 160 - padBottom;
                  return (
                    <>
                      <polygon fill="url(#lineAreaGrad)" points={`0,${baseY} ${pts.join(' ')} ${chartWidth},${baseY}`} />
                      <polyline fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts.join(' ')} />
                    </>
                  );
                })()}
              </svg>
              {stats.daily_counts.map((d: any, i: number) => {
                const maxV = Math.max(...stats.daily_counts.map((x: any) => x.count), 1);
                const padBottom = 24;
                const padTop = 24;
                const plotH = 160 - padTop - padBottom;
                const left = (i / (stats.daily_counts.length - 1)) * 100;
                const cy = padBottom + (d.count / maxV) * plotH;
                return (
                  <div key={i} className="absolute" style={{ left: `${left}%`, bottom: `${cy}px`, transform: 'translateX(-50%) translateY(-4px)' }}>
                    <div className="flex flex-col items-center">
                      <span className="text-xs leading-none mb-1.5" style={{ color: 'var(--text-secondary)' }}>{d.count}</span>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-bg)', border: '2.5px solid', borderColor: 'var(--primary)' }} />
                    </div>
                  </div>
                );
              })}
              <div className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: '2px', height: '20px' }}>
                {stats.daily_counts.map((d: any, i: number) => (
                  <div key={i} className="absolute" style={{ left: `${(i / (stats.daily_counts.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-info)' }}>{d.date?.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
