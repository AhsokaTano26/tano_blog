'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { Menu, X, Sun, Moon, Palette, Search } from 'lucide-react';

const defaultNavLinks = [
  { href: '/', label: '首页' },
  { href: '/gallery', label: '图片' },
  { href: '/music', label: '音乐' },
  { href: '/archive', label: '归档' },
  { href: '/links', label: '友链' },
  { href: '/about', label: '关于' },
  { href: '/admin', label: '管理' },
];

export function Header() {
  const { theme, hue, setTheme, setHue } = useTheme();
  const pathname = usePathname();
  const [panel, setPanel] = useState<'menu' | 'hue' | null>(null);
  const [navLinks, setNavLinks] = useState(defaultNavLinks);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    api.getNavLinks().then(res => {
      if (!active) return;
      const seen = new Set(defaultNavLinks.map(link => link.href));
      const merged = [...defaultNavLinks];
      for (const item of res.items || []) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          merged.push({ href: item.url, label: item.title });
        }
      }
      setNavLinks(merged);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!panel) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnLayoutChange = () => setPanel(null);
    function handleOutside(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setPanel(null);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setPanel(null);
      (panel === 'menu' ? menuButtonRef : hueButtonRef).current?.focus();
    }
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleKey);
    desktop.addEventListener('change', closeOnLayoutChange);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      desktop.removeEventListener('change', closeOnLayoutChange);
    };
  }, [panel]);

  const isCurrent = (href: string) => href === '/'
    ? pathname === '/'
    : href.startsWith('/') && !href.startsWith('//') && (pathname === href || pathname.startsWith(`${href}/`));
  const closePanel = () => setPanel(null);
  const togglePanel = (next: 'menu' | 'hue') => setPanel(current => current === next ? null : next);
  const themeIsDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header-bar">
        <Link href="/" className="site-header-brand" onClick={closePanel} aria-label="朝花夕拾录 · 首页">
          <img src="/aimi.png" alt="" width={32} height={32} />
          <span>朝花夕拾录</span>
        </Link>

        <nav className="site-header-nav" aria-label="主导航">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href} className="site-header-link"
              aria-current={isCurrent(link.href) ? 'page' : undefined} onClick={closePanel}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-header-tools">
          <Clock />
          <Link href="/search" className="site-header-icon" aria-label="搜索" title="搜索"
            aria-current={pathname === '/search' ? 'page' : undefined} onClick={closePanel}>
            <Search size={18} />
          </Link>
          <div className="site-header-hue">
            <button ref={hueButtonRef} type="button" onClick={() => togglePanel('hue')}
              className="site-header-icon" title="主题色" aria-label="主题色"
              aria-expanded={panel === 'hue'} aria-controls="site-hue-panel">
              <Palette size={18} style={{ color: 'var(--primary)' }} />
            </button>
            {panel === 'hue' && <div id="site-hue-panel" className="site-header-popover site-header-hue-panel">
              <HueControl id="desktop-header-hue" hue={hue} onChange={setHue} />
            </div>}
          </div>
          <button type="button" onClick={() => setTheme(themeIsDark ? 'light' : 'dark')}
            className="site-header-icon" aria-label="切换主题" title={themeIsDark ? '切换到日间模式' : '切换到夜间模式'}>
            {themeIsDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button ref={menuButtonRef} type="button" onClick={() => togglePanel('menu')}
            className="site-header-icon site-header-menu-toggle" aria-label={panel === 'menu' ? '关闭菜单' : '打开菜单'}
            aria-expanded={panel === 'menu'} aria-controls="site-mobile-menu">
            {panel === 'menu' ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {panel === 'menu' && (
        <div id="site-mobile-menu" className="site-header-popover site-header-mobile-menu">
          <div className="site-header-menu-heading">探索小站</div>
          <nav aria-label="移动导航" className="site-header-menu-grid">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} className="site-header-link"
                aria-current={isCurrent(link.href) ? 'page' : undefined} onClick={closePanel}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="site-header-menu-appearance">
            <HueControl id="mobile-header-hue" hue={hue} onChange={setHue} />
          </div>
        </div>
      )}
    </header>
  );
}

function HueControl({ id, hue, onChange }: { id: string; hue: number; onChange: (hue: number) => void }) {
  return <div className="site-header-hue-control">
    <div className="site-header-hue-label"><label htmlFor={id}>主题色</label><span>{hue}°</span></div>
    <input id={id} type="range" min={0} max={360} value={hue}
      onChange={event => onChange(Number(event.target.value))} />
  </div>;
}

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date(Date.now() + 8 * 3600000).toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <time className="site-header-clock" aria-label={time ? `北京时间 ${time}` : '北京时间'}>{time || '00:00:00'}</time>;
}
