'use client';

import { useRef, useEffect, useState } from 'react';

let mermaidCache: any = null;

// Mermaid embeds its own stylesheet in each SVG. Append this stylesheet after
// Mermaid's output so author-provided diagram directives and Mermaid defaults
// cannot reintroduce dark text on the fixed dark canvas.
const mermaidContrastStyles = `
<style>
  text, tspan,
  .label, .label *, .nodeLabel, .nodeLabel *, .edgeLabel, .edgeLabel *,
  .cluster-label, .cluster-label *, .actor, .messageText, .noteText,
  .loopText, .labelText, .titleText {
    color: #ffffff !important;
    fill: #ffffff !important;
  }
  .edgeLabel, .labelBkg {
    background-color: #161b26 !important;
    fill: #161b26 !important;
  }
  .node rect, .node circle, .node ellipse, .node polygon, .node path,
  rect.actor, rect.note, .label-container {
    fill: #263854 !important;
    stroke: #8ab4f8 !important;
  }
  .cluster rect {
    fill: #20283a !important;
    stroke: #8ab4f8 !important;
  }
  .edgePath .path, .flowchart-link, .messageLine0, .messageLine1,
  .loopLine, .actor-line {
    stroke: #ffffff !important;
  }
  .arrowheadPath, marker path {
    fill: #ffffff !important;
    stroke: #ffffff !important;
  }
</style>`;

function enforceMermaidContrast(rendered: string) {
  return rendered.replace('</svg>', `${mermaidContrastStyles}</svg>`);
}

async function getMermaid() {
  if (!mermaidCache) {
    mermaidCache = import('mermaid').then(m => {
      const api = m.default || m;
      api.initialize({
        startOnLoad: false,
        // Mermaid always sits on a dark canvas, independent of the site theme.
        // Use Mermaid's dark palette and explicit high-contrast variables so
        // node labels, edges, and sequence/flowchart annotations stay legible.
        theme: 'dark',
        themeVariables: {
          background: '#161b26',
          primaryColor: '#263854',
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#8ab4f8',
          secondaryColor: '#342b50',
          secondaryTextColor: '#ffffff',
          secondaryBorderColor: '#b99aff',
          tertiaryColor: '#193e4a',
          tertiaryTextColor: '#ffffff',
          tertiaryBorderColor: '#67d5e8',
          lineColor: '#ffffff',
          textColor: '#ffffff',
          mainBkg: '#263854',
          nodeBorder: '#8ab4f8',
          clusterBkg: '#20283a',
          clusterBorder: '#8ab4f8',
          edgeLabelBackground: '#161b26',
          titleColor: '#ffffff',
          darkMode: true,
        },
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
        if (mounted) setSvg(enforceMermaidContrast(rendered));
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
      <div ref={containerRef} className="mermaid-diagram p-4 rounded-lg">
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>无法渲染图表</p>
        <pre className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div ref={containerRef} className="mermaid-diagram flex items-center justify-center p-8 rounded-lg">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.22)', borderTopColor: '#8ab4f8' }} />
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
