'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import {
  Mail, Globe, Send, ExternalLink, User,
  Heart, Sparkles, Quote, Pen, BookHeart,
  MessageCircle, MapPin, CalendarDays, Clock
} from 'lucide-react';

const contactIcons: Record<string, any> = { email: Mail, telegram: Send, link: Globe };
const contactLabels: Record<string, string> = {
  email: '邮箱', github: 'GitHub', twitter: 'Twitter/X', bilibili: 'B站',
  telegram: 'Telegram', qq: 'QQ', link: '链接',
};

export default function AboutPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [postCount, setPostCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.getPublicConfig();
      setConfig(res.config || {});
    } catch {}
    try {
      const postsRes = await api.getPosts({ page: '1', page_size: '1' });
      setPostCount(postsRes.total || 0);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getContacts(): { type: string; value: string }[] {
    try { return JSON.parse(config.profile_contacts || '[]'); } catch { return []; }
  }

  function getContactUrl(type: string, value: string): string {
    switch (type) {
      case 'email': return `mailto:${value}`;
      case 'github': return `https://github.com/${value}`;
      case 'twitter': return `https://twitter.com/${value}`;
      case 'bilibili': return `https://space.bilibili.com/${value}`;
      case 'telegram': return `https://t.me/${value}`;
      case 'qq': return `https://wpa.qq.com/msgrd?v=3&uin=${value}&site=qq&menu=yes`;
      default: return value;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loading />
      </div>
    );
  }

  const name = config.profile_name || 'Tano';
  const bio = config.profile_bio || '';
  const avatar = config.profile_avatar || '/aimi.png';
  const aboutContent = config.about_content || '';
  const contacts = getContacts();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 relative">
      <style>{`
        /* Floating orbs */
        @keyframes orb-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -40px) scale(1.1); }
          50% { transform: translate(-20px, -60px) scale(0.9); }
          75% { transform: translate(-40px, -20px) scale(1.05); }
        }
        @keyframes orb-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-30px, 30px) scale(0.9); }
          50% { transform: translate(40px, 20px) scale(1.1); }
          75% { transform: translate(20px, -30px) scale(0.95); }
        }
        @keyframes orb-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, 20px) scale(1.1); }
          66% { transform: translate(-30px, -30px) scale(0.9); }
        }
        @keyframes ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes ring-spin-reverse {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(-360deg); }
        }
        @keyframes avatar-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes typewriter-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes shimmer-card {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes stat-pop {
          0% { transform: scale(0.8); opacity: 0; }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          z-index: 0;
        }
        .orb-1 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, hsla(var(--hue,225), 70%, 55%, 0.15), transparent 70%);
          top: -100px; left: -100px;
          animation: orb-float 20s ease-in-out infinite;
        }
        .orb-2 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, hsla(320, 70%, 55%, 0.1), transparent 70%);
          top: 200px; right: -80px;
          animation: orb-float-2 18s ease-in-out infinite;
        }
        .orb-3 {
          width: 250px; height: 250px;
          background: radial-gradient(circle, hsla(180, 70%, 55%, 0.08), transparent 70%);
          bottom: 100px; left: 50px;
          animation: orb-float-3 22s ease-in-out infinite;
        }

        .avatar-ring-outer {
          position: absolute;
          top: 50%; left: 50%;
          width: 150px; height: 150px;
          border-radius: 50%;
          background: conic-gradient(from 0deg,
            hsl(var(--hue,225), 60%, 55%),
            hsla(320, 60%, 55%, 0.5),
            hsla(180, 60%, 55%, 0.5),
            hsl(var(--hue,225), 60%, 55%)
          );
          animation: ring-spin 4s linear infinite;
          opacity: 0.6;
        }
        .avatar-ring-inner {
          position: absolute;
          top: 50%; left: 50%;
          width: 160px; height: 160px;
          border-radius: 50%;
          background: conic-gradient(from 90deg,
            transparent,
            hsla(var(--hue,225), 60%, 55%, 0.3),
            transparent 60%
          );
          animation: ring-spin-reverse 3s linear infinite;
        }
        .avatar-glow {
          position: absolute;
          top: 50%; left: 50%;
          width: 130px; height: 130px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, var(--primary-glow), transparent 70%);
          animation: avatar-glow 3s ease-in-out infinite;
        }

        .stat-card {
          animation: stat-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }
        .stat-card:nth-child(1) { animation-delay: 0.1s; }
        .stat-card:nth-child(2) { animation-delay: 0.2s; }
        .stat-card:nth-child(3) { animation-delay: 0.3s; }

        .gradient-text {
          background: linear-gradient(135deg,
            hsl(var(--hue,225), 60%, 55%),
            hsl(320, 60%, 55%),
            hsl(var(--hue,225), 60%, 55%));
          background-size: 200% 200%;
          animation: gradient-shift 4s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .social-link-btn {
          position: relative;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .social-link-btn:hover {
          transform: translateY(-3px) scale(1.1);
        }
        .social-link-btn::after {
          content: attr(data-label);
          position: absolute;
          bottom: -28px;
          left: 50%;
          transform: translateX(-50%) scale(0.8);
          opacity: 0;
          white-space: nowrap;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 6px;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          color: var(--text-secondary);
          backdrop-filter: blur(12px);
        }
        .social-link-btn:hover::after {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }

        .section-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          opacity: 0.5;
        }
        .section-divider::before,
        .section-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--glass-border), transparent);
        }
        .section-divider-icon {
          animation: pulse-subtle 3s ease-in-out infinite;
        }
      `}</style>

      {/* Floating background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Profile hero card */}
      <div className="relative z-10 card-base rounded-2xl p-8 sm:p-10 text-center mb-7 overflow-hidden animate-fade-in-up">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, hsla(var(--hue,225), 60%, 55%, 0.15), transparent 70%)`,
          }}
        />

        <div className="relative">
          {/* Avatar with animated rings */}
          <div className="flex justify-center mb-6">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <div className="avatar-ring-outer" />
              <div className="avatar-ring-inner" />
              <div className="avatar-glow" />
              <div className="w-28 h-28 rounded-full overflow-hidden ring-2 ring-white/10 relative z-10
                transition-transform duration-500 hover:scale-110"
                style={{ boxShadow: '0 0 40px var(--primary-glow)' }}>
                <img src={avatar} alt={name}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" />
              </div>
            </div>
          </div>

          {/* Name with gradient */}
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 gradient-text">
            {name}
          </h1>

          {/* Bio with decorative quote */}
          {bio && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <Quote className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--primary)', opacity: 0.5 }} />
              <p className="text-base italic" style={{ color: 'var(--text-secondary)' }}>
                {bio}
              </p>
              <Quote className="w-3.5 h-3.5 flex-shrink-0 rotate-180" style={{ color: 'var(--primary)', opacity: 0.5 }} />
            </div>
          )}

          {/* Stats row */}
          <div className="flex justify-center gap-4 sm:gap-8 mb-7">
            {[
              { value: postCount, label: '文章', icon: Pen, desc: '累计创作' },
              { value: '·', label: '', icon: Sparkles, desc: '' },
              { value: '1', label: '站点', icon: Heart, desc: '热爱驱动' },
            ].map((stat, i) => (
              <div key={i}
                className="stat-card flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl min-w-[80px]"
                style={{ background: 'var(--surface-bg)' }}>
                <stat.icon className="w-4 h-4" style={{ color: i === 1 ? 'var(--primary-glow)' : 'var(--primary)' }} />
                <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
                {stat.label && (
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>{stat.label}</span>
                )}
              </div>
            ))}
          </div>

          {/* Social links */}
          {contacts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {contacts.map((c, i) => {
                const Icon = contactIcons[c.type] || Globe;
                return (
                  <a key={i}
                    href={getContactUrl(c.type, c.value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="social-link-btn flex items-center justify-center w-11 h-11 rounded-xl glass-card"
                    style={{ color: 'var(--text-secondary)' }}
                    data-label={contactLabels[c.type] || c.type}
                    title={c.value}>
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* About content */}
      <div className="relative z-10">
        {/* Decorative section divider */}
        <div className="section-divider my-8">
          <Sparkles className="w-4 h-4 section-divider-icon" style={{ color: 'var(--primary)' }} />
        </div>

        {aboutContent ? (
          <div className="card-base rounded-2xl p-6 sm:p-8 animate-fade-in-up prose prose-sm max-w-none"
            style={{ color: 'var(--text-primary)', animationDelay: '0.1s' }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSlug]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="hover:underline inline-flex items-center gap-0.5"
                    style={{ color: 'var(--primary)' }}>
                    {children}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ),
                img: ({ src, alt }) => (
                  <img src={src} alt={alt || ''}
                    className="rounded-xl max-w-full shadow-lg"
                    style={{ maxHeight: '400px' }}
                    loading="lazy"
                  />
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 pl-4 py-2 my-6 rounded-r-lg relative"
                    style={{
                      borderColor: 'var(--primary)',
                      background: 'var(--primary-sub)',
                      color: 'var(--text-secondary)',
                    }}>
                    <Quote className="w-4 h-4 absolute -top-2 -left-1 opacity-30" style={{ color: 'var(--primary)' }} />
                    {children}
                  </blockquote>
                ),
                code: ({ className, children, ...props }: any) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="px-1.5 py-0.5 rounded text-sm font-medium"
                        style={{ background: 'var(--btn-card-bg)', color: 'var(--primary)' }}
                        {...props}>{children}</code>
                    );
                  }
                  return <code className={className} {...props}
                    style={{ background: 'var(--glass-bg)' }}>{children}</code>;
                },
                pre: ({ children }) => (
                  <pre className="p-4 rounded-xl overflow-x-auto shadow-inner"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    {children}
                  </pre>
                ),
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-10 mb-4 pb-2"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)' }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mt-8 mb-3 pb-1.5 flex items-center gap-2"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)' }}>
                    <BookHeart className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-semibold mt-6 mb-2"
                    style={{ color: 'var(--text-primary)' }}>
                    {children}
                  </h3>
                ),
                hr: () => (
                  <div className="section-divider my-8">
                    <Sparkles className="w-3 h-3 section-divider-icon" style={{ color: 'var(--primary)' }} />
                  </div>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-1.5 my-4" style={{ color: 'var(--text-secondary)' }}>
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="space-y-1.5 my-4" style={{ color: 'var(--text-secondary)' }}>
                    {children}
                  </ol>
                ),
              }}
            >
              {aboutContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="card-base rounded-2xl p-10 text-center animate-fade-in-up"
            style={{ animationDelay: '0.1s' }}>
            <div className="relative inline-flex mb-4">
              <User className="w-14 h-14" style={{ color: 'var(--text-info)', opacity: 0.4 }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-info)' }}>
              管理员还没有填写关于页面内容
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-info)', opacity: 0.6 }}>
              前往后台「设置 - 个人资料」填写
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
