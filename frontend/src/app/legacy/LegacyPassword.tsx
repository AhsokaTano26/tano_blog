'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import styles from './portal.module.css';

export function LegacyPassword({ slug, hint }: { slug: string; hint?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!password || pending) return;
    setPending(true);
    setError('');
    try {
      await api.verifyPostPassword(encodeURIComponent(slug), password);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法验证密码，请重试');
      setPending(false);
    }
  }

  return (
    <form method="post" className={styles.password} onSubmit={unlock}>
      <label htmlFor="legacy-article-password">请输入文章密码</label>
      {hint && <p>密码提示：{hint}</p>}
      <div>
        <input id="legacy-article-password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit" disabled={pending}>{pending ? '验证中…' : '阅读文章'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
