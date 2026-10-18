import { decodeHtml, htmlSourceTags, markdownSource, sourceRange, visitMarkdown, type SourceRange } from './editor-markdown-source';

export interface ImageAttrs {
  url: string;
  alt: string;
  width: string;
  height: string;
  align: 'left' | 'center' | 'right';
  caption: string;
  linkUrl: string;
}

function escapeHtmlAttr(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateImageHtml(attrs: ImageAttrs): string {
  const dimension = (value: string) => /^\d+(\.\d+)?$/.test(value.trim()) ? `${value.trim()}px` : value.trim();
  let style = `width: ${escapeHtmlAttr(dimension(attrs.width) || 'auto')};`;
  if (attrs.height) style += ` height: ${escapeHtmlAttr(dimension(attrs.height))};`;
  let alignItems = 'center';
  if (attrs.align === 'left') alignItems = 'flex-start';
  else if (attrs.align === 'right') alignItems = 'flex-end';
  let html = `<figure class="editor-image" style="display: flex; flex-direction: column; align-items: ${alignItems}; margin: 1em 0;">\n`;
  if (attrs.linkUrl) {
    html += `  <a href="${escapeHtmlAttr(attrs.linkUrl)}" target="_blank" rel="noopener noreferrer">\n`;
  }
  html += `  <img src="${escapeHtmlAttr(attrs.url)}" alt="${escapeHtmlAttr(attrs.alt)}" style="${style}" />\n`;
  if (attrs.linkUrl) {
    html += `  </a>\n`;
  }
  if (attrs.caption) {
    html += `  <figcaption>${escapeHtmlAttr(attrs.caption)}</figcaption>\n`;
  }
  html += '</figure>';
  return html;
}

type ImageSource = SourceRange & { image: SourceRange; attrs: Partial<ImageAttrs> };

export function findImageInContent(content: string, srcUrl: string, imageRange?: SourceRange): { start: number; end: number; attrs: Partial<ImageAttrs> } | null {
  const tree = markdownSource(content);
  const tags = htmlSourceTags(content, tree);
  const sources: ImageSource[] = [];
  const definitions = new Map<string, string>();
  const links = new Map<number, SourceRange & { url: string }>();
  visitMarkdown(tree, node => {
    if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node.url);
  });
  visitMarkdown(tree, node => {
    if ((node.type === 'link' || node.type === 'linkReference') && node.children.length === 1) {
      const range = sourceRange(node), image = sourceRange(node.children[0]);
      const url = node.type === 'link' ? node.url : definitions.get(node.identifier.toLowerCase());
      const imageChild = ['image', 'imageReference'].includes(node.children[0].type) ||
        (node.children[0].type === 'html' && image && tags.some(tag => tag.name === 'img' && !tag.closing && tag.start === image.start && tag.end === image.end));
      if (range && image && url && imageChild) links.set(image.start, { ...range, url });
    }
  });
  visitMarkdown(tree, node => {
    if (node.type !== 'image' && node.type !== 'imageReference') return;
    const image = sourceRange(node);
    if (!image) return;
    const url = node.type === 'image' ? node.url : definitions.get(node.identifier.toLowerCase());
    if (!url) return;
    const link = links.get(image.start);
    sources.push({ ...(link || image), image, attrs: { url, alt: node.alt || '', ...(link ? { linkUrl: link.url } : {}) } });
  });

  type Container = SourceRange & { openingEnd: number; closingStart: number; name: string; attrs: Record<string, string> };
  const containers: Container[] = [];
  const stack: typeof tags = [];
  for (const tag of tags) {
    if (!['figure', 'a', 'figcaption'].includes(tag.name)) continue;
    if (!tag.closing) stack.push(tag);
    else {
      const index = stack.findLastIndex(opening => opening.name === tag.name);
      if (index < 0) continue;
      const [opening] = stack.splice(index);
      containers.push({ ...opening, openingEnd: opening.end, closingStart: tag.start, end: tag.end });
    }
  }
  const rawImages = tags.filter(tag => tag.name === 'img' && !tag.closing);
  for (const image of rawImages) {
    const parents = containers.filter(parent => parent.start < image.start && image.end < parent.end);
    if (parents.some(parent => parent.name === 'figure' && parent.attrs.class?.split(/\s+/).includes('editor-image-gallery'))) continue;
    const figure = parents.find(parent => parent.name === 'figure' && rawImages.filter(other => parent.start < other.start && other.end < parent.end).length === 1);
    const link = parents.find(parent => parent.name === 'a');
    const standaloneLink = link && content.slice(link.openingEnd, link.closingStart).trim() === image.value ? link : null;
    const markdownLink = links.get(image.start);
    const range = figure || standaloneLink || markdownLink || image;
    const style = image.attrs.style || '';
    const figureStyle = figure?.attrs.style || '';
    const alignment = figureStyle.match(/align-items:\s*(flex-start|center|flex-end)/i)?.[1];
    const caption = figure && containers.find(parent => parent.name === 'figcaption' && figure.start < parent.start && parent.end < figure.end);
    sources.push({ start: range.start, end: range.end, image,
      attrs: {
        url: image.attrs.src || '', alt: image.attrs.alt || '',
        width: style.match(/(?:^|;)\s*width:\s*([^;]+)/i)?.[1].trim() ?? image.attrs.width ?? '',
        height: style.match(/(?:^|;)\s*height:\s*([^;]+)/i)?.[1].trim() ?? image.attrs.height ?? '',
        align: alignment === 'flex-start' ? 'left' : alignment === 'flex-end' ? 'right' : 'center',
        caption: caption ? decodeHtml(content.slice(caption.openingEnd, caption.closingStart).trim()) : '',
        linkUrl: link?.attrs.href || markdownLink?.url || '',
      } });
  }
  for (const source of sources) {
    if (source.start !== source.image.start || source.end !== source.image.end) continue;
    const link = containers.find(parent => parent.name === 'a' && parent.start < source.start && source.end < parent.end &&
      content.slice(parent.openingEnd, parent.closingStart).trim() === content.slice(source.image.start, source.image.end));
    if (link) {
      source.start = link.start;
      source.end = link.end;
      source.attrs.linkUrl = link.attrs.href || '';
    }
  }
  // Exact renderer coordinates distinguish repeated URLs and fail closed when
  // a deferred preview no longer describes the current editor source.
  const found = sources.sort((a, b) => a.image.start - b.image.start).find(source => source.attrs.url === srcUrl &&
    (!imageRange || (source.image.start === imageRange.start && source.image.end === imageRange.end)));
  return found ? { start: found.start, end: found.end, attrs: found.attrs } : null;
}
