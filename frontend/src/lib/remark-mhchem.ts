import type { Root } from 'mdast';

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
};

const mhchemExpression = /\\\\(?:ce|pu)\{[^{}\r\n]*\}/g;

/**
 * Treat bare mhchem expressions as inline math.  Authors may therefore write
 * either `\\ce{H2O}` or the standard `$\\ce{H2O}$` in Markdown.
 */
export function remarkMhchem() {
  return (tree: Root) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;

      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (child.type !== 'text' || !child.value?.match(mhchemExpression)) {
          visit(child);
          continue;
        }

        const parts: MarkdownNode[] = [];
        let lastIndex = 0;
        for (const match of child.value.matchAll(mhchemExpression)) {
          const matchIndex = match.index ?? 0;
          if (matchIndex > lastIndex) parts.push({ type: 'text', value: child.value.slice(lastIndex, matchIndex) });
          parts.push({ type: 'inlineMath', value: match[0] });
          lastIndex = matchIndex + match[0].length;
        }
        if (lastIndex < child.value.length) parts.push({ type: 'text', value: child.value.slice(lastIndex) });

        node.children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
    };

    visit(tree as unknown as MarkdownNode);
  };
}
