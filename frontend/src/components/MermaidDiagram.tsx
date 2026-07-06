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
  const id = useRef('mermaid-' + Math.random().toString(36).slice(2, 9));
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
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
  }, [code]);

  if (error) {
    return (
      <div className="p-4 rounded-lg" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>无法渲染图表</p>
        <pre className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{code}</pre>
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
