'use client';

import { Disclosure } from '@/components/ui/Disclosure';
import { Progress } from '@/components/ui/Progress';
import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, FileText, Image, MessageSquare, PenLine, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useLatestRequest } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import VisitTrendChart from '@/components/VisitTrendChart';
import SystemHealth from '@/components/SystemHealth';

export default function AdminDashboard() {
  const overview = useLatestRequest(useCallback(() => api.admin.accessLogs.overview(), []), '访问统计加载失败');
  const summary = useLatestRequest(useCallback(() => api.admin.summary(), []), '内容概况加载失败');
  const popular = useLatestRequest(useCallback(() => api.getTopViewed(), []), '热门文章加载失败');
  const stats = overview.data?.stats;
  const counts = summary.data;
  const value = (number: number | undefined) => number === undefined ? '—' : number.toLocaleString('zh-CN');
  const pending = counts ? counts.pending_comments + counts.pending_links : undefined;
  const cards = [
    { label: '文章', value: counts?.posts, icon: FileText, href: '/admin/posts', note: '管理已发布内容与草稿' },
    { label: '评论', value: counts?.comments, icon: MessageSquare, href: '/admin/comments', note: '查看读者的交流与反馈' },
    { label: '附件', value: counts?.media, icon: Image, href: '/admin/media', note: '图片、视频和文件' },
    { label: '近30天访问量', value: stats?.total_requests, icon: ArrowUpRight, href: '/admin/analytics', note: '查看完整访问统计' },
  ];

  return <div className="admin-dashboard">
    <header className="admin-page-heading">
      <div><p className="admin-eyebrow">你的创作空间</p><h1>概览</h1><p>继续写作，看看博客最近发生了什么。</p></div>
      <div className="admin-heading-actions">
        <Link href="/admin/media" className="admin-secondary-action"><Upload size={16} />管理附件</Link>
        <Link href="/admin/posts?compose=1" className="admin-primary-action"><PenLine size={16} />写文章</Link>
      </div>
    </header>
    <RequestFeedback error={summary.error} onRetry={summary.reload} pending={summary.loading} />
    <RequestFeedback error={overview.error} onRetry={overview.reload} pending={overview.loading} />
    <section className="admin-stat-strip" aria-label="内容与访问概况" aria-busy={summary.loading || overview.loading}>
      {cards.map(card => <Link key={card.label} href={card.href} className="admin-stat">
        <span className="admin-stat-label"><card.icon size={16} />{card.label}<ArrowUpRight size={14} className="ml-auto" /></span>
        <strong>{value(card.value)}</strong><span className="admin-stat-note">{card.note}</span>
      </Link>)}
    </section>
    <div className="admin-review-bar">
      <div><span className="admin-review-icon"><Check size={17} /></span><div><h2>{pending === undefined ? '待办事项' : pending > 0 ? `${pending} 项内容等待审核` : '待办已清，可以专心写作'}</h2><p>及时回应评论，维护博客与朋友的连接。</p></div></div>
      <div className="admin-review-links">
        <Link href="/admin/comments">待审核评论 <strong>{value(counts?.pending_comments)}</strong><ArrowUpRight size={14} /></Link>
        <Link href="/admin/links">待审核友链 <strong>{value(counts?.pending_links)}</strong><ArrowUpRight size={14} /></Link>
      </div>
    </div>
    <div className="admin-overview-grid">
      <div className="min-w-0"><VisitTrendChart data={stats?.daily_counts ?? []} unavailable={!stats} />
        <dl className="admin-traffic-summary">
          {[
            ['独立 IP', value(stats?.unique_ips)],
            ['平均响应', stats ? `${Math.round(stats.avg_response_ms)} ms` : '—'],
            ['今日访问', stats ? value(stats.daily_counts.at(-1)?.count ?? 0) : '—'],
            ['错误请求', value(stats?.total_errors)],
          ].map(([label, number]) => <div key={label}><dt>{label}</dt><dd>{number}</dd></div>)}
        </dl>
      </div>
      <section className="admin-panel admin-popular" aria-label="热门文章">
        <div className="admin-section-heading"><h2>读者在看</h2><Link href="/admin/posts">全部文章 <ArrowUpRight size={14} /></Link></div>
        <p className="admin-section-note">累计浏览最多的文章</p>
        <RequestFeedback error={popular.error} onRetry={popular.reload} pending={popular.loading} />
        {popular.loading && !popular.data ? <p role="status" className="admin-empty-note">正在读取文章…</p> : <ol className="admin-popular-list">
          {(popular.data?.items ?? []).slice(0, 5).map((post: { id: string; title: string; slug: string; view_count: number }, index: number) => <li key={post.id}>
            <span className="admin-rank">{String(index + 1).padStart(2, '0')}</span>
            <Link href={`/posts/${post.slug}`} target="_blank" rel="noopener noreferrer"><span>{post.title}</span><small>{value(post.view_count)} 次浏览</small></Link>
            <ArrowUpRight size={14} />
          </li>)}
        </ol>}
        {!popular.loading && !popular.error && !popular.data?.items.length && <p className="admin-empty-note">发布第一篇文章后，这里会显示读者关注的内容。</p>}
        <Link href="/admin/posts?compose=1" className="admin-text-action"><PenLine size={15} />把下一个想法写下来<ArrowUpRight size={14} /></Link>
      </section>
    </div>
    <SystemHealth />
    {overview.data && <Disclosure className="admin-panel admin-audience" title={<><span>访客画像</span><span>设备、浏览器、系统与活跃时段</span></>}>

      <div className="admin-audience-grid">
        {(['device', 'browser', 'os'] as const).map((key, index) => {
          const items = overview.data?.[key] ?? [];
          const total = items.reduce((sum, item) => sum + item.count, 0);
          return <section key={key}><h3>{['设备分布', '浏览器分布', '操作系统分布'][index]}</h3>
            {items.slice(0, 6).map(item => <div key={item.name} className="admin-distribution">
              <span>{({ desktop: '电脑', mobile: '手机', tablet: '平板', Unknown: '未知' } as Record<string, string>)[item.name] || item.name}</span>
              <Progress max={total || 1} value={item.count} aria-label={item.name} style={{ flex: 1, minWidth: 0, height: 8 }} /><span>{total ? Math.round(item.count / total * 100) : 0}%</span>
            </div>)}{!items.length && <p className="admin-empty-note">暂无访问数据</p>}
          </section>;
        })}
        <section><h3>热门时段</h3><p className="admin-section-note">按请求次数排序</p>
          {[...(overview.data.hour ?? [])].sort((a, b) => b.count - a.count).slice(0, 4).map(item => <p key={item.hour} className="admin-hour"><span>{String(item.hour).padStart(2, '0')}:00</span><span>{value(item.count)} 次</span></p>)}
        </section>
      </div>
    </Disclosure>}
  </div>;
}
