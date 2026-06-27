'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface InjectionConfig {
  head_injection?: string;
  content_head_injection?: string;
  footer_injection?: string;
}

let cachedConfig: InjectionConfig | null = null;

function useInjectionConfig() {
  const [config, setConfig] = useState<InjectionConfig>(cachedConfig || {});

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      return;
    }
    api.admin.config.get().then(res => {
      const c = res.config || {};
      cachedConfig = {
        head_injection: c.head_injection || '',
        content_head_injection: c.content_head_injection || '',
        footer_injection: c.footer_injection || '',
      };
      setConfig(cachedConfig);
    }).catch(() => {});
  }, []);

  return config;
}

/** Injects global head HTML into document.head */
export function GlobalHeadInjection() {
  const config = useInjectionConfig();

  useEffect(() => {
    if (!config.head_injection) return;
    const container = document.createElement('div');
    container.innerHTML = config.head_injection;
    container.setAttribute('data-injection', 'global-head');
    document.head.appendChild(container);
    return () => { container.remove(); };
  }, [config.head_injection]);

  return null;
}

/** Injects content page head HTML into document.head */
export function ContentHeadInjection() {
  const config = useInjectionConfig();

  useEffect(() => {
    if (!config.content_head_injection) return;
    const container = document.createElement('div');
    container.innerHTML = config.content_head_injection;
    container.setAttribute('data-injection', 'content-head');
    document.head.appendChild(container);
    return () => { container.remove(); };
  }, [config.content_head_injection]);

  return null;
}

/** Injects footer HTML at the bottom of the page */
export function FooterInjection() {
  const config = useInjectionConfig();

  if (!config.footer_injection) return null;

  return (
    <div
      data-injection="footer"
      dangerouslySetInnerHTML={{ __html: config.footer_injection }}
    />
  );
}
