import type { ComponentProps } from 'react';
import { ImageWithFallback } from './ImageWithFallback';

type Props = ComponentProps<typeof ImageWithFallback> & { node?: unknown };

// Keep the sanitized Markdown image's dimensions and styles in both the editor
// preview and published article, without passing the HAST node to the DOM.
export function MarkdownImage({ node: _node, className, style, ...props }: Props) {
  return <ImageWithFallback loading="lazy" decoding="async" {...props} className={`max-w-full rounded-lg ${className || ''}`}
    style={{ maxWidth: '100%', ...style }} />;
}
