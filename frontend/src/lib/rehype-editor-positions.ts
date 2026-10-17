import type { Element, Root, RootContent } from 'hast';

const atomicBlocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'table', 'figure', 'hr', 'img', 'video', 'audio']);
const containers = new Set(['div', 'blockquote', 'ul', 'ol', 'li', 'section', 'a']);

// Run after sanitization: user HTML cannot forge trusted source coordinates.
// Mark nonoverlapping blocks, including nested paragraphs in alignment divs.
export function rehypeEditorPositions() {
  return (tree: Root) => {
    function mark(node: Element) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) return false;
      node.properties['data-source-start'] = start;
      node.properties['data-source-end'] = end;
      return true;
    }
    function visit(node: RootContent): boolean {
      if (node.type !== 'element') return false;
      if (atomicBlocks.has(node.tagName)) return mark(node);
      if (!containers.has(node.tagName)) return false;
      let marked = false;
      for (const child of node.children) marked = visit(child) || marked;
      return marked || mark(node);
    }
    for (const child of tree.children) visit(child);
  };
}
