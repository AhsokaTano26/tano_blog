'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { api } from '@/lib/api';
import type { FriendLinkItem } from '@/lib/admin-types';
import { useLatestRequest, requestError } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { Turnstile } from '@/components/Turnstile';
import { FriendAvatar, FriendDirectory, shuffleFriends } from '@/components/FriendDirectory';
import { Check, Copy, Send, CheckCircle, X } from 'lucide-react';
import { Loading } from '@/components/Loading';
import styles from './page.module.css';

export default function LinksPage() {
  const { data, loading, error, reload } = useLatestRequest(
    useCallback(async () => {
      const result = await api.getLinks();
      return { ...result, items: shuffleFriends(result.items || []) };
    }, []), '友链加载失败，请重试',
  );
  const links: FriendLinkItem[] = data?.items || [];
  const submittingRef = useRef(false);
  const [site, setSite] = useState({ name: '朝花夕拾录', description: '写代码，也记录日常。', url: '', avatar: '/aimi.webp' });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Form state
  const [applicationOpen, setApplicationOpen] = useState(false);
  const applicationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const doneButtonRef = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState({ name: '', url: '', description: '', avatar: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (applicationOpen && submitted) doneButtonRef.current?.focus();
  }, [applicationOpen, submitted]);

  function openApplication(event: React.MouseEvent<HTMLButtonElement>) {
    applicationTriggerRef.current = event.currentTarget;
    setSubmitted(false);
    setApplicationOpen(true);
  }

  // Turnstile
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [captchaAttempt, setCaptchaAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    api.getPublicConfig().then(res => {
      if (disposed) return;
      setSite({
        name: res.config?.site_title || '朝花夕拾录',
        description: res.config?.site_description || res.config?.profile_bio || '写代码，也记录日常。',
        url: res.config?.site_url || window.location.origin,
        avatar: res.config?.profile_avatar || '/aimi.webp',
      });
      if (res.config?.turnstile_enabled === 'true' && res.config?.turnstile_sitekey && (res.config?.turnstile_modules || 'comment,link').split(',').map(s => s.trim()).includes('link')) {
        setTurnstileEnabled(true);
        setTurnstileSitekey(res.config.turnstile_sitekey);
      }
    }).catch(() => {
      if (!disposed) setSite(current => ({ ...current, url: window.location.origin }));
      // Optional display configuration; the server enforces captcha policy.
    });
    return () => { disposed = true; };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError('');

    if (!form.name.trim()) { setFormError('请输入网站名称'); return; }
    if (!form.url.trim()) { setFormError('请输入网站地址'); return; }
    try { new URL(form.url.startsWith('http') ? form.url : 'https://' + form.url); }
    catch { setFormError('请输入有效的网站地址'); return; }

    submittingRef.current = true;
    setSubmitting(true);
    api.applyLink({ ...form, cf_turnstile_response: turnstileToken }).then(() => {
      setSubmitted(true);
      setForm({ name: '', url: '', description: '', avatar: '', email: '' });
    }).catch((e) => {
      setFormError(requestError(e, '提交失败，请稍后重试'));
      setCaptchaAttempt(value => value + 1);
    }).finally(() => { submittingRef.current = false; setSubmitting(false); });
  }


  async function copySite() {
    try {
      const avatar = new URL(site.avatar, site.url || window.location.origin).href;
      await navigator.clipboard.writeText(`名称：${site.name}\n网址：${site.url}\n简介：${site.description}\n头像：${avatar}`);
      setCopyState('copied');
    } catch { setCopyState('failed'); }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>友链</p>
          <h1>朋友们</h1>
          <p className={styles.intro}>在各自的小天地里，记录生活，也彼此照亮。</p>
        </div>
        <div className={styles.headerAside}>
          {!loading && !error && <p className={styles.count}><span>{links.length}</span> 位朋友</p>}
          <button type="button" onClick={openApplication} aria-haspopup="dialog">来交换友链 <Send size={13} aria-hidden="true" /></button>
        </div>
      </header>

      {loading ? <div className={styles.loading} aria-label="正在加载朋友们"><Loading /></div> : error ? (
        <RequestFeedback error={error} onRetry={reload} />
      ) : links.length === 0 ? (
        <div className={styles.empty}><p>这里还在等第一位朋友。</p><button type="button" onClick={openApplication} aria-haspopup="dialog">留下你的网站，来打个招呼。</button></div>
      ) : <FriendDirectory links={links} />}

      <section id="friend-application" className={styles.application} aria-labelledby="friend-application-title">
        <div className={styles.applicationInfo}>
          <p className={styles.eyebrow}>友链申请</p>
          <h2 id="friend-application-title">把你的坐标放进来</h2>
          <p className={styles.applicationIntro}>欢迎交换友链。先把本站添加到你的网站，再点击下方按钮，留下你的信息。</p>
          <ul className={styles.guidelines}>
            <li>分享自己的生活、作品或想法，让我们慢慢认识你。</li>
            <li>请提供能够正常访问的网站地址与头像链接。</li>
            <li>申请审核通过后，你的网站会出现在上方的朋友名单中。</li>
          </ul>

          <button type="button" className={styles.applyButton} onClick={openApplication} aria-haspopup="dialog">
            申请友链 <Send size={15} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.siteInfo}>
          <div className={styles.siteHeading}>
            <FriendAvatar link={{ name: site.name, avatar: site.avatar }} />
            <div><h3>{site.name}</h3><p>{site.description}</p></div>
          </div>
          <dl>
            <div><dt>站点名称</dt><dd>{site.name}</dd></div>
            <div><dt>站点地址</dt><dd><a href={site.url || '/'}>{site.url || '—'}</a></dd></div>
            <div><dt>站点简介</dt><dd>{site.description}</dd></div>
            <div><dt>头像链接</dt><dd><a href={site.avatar} target="_blank" rel="noopener noreferrer">查看头像 <span aria-hidden="true">↗</span></a></dd></div>
          </dl>
          <button type="button" className={styles.copyButton} onClick={copySite}>
            {copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copyState === 'copied' ? '已复制本站信息' : '复制本站信息'}
          </button>
          <p role="status" className={styles.copyFeedback}>{copyState === 'failed' ? '复制未成功，请从上方选取站点信息。' : ''}</p>
        </div>
      </section>

      <Dialog.Root open={applicationOpen} onOpenChange={setApplicationOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog} onOpenAutoFocus={event => {
            event.preventDefault();
            nameInputRef.current?.focus({ preventScroll: true });
          }} onCloseAutoFocus={event => {
            event.preventDefault();
            applicationTriggerRef.current?.focus({ preventScroll: true });
          }}>
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>LEAVE YOUR COORDINATES</p>
                <Dialog.Title className={styles.dialogTitle}>申请友链</Dialog.Title>
                <Dialog.Description className={styles.formHint}>很高兴在这里遇见你。标有 * 的项目为必填。</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className={styles.closeButton} aria-label="关闭申请弹窗"><X size={20} aria-hidden="true" /></button>
              </Dialog.Close>
            </div>
            {submitted ? (
              <>
                <div className={styles.success} role="status">
                  <CheckCircle size={32} aria-hidden="true" />
                  <h3>申请已提交</h3>
                  <p>请等待管理员审核，审核通过后就能在这里见到你了。</p>
                </div>
                <div className={styles.dialogActions}>
                  <Dialog.Close asChild><button ref={doneButtonRef} type="button" className={styles.submit}>完成</button></Dialog.Close>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form} aria-describedby={formError ? 'friend-form-error' : undefined}>
                <div className={styles.formBody}>
                  <div className={styles.field}>
                    <label htmlFor="friend-name">网站名称 <span>*</span></label>
                    <input ref={nameInputRef} id="friend-name" name="name" type="text" autoComplete="organization" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="你的网站叫什么？" maxLength={100} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="friend-url">网站地址 <span>*</span></label>
                    <input id="friend-url" name="url" type="url" autoComplete="url" required value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" maxLength={500} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="friend-description">一句话介绍</label>
                    <input id="friend-description" name="description" type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="分享些什么，或者喜欢些什么" maxLength={500} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="friend-avatar">头像链接</label>
                    <input id="friend-avatar" name="avatar" type="url" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))} placeholder="https://example.com/avatar.png" maxLength={500} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="friend-email">联系邮箱 <span className={styles.optional}>选填，不会公开</span></label>
                    <input id="friend-email" name="email" type="email" autoComplete="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="方便在需要时联系你" maxLength={255} />
                  </div>
                  {formError && <p id="friend-form-error" className={styles.formError} role="alert">{formError}</p>}
                  {turnstileEnabled && <div className={styles.captcha}><Turnstile key={captchaAttempt} sitekey={turnstileSitekey} action="turnstile-link-v2" onToken={setTurnstileToken} /></div>}
                </div>
                <div className={styles.dialogActions}>
                  <Dialog.Close asChild><button type="button" className={styles.cancelButton}>取消</button></Dialog.Close>
                  <button type="submit" disabled={submitting} className={styles.submit}>
                    <span>{submitting ? '正在寄出申请…' : '提交申请'}</span><Send size={15} aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
