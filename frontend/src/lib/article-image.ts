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

export function findImageInContent(content: string, srcUrl: string): { start: number; end: number; attrs: Partial<ImageAttrs> } | null {
  const escSrc = srcUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const figureRegex = /<figure\b[^>]*>(?:(?!<\/?figure\b)[\s\S])*?<\/figure>/gi;
  const imageRegex = new RegExp(`<img[^>]*src=["']${escSrc}["']`, 'i');
  for (const figureMatch of content.matchAll(figureRegex)) {
    if (imageRegex.test(figureMatch[0]) && !/class=["'][^"']*editor-image-gallery/.test(figureMatch[0])) {
      return { start: figureMatch.index, end: figureMatch.index + figureMatch[0].length, attrs: parseFigureAttrs(figureMatch[0]) };
    }
  }
  const mdRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escSrc}\\)`);
  const mdMatch = content.match(mdRegex);
  if (mdMatch && mdMatch.index !== undefined) {
    return { start: mdMatch.index, end: mdMatch.index + mdMatch[0].length, attrs: { url: srcUrl, alt: mdMatch[1] || '' } };
  }
  return null;
}

function parseFigureAttrs(figureHtml: string): Partial<ImageAttrs> {
  const attrs: Partial<ImageAttrs> = {};
  let alignMatch = figureHtml.match(/align-items:\s*(flex-start|center|flex-end)/i);
  if (alignMatch) {
    attrs.align = alignMatch[1] === 'flex-start' ? 'left' : alignMatch[1] === 'flex-end' ? 'right' : 'center';
  }
  const srcMatch = figureHtml.match(/<img[^>]*src=["']([^"']*)["']/i);
  if (srcMatch) attrs.url = srcMatch[1];
  const altMatch = figureHtml.match(/<img[^>]*alt=["']([^"']*)["']/i);
  if (altMatch) attrs.alt = altMatch[1];
  const widthMatch = figureHtml.match(/<img[^>]*style=["'][^"']*width:\s*([^;"']+)/i);
  if (widthMatch) attrs.width = widthMatch[1].trim();
  const heightMatch = figureHtml.match(/<img[^>]*style=["'][^"']*height:\s*([^;"']+)/i);
  if (heightMatch) attrs.height = heightMatch[1].trim();
  const capMatch = figureHtml.match(/<figcaption>([\s\S]*?)<\/figcaption>/i);
  if (capMatch) attrs.caption = capMatch[1].trim();
  const linkMatch = figureHtml.match(/<a[^>]*href=["']([^"']*)["'][^>]*>/i);
  if (linkMatch) attrs.linkUrl = linkMatch[1];
  return attrs;
}
