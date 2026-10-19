'use client';

import { useState, useEffect, useRef } from 'react';
import './admin.css';
import { api } from '@/lib/api';
import { isPublicAuthRoute } from '@/lib/auth-routes';
import { useTheme } from '@/lib/theme';
import {
  FileText, FolderTree, Tags, MessageSquare, Image, Settings, ScrollText,
  LogOut, Home, Sun, Moon, Monitor, UserCircle, Database, LayoutDashboard,
  Bookmark, Link, Menu, Calendar, BarChart3, Bell, HelpCircle, Music, X, Ban
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import NavLink from 'next/link';
import { Loading } from '@/components/Loading';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { WelcomeAnimation } from '@/components/WelcomeAnimation';

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
      { href: '/admin/gallery', label: '图片馆', icon: Image },
      { href: '/admin/music-page', label: '音乐馆', icon: Music },
      { href: '/admin/links', label: '友链', icon: Link },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/admin/profile', label: '个人信息', icon: UserCircle },
      { href: '/admin/settings', label: '设置', icon: Settings },
      { href: '/admin/access-logs', label: '日志', icon: ScrollText },
      { href: '/admin/blocked', label: '封禁', icon: Ban },
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [notifCount, setNotifCount] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuRef.current;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLButtonElement>('button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setMobileSidebarOpen(false); }
      if (event.key !== 'Tab' || !drawer) return;
      const controls = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keyboard); trigger?.focus(); };
  }, [mobileSidebarOpen]);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (isPublicAuthRoute(pathname)) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    api.getMe().then(u => {
      if (!active) return;
      setUser(u);
      // Force redirect to profile page if password must be changed
      if ((u as any).must_change_password && !pathname.includes('/admin/profile') && !isPublicAuthRoute(pathname)) {
        window.location.href = '/admin/profile?force_password=1';
      }
    }).catch(() => {
      if (active && !isPublicAuthRoute(pathname)) {
        window.location.href = '/admin/login';
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    if (user && sessionStorage.getItem('jl')) {
      sessionStorage.removeItem('jl');
      setShowWelcome(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.admin.summary().then(summary => {
      setPendingCounts({ comments: summary.pending_comments, links: summary.pending_links });
    }).catch(() => {});
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

  if (isPublicAuthRoute(pathname)) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <Loading />
      </div>
    );
  }


  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <Loading />
      </div>
    );
  }

  // Show welcome animation fullscreen on fresh login, no admin layout underneath
  if (showWelcome) {
    return <WelcomeAnimation user={user} onEnd={() => setShowWelcome(false)} />;
  }

  return (
      <div className="admin-shell min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-50 lg:hidden"
        style={{
          background: 'var(--glass-bg)',
          borderBottom: '1px solid var(--glass-border)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}>
        <button ref={menuRef} aria-label="打开导航" aria-expanded={mobileSidebarOpen} aria-controls="admin-mobile-navigation" onClick={() => setMobileSidebarOpen(true)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-secondary)' }}>
          <Menu className="w-5 h-5" />
        </button>
        <NavLink href="/admin" className="flex items-center gap-2">
          <img src="/aimi.png" alt="T" className="w-6 h-6 rounded object-cover" />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>管理后台</span>
        </NavLink>
        <div className="w-8" />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
          <aside id="admin-mobile-navigation" ref={drawerRef} role="dialog" aria-modal="true" aria-label="后台导航" className="admin-sidebar fixed top-0 left-0 h-full w-[260px] max-w-[85vw] z-50 flex flex-col lg:hidden animate-slide-right"
            style={{
              background: 'var(--glass-bg)',
              borderRight: '1px solid var(--glass-border)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
            }}>
            <div className="h-12 flex items-center justify-between px-4 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>管理后台</span>
              <button aria-label="关闭导航" onClick={() => setMobileSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-info)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-3 px-2">
              <button onClick={() => { setMobileSidebarOpen(false); window.location.href = '/'; }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 w-full text-left"
                style={{ color: 'var(--text-secondary)' }}>
                <Home className="w-4 h-4 flex-shrink-0" />
                <span>前台首页</span>
              </button>
              <button onClick={() => { setMobileSidebarOpen(false); window.location.href = '/admin'; }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 w-full text-left mt-1"
                style={{ background: pathname === '/admin' ? 'var(--primary-sub)' : 'transparent', color: pathname === '/admin' ? 'var(--primary)' : 'var(--text-secondary)' }}>
                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                <span>概览</span>
              </button>
              {navSections.map((section) => (
                <div key={section.title} className="mt-4">
                  <div className="px-3 mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                    const badgeCount = item.href === '/admin/comments' ? pendingCounts.comments : item.href === '/admin/links' ? pendingCounts.links : 0;
                    return (
                      <button key={item.href} onClick={() => { setMobileSidebarOpen(false); window.location.href = item.href; }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 w-full text-left mb-0.5"
                        style={{ background: isActive ? 'var(--primary-sub)' : 'transparent', color: isActive ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-error)', color: '#fff' }}>
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={user?.avatar_url || '/aimi.png'} alt="" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{user?.display_name || user?.username}</span>
                </div>
                <button onClick={async () => { await api.logout(); window.location.href = '/admin/login'; }}
                  aria-label="退出登录" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" style={{ color: 'var(--text-info)' }}>
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside className={`admin-sidebar hidden lg:flex fixed top-0 left-0 h-full z-50 flex-col transition-all duration-200 ${collapsed ? 'w-[72px]' : 'w-[220px]'}`}
        style={{
          background: 'var(--glass-bg)',
          borderRight: '1px solid var(--glass-border)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}>
        {/* Logo */}
        <div className={`h-14 flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'} flex-shrink-0`}
          style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <NavLink href="/admin" aria-label="管理后台" className={`items-center gap-2 overflow-hidden group ${collapsed ? 'hidden' : 'flex'}`}>
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
          <NavLink href="/" title="前台首页" aria-label="前台首页"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}>
            <Home className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>前台首页</span>}
          </NavLink>

          <NavLink href="/admin" title="概览" aria-label="概览" aria-current={pathname === '/admin' ? 'page' : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 mt-1 cursor-pointer"
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
                  <NavLink key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-label={item.label} aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all mb-0.5 relative cursor-pointer ${collapsed && badgeCount > 0 ? 'relative' : ''}`}
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
          <NavLink href="/admin/notifications" aria-label={`通知，${notifCount} 条未读`} title="通知"
            className={`flex items-center ${collapsed ? 'flex-col justify-center' : 'px-1'} mb-2 relative group`}>
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
          <div className={`flex items-center gap-1 mb-2 ${collapsed ? 'flex-col justify-center' : 'px-1'}`}>
            {([
              { value: 'light' as const, icon: Sun, label: '日间模式' },
              { value: 'system' as const, icon: Monitor, label: '跟随系统' },
              { value: 'dark' as const, icon: Moon, label: '夜间模式' },
            ]).map((opt) => (
              <button key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="p-1.5 rounded-lg transition-all btn-press"
                title={opt.label} aria-label={opt.label} aria-pressed={theme === opt.value}
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
      <main className={`flex-1 min-w-0 transition-[margin] duration-200 pt-12 lg:pt-0 ${collapsed ? 'ml-0 lg:ml-[72px]' : 'ml-0 lg:ml-[220px]'}`}>
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </div>
      </main>
    </div>
  );
}
