'use client';

import { Input } from '@/components/ui/Input';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function ResetContent() {
  const searchParams = useSearchParams();
  // Next synchronizes replaceState with useSearchParams. Keep the original
  // token in this mounted form after removing it from the address bar.
  const [token] = useState(() => searchParams.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Clear token from URL after reading it to prevent leakage via referrer/sharing
  useEffect(() => {
    if (token) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('两次密码不一致');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.resetPassword(token, password);
      setMessage(res.message);
    } catch (err: any) {
      setError(err.message || '重置失败');
    }
    setLoading(false);
  }

  if (!token) {
    return (
      <div className="admin-auth min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div className="admin-auth-card glass-card rounded-2xl p-8 text-center">
          <h1 className="text-xl font-semibold mb-3">链接不可用</h1>
          <p role="alert" className="mb-4" style={{ color: 'var(--color-error)' }}>缺少重置令牌</p>
          <Link href="/admin/forgot-password" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>重新申请</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-auth min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="admin-auth-card glass-card rounded-2xl p-8">
          <h1 className="text-xl font-bold text-center mb-6" style={{ color: 'var(--text-primary)' }}>重置密码</h1>
          <p className="admin-auth-description">设置新的登录密码，完成后返回登录。</p>
          {message && (
            <div role="status" className="mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
              {message}
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-error)' }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="reset-password" className="admin-field-label">新密码</label>
            <Input id="reset-password" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="新密码（至少6位）" required minLength={6}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            <label htmlFor="reset-confirm" className="admin-field-label">确认新密码</label>
            <Input id="reset-confirm" autoComplete="new-password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="确认新密码" required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
              {loading ? '重置中...' : '重置密码'}
            </button>
          </form>
          {message && (
            <div className="mt-4 text-center">
              <Link href="/admin/login" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>去登录</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="admin-auth min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>加载中...</div>}>
      <ResetContent />
    </Suspense>
  );
}
