'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import {
  FileText, FolderTree, Tags, MessageSquare, Image, Settings, ScrollText,
  LogOut, Home, Sun, Moon, Monitor, UserCircle, Database, LayoutDashboard,
  Bookmark, Link, Menu, Calendar, BarChart3, Bell, HelpCircle
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import NavLink from 'next/link';
import { Loading } from '@/components/Loading';
import { ConfirmProvider } from '@/components/ConfirmDialog';

const navSections = [
  {
    title: '内容',
    items: [
      { href: '/admin/posts', label: '文章', icon: FileText },
      { href: '/admin/calendar', label: '日历', icon: Calendar },
      { href: '/admin/categories', label: '分类', icon: FolderTree },
      { href: '/admin/tags', label: '标签', icon: Tags },
      { href: '/admin/comments', label: '评论', icon: MessageSquare },
      { href: '/admin/media', label: '附件', icon: Image },
      { href: '/admin/series', label: '系列', icon: Bookmark },
      { href: '/admin/links', label: '友链', icon: Link },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/admin/profile', label: '个人信息', icon: UserCircle },
      { href: '/admin/settings', label: '设置', icon: Settings },
      { href: '/admin/access-logs', label: '日志', icon: ScrollText },
      { href: '/admin/analytics', label: '统计', icon: BarChart3 },
      { href: '/admin/backup', label: '备份', icon: Database },
	      { href: '/admin/nav-links', label: '导航', icon: Menu },
      { href: '/admin/help', label: '帮助', icon: HelpCircle },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [notifCount, setNotifCount] = useState(0);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    api.getMe().then(setUser).catch(() => {
      if (!pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.admin.comments.list({ page: '1', page_size: '1', status: 'pending' }).catch(() => ({ total: 0 })),
      api.admin.links.list().catch(() => ({ items: [] })),
    ]).then(([commentsRes, linksRes]) => {
      const pendingLinks = linksRes?.items?.filter((i: any) => i.status === 'pending').length || 0;
      setPendingCounts({
        comments: commentsRes?.total || 0,
        links: pendingLinks,
      });
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchNotifCount = async () => {
      try {
        const res = await fetch('/api/v1/notifications/unread-count', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNotifCount(data.count);
        }
      } catch {}
    };
    fetchNotifCount();
    const interval = setInterval(fetchNotifCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Update document title with unread count
  useEffect(() => {
    const base = '管理后台';
    if (notifCount > 0) {
      document.title = `(${notifCount}) ${base}`;
    } else {
      document.title = base;
    }
  }, [notifCount]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <Loading />
      </div>
    );
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <Loading />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-200 ${collapsed ? 'w-[60px]' : 'w-[220px]'}`}
        style={{
          background: 'var(--glass-bg)',
          borderRight: '1px solid var(--glass-border)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <NavLink href="/admin" className="flex items-center gap-2 overflow-hidden group">
            <img src="/aimi.png" alt="T" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 transition-transform group-hover:scale-110" />
            {!collapsed && (
              <span className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>管理后台</span>
            )}
          </NavLink>
          <button onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-all hover:scale-110"
            style={{ color: 'var(--text-info)' }}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
            <Menu className="w-4 h-4 transition-transform duration-200" style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <NavLink href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}>
            <Home className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>前台首页</span>}
          </NavLink>

          <NavLink href="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 mt-1"
            style={{
              background: pathname === '/admin' ? 'var(--primary-sub)' : 'transparent',
              color: pathname === '/admin' ? 'var(--primary)' : 'var(--text-secondary)',
            }}>
            <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>概览</span>}
          </NavLink>

          {navSections.map((section) => (
            <div key={section.title} className="mt-4">
              {!collapsed && (
                <div className="px-3 mb-1.5 text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-info)' }}>
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const isActive = item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
                const badgeCount = item.href === '/admin/comments' ? pendingCounts.comments
                  : item.href === '/admin/links' ? pendingCounts.links : 0;
                return (
                  <NavLink key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all mb-0.5 relative ${collapsed && badgeCount > 0 ? 'relative' : ''}`}
                    style={{
                      background: isActive ? 'var(--primary-sub)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    }}>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full animate-fade-in"
                        style={{ background: 'var(--primary)' }} />
                    )}
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {!collapsed && badgeCount > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--color-error)', color: '#fff' }}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                    {collapsed && badgeCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ background: 'var(--color-error)' }} />
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {/* Notification bell */}
          <NavLink href="/admin/notifications"
            className={`flex items-center ${collapsed ? 'justify-center' : 'px-1'} mb-2 relative group`}>
            <div className="relative p-2 hover:bg-white/10 rounded-lg transition-colors btn-press">
              <Bell className="w-5 h-5" style={{ color: 'var(--text-info)' }} />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
                  {notifCount > 99 ? '99+' : notifCount}
                </span>
              )}
            </div>
            {!collapsed && <span className="text-sm" style={{ color: 'var(--text-info)' }}>通知</span>}
          </NavLink>

          {/* Theme switcher */}
          <div className={`flex items-center gap-1 mb-2 ${collapsed ? 'justify-center' : 'px-1'}`}>
            {([
              { value: 'light' as const, icon: Sun, label: '日间模式' },
              { value: 'system' as const, icon: Monitor, label: '跟随系统' },
              { value: 'dark' as const, icon: Moon, label: '夜间模式' },
            ]).map((opt) => (
              <button key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="p-1.5 rounded-lg transition-all btn-press"
                title={opt.label}
                style={{
                  background: theme === opt.value ? 'var(--primary-sub)' : 'transparent',
                  color: theme === opt.value ? 'var(--primary)' : 'var(--text-info)',
                }}>
                <opt.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <img src={user.avatar_url || '/aimi.png'} alt={user.display_name || user.username}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {user.display_name || user.username}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-info)' }}>
                  {user.role === 'admin' ? '管理员' : '用户'}
                </div>
              </div>
            )}
            {!collapsed && (
              <button onClick={async () => { await api.logout(); window.location.href = '/admin/login'; }}
                className="p-1 transition-all hover:opacity-80 btn-press" style={{ color: 'var(--text-info)' }}
                title="退出登录">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 min-w-0 transition-[margin] duration-200 animate-fade-in ${collapsed ? 'ml-[60px]' : 'ml-[220px]'}`}>
        <div className="p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </div>
      </main>
    </div>
  );
}
