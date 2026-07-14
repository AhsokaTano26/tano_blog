export interface GalleryImageItem {
  url: string;
  alt: string;
  caption: string;
}

export const DEFAULT_GALLERY_IMAGE_ITEM: GalleryImageItem = {
  url: '',
  alt: '',
  caption: '',
};

export interface GalleryAttrs {
  gridSize: 1 | 2 | 3 | 4 | 5;
  images: GalleryImageItem[];
  description: string;
  maxWidth: string; // e.g. "50%", "75%", "100%"
}

const DEFAULT_MAX_WIDTH = '100%';

// gridSize=1 表示 1x2（一行两列），其余为 NxN
export function getGridColumns(gridSize: number): number {
  return gridSize === 1 ? 2 : gridSize;
}

export function getSlotCount(gridSize: number): number {
  return gridSize === 1 ? 2 : gridSize * gridSize;
}

export function createDefaultGalleryAttrs(gridSize: 1 | 2 | 3 | 4 | 5): GalleryAttrs {
  const count = getSlotCount(gridSize);
  return {
    gridSize,
    images: Array.from({ length: count }, () => ({ ...DEFAULT_GALLERY_IMAGE_ITEM })),
    description: '',
    maxWidth: DEFAULT_MAX_WIDTH,
  };
}

function escapeHtmlAttr(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateGalleryHtml(attrs: GalleryAttrs): string {
  const cols = getGridColumns(attrs.gridSize);
  let html = `<figure class="editor-image-gallery" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin:1em auto;max-width:${escapeHtmlAttr(attrs.maxWidth)};">\n`;

  for (const item of attrs.images) {
    if (!item.url) continue;
    html += `  <div class="gallery-item">\n`;
    html += `    <img src="${escapeHtmlAttr(item.url)}" alt="${escapeHtmlAttr(item.alt)}" style="width:100%;height:auto;border-radius:8px;" />\n`;
    if (item.caption) {
      html += `    <p style="text-align:center;font-size:0.875em;margin:0.25em 0 0 0;">${escapeHtmlAttr(item.caption)}</p>\n`;
    }
    html += `  </div>\n`;
  }

  if (attrs.description) {
    html += `  <figcaption style="text-align:center;margin-top:0.75em;grid-column:1/-1;color:var(--text-secondary);font-size:0.875em;">${escapeHtmlAttr(attrs.description)}</figcaption>\n`;
  }

  html += '</figure>';
  return html;
}

export function parseGalleryAttrs(figureHtml: string): GalleryAttrs {
  const gridMatch = figureHtml.match(/grid-template-columns:\s*repeat\((\d+)/i);
  const parsedCols = parseInt(gridMatch?.[1] || '3', 10);
  // 解析图片数量判断是否为 1x2（2 列且图片少于 3 张）
  const itemCount = (figureHtml.match(/<div\s+class="gallery-item"/gi) || []).length;
  const gridSize = (parsedCols === 2 && itemCount < 3 ? 1 : Math.min(5, Math.max(2, parsedCols))) as 1 | 2 | 3 | 4 | 5;

  const images: GalleryImageItem[] = [];
  const itemRegex = /<div\s+class="gallery-item"[^>]*>([\s\S]*?)<\/div>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(figureHtml)) !== null) {
    const block = itemMatch[1];
    const src = block.match(/<img[^>]*src=["']([^"']*)["']/i)?.[1] || '';
    const alt = block.match(/<img[^>]*alt=["']([^"']*)["']/i)?.[1] || '';
    const caption = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
    images.push({ url: src, alt, caption });
  }

  const descMatch = figureHtml.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
  const description = descMatch?.[1]?.trim() || '';

  const widthMatch = figureHtml.match(/max-width:\s*([^;"]+)/i);
  const maxWidth = widthMatch?.[1] || '100%';

  return { gridSize, images, description, maxWidth };
}

export function findGalleryInContent(content: string): { start: number; end: number; attrs: GalleryAttrs } | null {
  const regex = /<figure\s+class="editor-image-gallery"[^>]*>[\s\S]*?<\/figure>/i;
  const match = content.match(regex);
  if (match && match.index !== undefined) {
    return {
      start: match.index,
      end: match.index + match[0].length,
      attrs: parseGalleryAttrs(match[0]),
    };
  }
  return null;
}
