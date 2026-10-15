const imageExtensions = /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || (!file.type && imageExtensions.test(file.name));
}

export function getClipboardImages(data: Pick<DataTransfer, 'files' | 'items'>): File[] {
  const files = Array.from(data.files).filter(isImageFile);
  if (files.length) return files;
  return Array.from(data.items)
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function replaceUploadPlaceholder(content: string, placeholder: string, replacement: string): string {
  return content.replace(placeholder, () => replacement);
}

export function uploadSelection(content: string, placeholder: string, replacement: string, start: number, end: number) {
  const index = content.indexOf(placeholder);
  if (index < 0) return null;
  const adjust = (position: number) => {
    if (position <= index) return position;
    if (position >= index + placeholder.length) return position + replacement.length - placeholder.length;
    return index + replacement.length;
  };
  return { start: adjust(start), end: adjust(end) };
}

export function uploadFilename(file: File): string {
  const extensions: Record<string, string> = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/bmp': '.bmp', 'image/svg+xml': '.svg',
  };
  const extension = extensions[file.type];
  if (extension && !imageExtensions.test(file.name)) return `${file.name || 'clipboard-image'}${extension}`;
  return file.name;
}
