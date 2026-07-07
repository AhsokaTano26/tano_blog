'use client';

import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';

interface InjectionConfig {
  head_injection?: string;
  content_head_injection?: string;
  footer_injection?: string;
  site_favicon?: string;
}

let cachedConfig: InjectionConfig | null = null;

function useInjectionConfig() {
  const [config, setConfig] = useState<InjectionConfig>(cachedConfig || {});

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      return;
    }
    (async () => {
      try {
        const res = await api.getPublicConfig();
        const c = res.config || {};
        cachedConfig = {
          head_injection: c.head_injection || '',
          content_head_injection: c.content_head_injection || '',
          footer_injection: c.footer_injection || '',
          site_favicon: c.site_favicon || '',
        };
        setConfig(cachedConfig);
      } catch {
        // Config unavailable (backend offline or endpoint missing) — silently ignore
      }
    })();
  }, []);

  return config;
}

/**
 * Injects raw HTML as direct children of document.head.
 * Handles <script> tags properly (innerHTML doesn't execute scripts).
 */
function injectIntoHead(html: string, dataAttr: string): (() => void) {
  // Sanitize with DOMPurify allowing script/style tags needed for analytics/custom CSS
  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ['script', 'style'],
    ADD_ATTR: ['async', 'defer', 'crossorigin', 'integrity', 'nomodule', 'target'],
  });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = clean;
  const injected: Element[] = [];

  while (wrapper.firstChild) {
    const node = wrapper.removeChild(wrapper.firstChild);
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.tagName === 'SCRIPT') {
        // innerHTML doesn't execute scripts — create a fresh <script> element
        const script = document.createElement('script');
        for (const attr of el.attributes) {
          script.setAttribute(attr.name, attr.value);
        }
        script.textContent = el.textContent;
        script.setAttribute('data-injection', dataAttr);
        document.head.appendChild(script);
        injected.push(script);
      } else {
        el.setAttribute('data-injection', dataAttr);
        document.head.appendChild(el);
        injected.push(el);
      }
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      // Ignore standalone text nodes in head
    }
  }

  return () => {
    injected.forEach(el => el.remove());
  };
}

/** Injects global head HTML into document.head */
export function GlobalHeadInjection() {
  const config = useInjectionConfig();

  useEffect(() => {
    if (!config.head_injection) return;
    return injectIntoHead(config.head_injection, 'global-head');
  }, [config.head_injection]);

  useEffect(() => {
    const href = config.site_favicon;
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [config.site_favicon]);

  return null;
}

/** Injects content page head HTML into document.head */
export function ContentHeadInjection() {
  const config = useInjectionConfig();

  useEffect(() => {
    if (!config.content_head_injection) return;
    return injectIntoHead(config.content_head_injection, 'content-head');
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
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.footer_injection) }}
    />
  );
}
