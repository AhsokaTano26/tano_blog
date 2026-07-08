'use client';

import { useRef, useEffect, useState } from 'react';

let mermaidCache: any = null;
async function getMermaid() {
  if (!mermaidCache) {
    mermaidCache = import('mermaid').then(m => {
      const api = m.default || m;
      api.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
      return api;
    });
  }
  return mermaidCache;
}

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useRef('mermaid-' + Math.random().toString(36).slice(2, 9));
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  // Observe visibility — only render when in viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If already visible (e.g. first render), render immediately
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render mermaid when visible
  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    getMermaid().then(async (mermaid) => {
      try {
        const { svg: rendered } = await mermaid.render(id.current, code);
        if (mounted) setSvg(rendered);
      } catch {
        if (mounted) setError(true);
      }
    }).catch(() => {
      if (mounted) setError(true);
    });
    return () => { mounted = false; };
  }, [code, visible]);

  if (error) {
    return (
      <div ref={containerRef} className="p-4 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>无法渲染图表</p>
        <pre className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div ref={containerRef} className="flex items-center justify-center p-8 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--glass-border)', borderTopColor: 'var(--primary)' }} />
      </div>
    );
  }

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
