import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic';
import { toText } from 'hast-util-to-text';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { SKIP, visitParents } from 'unist-util-visit-parents';

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
};

/** Keeps mhchem and the Markdown renderer on one KaTeX module instance. */
export function rehypeKatexWithMhchem() {
  return (tree: HastNode) => {
    visitParents(tree as never, 'element', (element: HastNode, parents: HastNode[]) => {
      const classes = Array.isArray(element.properties?.className) ? element.properties.className : [];
      const isLanguageMath = classes.includes('language-math');
      const isDisplayMath = classes.includes('math-display');
      const isInlineMath = classes.includes('math-inline');
      if (!isLanguageMath && !isDisplayMath && !isInlineMath) return;

      let parent = parents.at(-1);
      let scope = element;
      let displayMode = isDisplayMath;
      if (element.tagName === 'code' && isLanguageMath && parent?.tagName === 'pre') {
        scope = parent;
        parent = parents.at(-2);
        displayMode = true;
      }
      if (!parent?.children) return;

      const value = toText(scope as never, { whitespace: 'pre' });
      const html = katex.renderToString(value, { displayMode, throwOnError: false });
      const rendered = fromHtmlIsomorphic(html, { fragment: true }).children as HastNode[];
      const index = parent.children.indexOf(scope);
      parent.children.splice(index, 1, ...rendered);
      return SKIP;
    });
  };
}
