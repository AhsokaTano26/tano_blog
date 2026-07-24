'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { ExternalLink, Link as LinkIcon, Send, CheckCircle } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { ScrollReveal } from '@/components/ScrollReveal';

export default function LinksPage() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [form, setForm] = useState({ name: '', url: '', description: '', avatar: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  // Turnstile
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  useEffect(() => {
    api.getLinks().then(res => {
      setLinks(res.items);
    }).catch(() => {
      setError('加载失败');
    }).finally(() => setLoading(false));

    api.getPublicConfig().then(res => {
      if (res.config?.turnstile_enabled === 'true' && res.config?.turnstile_sitekey && (res.config?.turnstile_modules || 'comment,link').split(',').map(s => s.trim()).includes('link')) {
        setTurnstileEnabled(true);
        setTurnstileSitekey(res.config.turnstile_sitekey);
        if (!document.querySelector('script[src*="turnstile"]')) {
          const script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
      }
    });
  }, []);

  // Render Turnstile widget
  useEffect(() => {
    if (!turnstileEnabled || !turnstileSitekey || !turnstileRef.current) return;
    const w = window as any;
    const check = () => {
      if (w.turnstile) {
        const id = w.turnstile.render(turnstileRef.current, {
          sitekey: turnstileSitekey,
          action: 'turnstile-link-v2',
          callback: (token: string) => setTurnstileToken(token),
        });
        turnstileWidgetId.current = id;
      } else {
        setTimeout(check, 200);
      }
    };
    check();
    return () => {
      if (w.turnstile && turnstileWidgetId.current) {
        try { w.turnstile.remove(turnstileWidgetId.current); } catch {}
      }
    };
  }, [turnstileEnabled, turnstileSitekey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) { setFormError('请输入网站名称'); return; }
    if (!form.url.trim()) { setFormError('请输入网站地址'); return; }
    try { new URL(form.url.startsWith('http') ? form.url : 'https://' + form.url); }
    catch { setFormError('请输入有效的网站地址'); return; }

    setSubmitting(true);
    api.applyLink({ ...form, cf_turnstile_response: turnstileToken }).then(() => {
      setSubmitted(true);
      setForm({ name: '', url: '', description: '', avatar: '', email: '' });
    }).catch((e) => {
      setFormError(e.message || '提交失败，请稍后重试');
    }).finally(() => setSubmitting(false));
  }

  if (loading) return <Loading />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <ScrollReveal>
      <div className="glass-card rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <LinkIcon className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>友情链接</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          欢迎交换友链！如需申请，请先添加本站链接，然后填写下方表单。
        </p>
      </div>
      </ScrollReveal>

      {/* Link list */}
      {error ? (
        <div className="text-center py-12">
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-sm btn-glass px-4 py-2 rounded-lg cursor-pointer" style={{ color: 'var(--primary)' }}>重试</button>
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-12">
          <LinkIcon className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>暂无友链</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          {links.map((link, index) => (
            <ScrollReveal key={link.id} className={`stagger-${(index % 4) + 1}`}>
              <a href={link.url} target="_blank" rel="noopener noreferrer"
                className="card-base group rounded-xl p-4 flex items-center gap-4 transition-all hover:scale-[1.02]"
                style={{ color: 'var(--text-primary)' }}>
                <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0"
                  style={{ background: 'var(--primary-sub)' }}>
                  {link.avatar ? (
                    <ImageWithFallback src={link.avatar} alt={link.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-bold"
                      style={{ color: 'var(--primary)' }}>
                      {link.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-1.5 transition-colors group-hover:text-[var(--primary)]">
                    {link.name}
                    <ExternalLink className="w-3.5 h-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  {link.description && (
                    <div className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-info)' }}>
                      {link.description}
                    </div>
                  )}
                </div>
              </a>
            </ScrollReveal>
          ))}
        </div>
      )}

      {/* Apply form */}
      <ScrollReveal>
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Send className="w-4 h-5" style={{ color: 'var(--primary)' }} />
          申请友链
        </h2>

        {submitted ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--primary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>申请已提交！</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>请等待管理员审核，审核通过后将会显示在列表中。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>网站名称 *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="你的网站名称" maxLength={100}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>网站地址 *</label>
                <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com" maxLength={500}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>描述</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="一句话描述你的网站" maxLength={500}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>头像链接</label>
                <input type="url" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))}
                  placeholder="https://example.com/avatar.png"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>邮箱</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="用于联系（选填）"
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
              </div>
            </div>

            {formError && (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{formError}</p>
            )}

            {turnstileEnabled && (
              <div ref={turnstileRef} />
            )}

            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--primary)' }}>
              <Send className="w-4 h-4" />
              {submitting ? '提交中...' : '提交申请'}
            </button>
          </form>
        )}
      </div>
      </ScrollReveal>
    </div>
  );
}
