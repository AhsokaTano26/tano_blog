'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import { Menu, X, Sun, Moon, Palette } from 'lucide-react';

export function Header() {
  const { theme, hue, setTheme, setHue } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hueOpen, setHueOpen] = useState(false);
  const hueRef = useRef<HTMLDivElement>(null);

  const defaultNavLinks = [
    { href: '/', label: '首页' },
    { href: '/archive', label: '归档' },
    { href: '/links', label: '友链' },
    { href: '/about', label: '关于' },
    { href: '/admin', label: '管理' },
  ];

  const [navLinks, setNavLinks] = useState(defaultNavLinks);

  useEffect(() => {
    api.getNavLinks().then(res => {
      const items = res.items || [];
      // Merge with defaults: always keep default nav links, append custom ones
      // Deduplicate by href so admin-added links that match defaults don't duplicate
      const customLinks = items.map((item: any) => ({ href: item.url, label: item.title }));
      const existingHrefs = new Set(defaultNavLinks.map(l => l.href));
      const merged = [...defaultNavLinks, ...customLinks.filter(l => !existingHrefs.has(l.href))];
      setNavLinks(merged);
    }).catch(() => {});
  }, []);

  // Close hue panel on outside click
  useEffect(() => {
    if (!hueOpen) return;
    function handleClick(e: MouseEvent) {
      if (hueRef.current && !hueRef.current.contains(e.target as Node)) {
        setHueOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [hueOpen]);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-1.5 rounded-2xl max-w-[92vw]"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 hsla(0, 0%, 100%, 0.05)',
      }}>
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mr-2 group">
        <img src="/aimi.png" alt="Tano" className="w-7 h-7 rounded-lg object-cover transition-transform group-hover:scale-110" />
        <span className="font-bold text-sm hidden sm:inline" style={{ color: 'var(--primary)' }}>
          朝花夕拾录
        </span>
      </Link>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-0.5">
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href}
            className="px-3 py-1.5 rounded-xl text-sm transition-all hover:bg-white/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Divider */}
      <div className="hidden md:block w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />

      {/* Hue picker button + slider */}
      <div className="hidden md:block relative" ref={hueRef}>
        <button
          onClick={() => setHueOpen(!hueOpen)}
          className="w-7 h-7 rounded-full transition-all hover:scale-110 flex items-center justify-center"
          style={{
            background: `hsl(${hue}, 60%, 55%)`,
            boxShadow: `0 0 8px hsla(${hue}, 60%, 55%, 0.4)`,
          }}
          title="主题色"
          aria-label="主题色"
        >
          <Palette className="w-3.5 h-3.5 text-white" />
        </button>

        {hueOpen && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 rounded-xl p-3 w-48"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.3)',
            }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: 'var(--text-info)' }}>主题色</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{hue}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => setHue(parseInt(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(0,60%,55%), hsl(60,60%,55%), hsl(120,60%,55%), hsl(180,60%,55%), hsl(240,60%,55%), hsl(300,60%,55%), hsl(360,60%,55%))`,
                accentColor: `hsl(${hue}, 60%, 55%)`,
              }}
            />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-xl transition-all hover:bg-white/5 dark:hover:bg-white/5"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="切换主题"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Mobile menu */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden p-2 rounded-xl transition-all hover:bg-white/5 dark:hover:bg-white/5"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="菜单"
      >
        {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 mt-2 rounded-2xl p-4"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.3)',
          }}>
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}>
                {link.label}
              </Link>
            ))}
            <div className="border-t my-2 pt-3" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="px-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>主题色</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{hue}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={hue}
                  onChange={(e) => setHue(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, hsl(0,60%,55%), hsl(60,60%,55%), hsl(120,60%,55%), hsl(180,60%,55%), hsl(240,60%,55%), hsl(300,60%,55%), hsl(360,60%,55%))`,
                    accentColor: `hsl(${hue}, 60%, 55%)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
