'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { FooterInjection } from '@/components/HtmlInjection';
import { LegacyEntry } from '@/components/LegacyAvailability';
import styles from './Footer.module.css';

export function Footer() {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    api.getPublicConfig().then(res => { if (active) setConfig(res.config || {}); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const currentYear = new Date().getFullYear();
  const raw = config.footer_text?.trim() || '';
  const text = raw
    .replace(/\{year\}/gi, String(currentYear))
    .replace(/\b(19|20)\d{2}\b/g, String(currentYear));

  return (
    <footer className={styles.footer} data-site-footer>
      <div className={styles.inner}>
        <div className={styles.injection}><FooterInjection initialConfig={config} /></div>
        <div className={styles.bar}>
          {raw ? (
            <p className={styles.copyright}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text, { ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'br', 'span', 'code'] }) }} />
          ) : <p className={styles.copyright}>© {currentYear} {config.site_title || '朝花夕拾录'}. All Rights Reserved.</p>}
          <nav className={styles.links} aria-label="站点链接">
            <a href="/rss.xml">RSS</a>
            <span aria-hidden="true">/</span>
            <a href="/sitemap.xml">Sitemap</a>
            <LegacyEntry />
          </nav>
        </div>
      </div>
    </footer>
  );
}
