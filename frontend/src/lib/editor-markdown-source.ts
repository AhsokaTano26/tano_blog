import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Nodes, Root } from 'mdast';
import { parseEntities } from 'parse-entities';

export type SourceRange = { start: number; end: number };
export type HtmlSourceTag = SourceRange & {
  value: string;
  name: string;
  closing: boolean;
  attrs: Record<string, string>;
  attributeRanges: Record<string, SourceRange>;
};

// Match the preview's Markdown grammar so code examples never become editor HTML.
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function markdownSource(content: string): Root {
  return parser.parse(content);
}

export function sourceRange(node: Nodes): SourceRange | null {
  const start = node.position?.start.offset, end = node.position?.end.offset;
  return start === undefined || end === undefined ? null : { start, end };
}

export function visitMarkdown(node: Nodes, visitor: (node: Nodes) => void) {
  visitor(node);
  if ('children' in node) for (const child of node.children) visitMarkdown(child, visitor);
}

export function decodeHtml(value: string) {
  return parseEntities(value);
}

export function htmlSourceTags(content: string, tree = markdownSource(content)): HtmlSourceTag[] {
  const tags: HtmlSourceTag[] = [];
  visitMarkdown(tree, node => {
    if (node.type !== 'html') return;
    const range = sourceRange(node);
    if (!range) return;
    // Tokenize only actual Markdown HTML nodes. Comments and quoted attributes
    // consume their complete spans, so their apparent tags cannot be matched.
    // Markdown containers can remove their prefixes from node.value. Index
    // the original source instead so offsets still identify the actual tags.
    for (const match of content.slice(range.start, range.end).matchAll(/<!--[\s\S]*?(?:-->|$)|<\/?([a-z][\w:-]*)(?:[^<>"']|"[^"]*"|'[^']*')*>/gi)) {
      if (!match[1]) continue;
      const value = match[0];
      const attrs: Record<string, string> = {};
      const attributeRanges: Record<string, SourceRange> = {};
      const start = range.start + match.index;
      const attributeOffset = value.indexOf(match[1]) + match[1].length;
      const attributeText = value.slice(attributeOffset, -1);
      for (const attribute of attributeText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const name = attribute[1].toLowerCase();
        attrs[name] = parseEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? '', { attribute: true });
        const attributeStart = start + attributeOffset + attribute.index;
        attributeRanges[name] = { start: attributeStart, end: attributeStart + attribute[0].length };
      }
      tags.push({ start, end: start + value.length, value, name: match[1].toLowerCase(), closing: /^<\//.test(value), attrs, attributeRanges });
    }
  });
  return tags.sort((a, b) => a.start - b.start);
}
