'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetLink('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
      if (res.reset_link) {
        setResetLink(res.reset_link);
      }
    } catch (err: any) {
      setError(err.message || '发送失败');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="glass-card rounded-2xl p-8">
          <h1 className="text-xl font-bold text-center mb-6" style={{ color: 'var(--text-primary)' }}>忘记密码</h1>
          {message && (
            <div className="mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
              <p>{message}</p>
              {resetLink && (
                <a href={resetLink} className="block mt-2 break-all hover:underline font-medium"
                  style={{ color: 'var(--primary)' }}>
                  {resetLink}
                </a>
              )}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="请输入注册邮箱" required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
              {loading ? '发送中...' : '发送重置链接'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/admin/login" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>返回登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
