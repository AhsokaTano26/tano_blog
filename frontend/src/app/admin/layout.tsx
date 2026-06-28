'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import {
  FileText, FolderTree, Tags, MessageSquare, Image, Settings, ScrollText,
  LogOut, Home, Sun, Moon, Monitor, UserCircle, Database, LayoutDashboard
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Loading } from '@/components/Loading';

const navSections = [
  {
    title: '内容',
    items: [
      { href: '/admin/posts', label: '文章', icon: FileText },
      { href: '/admin/categories', label: '分类', icon: FolderTree },
      { href: '/admin/tags', label: '标签', icon: Tags },
      { href: '/admin/comments', label: '评论', icon: MessageSquare },
      { href: '/admin/media', label: '附件', icon: Image },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/admin/profile', label: '个人信息', icon: UserCircle },
      { href: '/admin/settings', label: '设置', icon: Settings },
      { href: '/admin/access-logs', label: '日志', icon: ScrollText },
      { href: '/admin/backup', label: '备份', icon: Database },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    api.getMe().then(setUser).catch(() => {
      if (!pathname.includes('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }).finally(() => setLoading(false));
  }, []);

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
        <div className="h-14 flex items-center px-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <a href="/admin" className="flex items-center gap-2 overflow-hidden">
            <img src="/aimi.png" alt="T" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            {!collapsed && (
              <span className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>管理后台</span>
            )}
          </a>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <a href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}>
            <Home className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>前台首页</span>}
          </a>

          <a href="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5 mt-1"
            style={{
              background: pathname === '/admin' ? 'var(--primary-sub)' : 'transparent',
              color: pathname === '/admin' ? 'var(--primary)' : 'var(--text-secondary)',
            }}>
            <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>概览</span>}
          </a>

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
                return (
                  <a key={item.href} href={item.href}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all mb-0.5"
                    style={{
                      background: isActive ? 'var(--primary-sub)' : 'transparent',
                      color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    }}>
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {/* Theme switcher */}
          <div className={`flex items-center gap-1 mb-2 ${collapsed ? 'justify-center' : 'px-1'}`}>
            {([
              { value: 'light' as const, icon: Sun, label: '日间模式' },
              { value: 'system' as const, icon: Monitor, label: '跟随系统' },
              { value: 'dark' as const, icon: Moon, label: '夜间模式' },
            ]).map((opt) => (
              <button key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="p-1.5 rounded-lg transition-all"
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
                className="p-1 transition-colors hover:opacity-80" style={{ color: 'var(--text-info)' }}
                title="退出登录">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 min-w-0 transition-all duration-200 ${collapsed ? 'ml-[60px]' : 'ml-[220px]'}`}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
