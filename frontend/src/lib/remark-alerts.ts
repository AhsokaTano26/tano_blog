import type { Root } from 'mdast';

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
};

const alertMarker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*|$)/i;

function markAlert(node: MarkdownNode, type: string) {
  node.data = {
    ...node.data,
    hName: 'div',
    hProperties: {
      ...node.data?.hProperties,
      className: ['markdown-alert', `markdown-alert-${type.toLowerCase()}`],
    },
  };
}

function takeMarker(paragraph: MarkdownNode): string | null {
  const first = paragraph.children?.[0];
  if (!first || first.type !== 'text') return null;
  const match = first.value?.match(alertMarker);
  if (!match) return null;

  first.value = first.value?.slice(match[0].length);
  if (!first.value) paragraph.children?.shift();
  return match[1].toLowerCase();
}

/** Supports GitHub alerts (`> [!NOTE]`) and the bare `[!NOTE]` shorthand. */
export function remarkAlerts() {
  return (tree: Root) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;

      for (const child of node.children) {
        if (child.type === 'blockquote') {
          const firstParagraph = child.children?.[0];
          if (firstParagraph?.type === 'paragraph') {
            const type = takeMarker(firstParagraph);
            if (type) {
              markAlert(child, type);
              if (firstParagraph.children?.length === 0) child.children?.shift();
            }
          }
        } else if (child.type === 'paragraph') {
          const type = takeMarker(child);
          if (type) {
            const body: MarkdownNode = { type: 'paragraph', children: child.children || [] };
            child.type = 'blockquote';
            child.children = body.children?.length ? [body] : [];
            markAlert(child, type);
          }
        }
        visit(child);
      }
    };

    visit(tree as unknown as MarkdownNode);
  };
}
