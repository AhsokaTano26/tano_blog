'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function Footer() {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getPublicConfig().then(res => setConfig(res.config || {})).catch(() => {});
  }, []);

  const raw = config.footer_text || '';
  if (!raw) return null;

  const currentYear = new Date().getFullYear();
  const text = raw
    .replace(/\{year\}/gi, String(currentYear))
    .replace(/\b(19|20)\d{2}\b/g, String(currentYear));

  return (
    <footer className="w-full py-6 px-4 text-center">
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-info)' }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    </footer>
  );
}
