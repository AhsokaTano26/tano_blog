'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Checkbox } from '@/components/ConfirmDialog';

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login({ username, password, remember_me: rememberMe });
      if (res.totp_required && res.user_id) {
        setTotpRequired(true);
        setUserId(res.user_id);
      } else {
        window.location.href = '/admin';
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleTOTP() {
    setError('');
    setLoading(true);
    try {
      await api.loginWithTOTP({ user_id: userId, code: totpCode, remember_me: rememberMe });
      window.location.href = '/admin';
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handlePasskeyLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await api.passkeyLoginOptions();
      const pk = res.publicKey || res;
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBuffer(pk.challenge),
          timeout: pk.timeout,
          rpId: pk.rpId,
          userVerification: 'preferred',
        },
      }) as PublicKeyCredential;
      const assertion = credential as any;
      await api.passkeyLoginVerify({
        id: assertion.id,
        rawId: assertion.id,
        type: 'public-key',
        response: {
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          signature: bufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufferToBase64url(assertion.response.userHandle) : null,
        },
      });
      window.location.href = '/admin';
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Passkey 验证已取消' : (err.message || 'Passkey 登录失败'));
    }
    setLoading(false);
  }

  const inputStyle = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--color-bg)' }}>
      {/* Background image with blur */}
      <div className="fixed inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: 'url(/2043253.jpg)', filter: 'blur(40px)' }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img src="/aimi.png" alt="Tano"
            className="w-14 h-14 rounded-2xl object-cover mx-auto mb-3"
            style={{ boxShadow: '0 0 24px var(--primary-glow)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Tano</h1>
        </div>

        {/* Login card */}
        <div className="glass-card rounded-2xl p-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm glass-card"
              style={{ color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {!totpRequired ? (
            <>
              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    用户名或邮箱地址
                  </label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    autoComplete="username" autoFocus required
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                    style={{ ...inputStyle, color: 'var(--text-primary)' }} />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    密码
                  </label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password" required
                      className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm outline-none glass-card"
                      style={{ ...inputStyle, color: 'var(--text-primary)' }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'var(--text-info)' }}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <Checkbox checked={rememberMe} onChange={setRememberMe} label="记住登录状态（7 天）" />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
                  {loading ? '登录中...' : '登录'}
                </button>
              </form>

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px" style={{ background: 'var(--glass-border)' }} />
                <span className="text-xs" style={{ color: 'var(--text-info)' }}>其他登录方式</span>
                <div className="flex-1 h-px" style={{ background: 'var(--glass-border)' }} />
              </div>

              <button onClick={handlePasskeyLogin} disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm btn-glass disabled:opacity-50"
                style={{ color: 'var(--text-secondary)' }}>
                <KeyRound className="w-4 h-4" />
                通行密钥
              </button>

              <div className="mt-4 text-center">
                <a href="/admin/forgot-password" className="text-xs hover:underline" style={{ color: 'var(--text-info)' }}>
                  忘记密码？
                </a>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>请输入两步验证码</p>
              <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value)}
                placeholder="6 位验证码" autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card mb-4"
                style={{ ...inputStyle, color: 'var(--text-primary)' }} />
              <button onClick={handleTOTP} disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
                {loading ? '验证中...' : '验证'}
              </button>
            </div>
          )}
        </div>

        {/* Back */}
        <div className="mt-8 text-center">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--text-info)' }}>
            <ArrowLeft className="w-4 h-4" />
            返回网站
          </a>
        </div>
      </div>
    </div>
  );
}
