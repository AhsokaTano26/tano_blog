'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Returning to the legacy portal must recheck its server setting. */
import { useRef, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './legacy-login.module.css';

export function LegacyLogin({ title }: { title: string }) {
  const [challenge, setChallenge] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setError('');
    setPending(true);
    const fields = new FormData(event.currentTarget);
    try {
      if (challenge) {
        await api.loginWithTOTP({ totp_token: challenge, code: String(fields.get('code') ?? ''), remember_me: remember });
      } else {
        const result = await api.login({
          username: String(fields.get('username') ?? ''),
          password: String(fields.get('password') ?? ''),
          remember_me: fields.get('remember') === 'on',
        });
        if (result?.totp_required) {
          if (!result.totp_token) throw new Error('无法开始两步验证，请重新登录');
          setRemember(fields.get('remember') === 'on');
          setChallenge(result.totp_token);
          return;
        }
        if (typeof result?.user?.id !== 'string') throw new Error('暂时无法登录，请稍后重试');
      }
      try { sessionStorage.setItem('jl', '1'); } catch { /* The login cookie is already set. */ }
      // Load the admin interface from a fresh request with the new session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请稍后重试');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.stage}>
        <h1>{title}管理登录</h1>
        <div className={styles.frame}>
          <div className={styles.panel}>
            <h2>{challenge ? '两步验证' : '用户登录'}</h2>
            <div className={styles.panelBody}>
              <div className={styles.emblem} aria-hidden="true">
                <span />
                <KeyRound size={72} strokeWidth={1.5} />
              </div>
              <form className={styles.form} method="post" onSubmit={submit}>
                {error && <p role="alert" className={styles.error}>{error}</p>}
                {challenge ? (
                  <label className={styles.field} key="code">
                    <span>验证码</span>
                    <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required />
                  </label>
                ) : (
                  <>
                    <label className={styles.field}>
                      <span>用户名或邮箱</span>
                      <input name="username" autoComplete="username" required />
                    </label>
                    <label className={styles.field}>
                      <span>密码</span>
                      <input name="password" type="password" autoComplete="current-password" required />
                    </label>
                    <label className={styles.remember}><input type="checkbox" name="remember" />记住登录</label>
                  </>
                )}
                <div className={styles.actions}>
                  {challenge && <button className={styles.back} type="button" disabled={pending} onClick={() => { setChallenge(null); setError(''); }}>返回登录</button>}
                  <button className={styles.submit} type="submit" disabled={pending}>
                    {pending ? (challenge ? '验证中…' : '登录中…') : (challenge ? '验证' : '登录')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <nav className={styles.links} aria-label="登录帮助">
          <a href="/legacy">返回旧版首页</a>
          <a href="/admin/forgot-password">忘记密码</a>
          <a href="/admin/login">新版登录 / 通行密钥</a>
        </nav>
      </div>
    </main>
  );
}
