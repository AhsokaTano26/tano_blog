'use client';

import { useState } from 'react';
import { useTheme } from '@/lib/theme';
import { Menu, X, Sun, Moon } from 'lucide-react';

export function Header() {
  const { theme, hue, setTheme, setHue } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: '首页' },
    { href: '/archive', label: '归档' },
    { href: '/about', label: '关于' },
    { href: '/admin', label: '管理' },
  ];

  const huePresets = [
    { value: 0, label: '红' },
    { value: 200, label: '蓝绿' },
    { value: 225, label: '蓝' },
    { value: 250, label: '青' },
    { value: 280, label: '紫' },
    { value: 345, label: '粉' },
  ];

  return (
    <nav className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-1.5 rounded-2xl max-w-[92vw]"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 hsla(0, 0%, 100%, 0.05)',
      }}>
      {/* Logo */}
      <a href="/" className="flex items-center gap-2 mr-2 group">
        <img src="/aimi.png" alt="" className="w-7 h-7 rounded-lg object-cover transition-transform group-hover:scale-110" />
        <span className="font-bold text-sm hidden sm:inline" style={{ color: 'var(--primary)' }}>
          朝花夕拾录
        </span>
      </a>

      {/* Nav links */}
      <nav className="hidden md:flex items-center gap-0.5">
        {navLinks.map((link) => (
          <a key={link.href} href={link.href}
            className="px-3 py-1.5 rounded-xl text-sm transition-all hover:bg-white/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}>
            {link.label}
          </a>
        ))}
      </nav>

      {/* Divider */}
      <div className="hidden md:block w-px h-5 mx-1" style={{ background: 'var(--glass-border)' }} />

      {/* Hue picker */}
      <div className="hidden md:flex items-center gap-1">
        {huePresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setHue(preset.value)}
            className="w-5 h-5 rounded-full transition-all hover:scale-125"
            style={{
              background: `hsl(${preset.value}, 60%, 55%)`,
              boxShadow: hue === preset.value ? `0 0 8px hsl(${preset.value}, 60%, 55%)` : 'none',
              outline: hue === preset.value ? '2px solid hsla(0, 0%, 100%, 0.3)' : 'none',
              outlineOffset: '2px',
            }}
            title={preset.label}
          />
        ))}
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
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-xl text-sm transition-all hover:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}>
                {link.label}
              </a>
            ))}
            <div className="border-t my-2 pt-2" style={{ borderColor: 'var(--glass-border)' }}>
              <div className="flex gap-2 px-3 flex-wrap">
                {huePresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setHue(preset.value)}
                    className="w-6 h-6 rounded-full transition-all hover:scale-125"
                    style={{
                      background: `hsl(${preset.value}, 60%, 55%)`,
                      boxShadow: hue === preset.value ? `0 0 6px hsl(${preset.value}, 60%, 55%)` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
