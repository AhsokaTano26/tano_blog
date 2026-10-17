'use client';

import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { markdownSanitizeSchema } from '@/lib/markdown-sanitize';
import { remarkMhchem } from '@/lib/remark-mhchem';
import { remarkAlerts } from '@/lib/remark-alerts';
import { rehypeKatexWithMhchem } from '@/lib/rehype-katex-mhchem';
import { MermaidDiagram } from './MermaidDiagram';
import { ArticleAudioPlayer } from './ArticleAudioPlayer';
import { MarkdownAlert } from './MarkdownAlert';
import { MarkdownImage } from './MarkdownImage';
import { rehypeEditorPositions } from '@/lib/rehype-editor-positions';

const remarkPlugins: PluggableList = [remarkGfm, remarkMath, remarkMhchem, remarkAlerts];
const rehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
  rehypeHighlight,
  rehypeSlug,
  rehypeKatexWithMhchem,
];
const editorRehypePlugins: PluggableList = [...rehypePlugins, rehypeEditorPositions];

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const handleCopy = useCallback(() => {
    const code = codeRef.current?.querySelector('code')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);
  const lang = className?.replace('language-', '') || '';
  return (
    <div className="article-code-block relative group my-4 rounded-lg overflow-hidden">
      <div className="article-code-header flex items-center justify-between px-4 py-1.5 text-xs">
        <span>{lang || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded transition-opacity hover:opacity-80" style={{ color: '#ffffff' }}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre ref={codeRef} className={className} style={{ margin: 0, padding: '1rem' }}>{children}</pre>
    </div>
  );
}

const articleComponents: Components = {
  code: ({ className, children, node: _node, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    if (match?.[1] === 'mermaid') {
      return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
  pre: CodeBlock,
  audio: ({ src }) => <ArticleAudioPlayer src={src || ''} />,
  div: MarkdownAlert,
  img: MarkdownImage,
};

const editorComponents: Components = {
  ...articleComponents,
  pre: 'pre',
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{children}</a>
  ),
  img: ({ style, ...props }) => (
    <MarkdownImage {...props} data-markdown-src={typeof props.src === 'string' ? props.src : undefined}
      style={{ ...style, cursor: 'pointer' }} title="点击编辑" />
  ),
};

// Only content changes should run the Markdown pipeline. Parent state such as
// comment input, reactions, editor metadata and TOC scrolling stays outside it.
const ArticleMarkdown = memo(function ArticleMarkdown({ content, variant = 'article' }: {
  content: string;
  variant?: 'article' | 'editor';
}) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={variant === 'editor' ? editorRehypePlugins : rehypePlugins}
      components={variant === 'editor' ? editorComponents : articleComponents}>
      {content}
    </ReactMarkdown>
  );
});

export default ArticleMarkdown;
