'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import rehypeSlug from 'rehype-slug';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Mail, Globe, Send, ExternalLink } from 'lucide-react';
import editorial from '@/components/Editorial.module.css';
import styles from './page.module.css';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const contactIcons: Record<string, any> = { email: Mail, telegram: Send, github: GithubIcon, link: Globe };
const contactLabels: Record<string, string> = {
  email: '邮箱', github: 'GitHub', twitter: 'Twitter/X', bilibili: 'B站',
  telegram: 'Telegram', qq: 'QQ', link: '链接',
};

export default function AboutPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [postCount, setPostCount] = useState(0);

  const load = useCallback(async () => {
    await Promise.allSettled([
      api.getAboutConfig().then(res => setConfig(res.config || {})),
      api.getPosts({ page: '1', page_size: '1' }).then(res => setPostCount(res.total || 0)),
    ]);
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
  const avatar = config.profile_avatar || '/aimi.webp';
  const aboutContent = config.about_content || '';
  const contacts = getContacts();

  return (
    <div className={`${editorial.page} ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="about-name">
        <div className={styles.avatar}>
          <ImageWithFallback src={avatar} alt={name} />
        </div>
        <div>
          <p className={styles.eyebrow}>关于</p>
          <h1 id="about-name">{name}</h1>
          {bio && <p className={styles.bio}>{bio}</p>}
        </div>
      </section>

      <dl className={styles.stats}>
        <div><dt>篇文章</dt><dd>{postCount}</dd></div>
        <div><dt>个站点</dt><dd>1</dd></div>
      </dl>

      {contacts.length > 0 && (
        <nav className={styles.contacts} aria-label="联系我">
          {contacts.map((contact, index) => {
            const Icon = contactIcons[contact.type] || Globe;
            return (
              <a key={index} href={getContactUrl(contact.type, contact.value)}
                target="_blank" rel="noopener noreferrer" className={editorial.action}
                title={contact.value}>
                <Icon className="w-4 h-4" aria-hidden="true" />
                {contactLabels[contact.type] || contact.type}
              </a>
            );
          })}
        </nav>
      )}

      {aboutContent ? (
        <div className={`${styles.body} prose prose-sm sm:prose-base max-w-none`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                  {children}<ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              ),
              img: ({ src, alt }) => (
                <ImageWithFallback src={src} alt={alt || ''} loading="lazy" />
              ),
            }}>
            {aboutContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>管理员还没有填写关于页面内容</p>
          <p className="text-xs mt-2">前往后台「设置 - 个人资料」填写</p>
        </div>
      )}
    </div>
  );
}
