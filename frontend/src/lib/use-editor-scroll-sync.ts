'use client';

import { useLayoutEffect, type RefObject } from 'react';

type Anchor = { editor: number; preview: number };
type Side = 'editor' | 'preview';

function interpolate(value: number, anchors: Anchor[], from: Side) {
  const to = from === 'editor' ? 'preview' : 'editor';
  let low = 0;
  let high = anchors.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (anchors[middle][from] <= value) low = middle;
    else high = middle;
  }
  const start = anchors[low];
  const end = anchors[high];
  const distance = end[from] - start[from];
  const ratio = distance > 0 ? Math.max(0, Math.min(1, (value - start[from]) / distance)) : 0;
  return start[to] + ratio * (end[to] - start[to]);
}

const mirrorProperties = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'text-indent', 'text-transform', 'text-align',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'tab-size', 'word-spacing', 'word-break', 'overflow-wrap', 'direction',
];

/** Source-to-preview coordinates account for soft wraps as well as media height.
 * Geometry is cached; scroll events only interpolate once per animation frame.
 */
export function useEditorScrollSync({ editorRef, previewRef, contentRef, content, enabled }: {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  previewRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  content: string;
  enabled: boolean;
}) {
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const preview = previewRef.current;
    const previewContent = contentRef.current;
    if (!enabled || !editor || !preview || !previewContent) return;

    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      pointerEvents: 'none', whiteSpace: 'pre-wrap', boxSizing: 'border-box',
      border: '0', margin: '0', height: 'auto', overflow: 'visible',
    });
    const text = document.createTextNode(`${content}\u200b`);
    mirror.append(text);
    document.body.append(mirror);
    let anchors: Anchor[] = [];
    let dirty = true;
    let frame: number | null = null;
    let pendingSide: Side | null = null;
    let disposed = false;
    const expected: Record<Side, number | null> = { editor: null, preview: null };

    function measure() {
      const editorMax = Math.max(0, editor!.scrollHeight - editor!.clientHeight);
      const previewMax = Math.max(0, preview!.scrollHeight - preview!.clientHeight);
      const points: Anchor[] = [];
      const style = window.getComputedStyle(editor!);
      for (const property of mirrorProperties) mirror.style.setProperty(property, style.getPropertyValue(property));
      mirror.style.width = `${editor!.clientWidth || editor!.getBoundingClientRect().width}px`;
      const mirrorTop = mirror.getBoundingClientRect().top;
      const previewTop = preview!.getBoundingClientRect().top + preview!.clientTop;
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 20;
      const range = document.createRange();
      if (typeof range.getBoundingClientRect === 'function') {
        const sourceY = (offset: number, end: boolean) => {
          range.setStart(text, Math.max(0, Math.min(content.length, end ? offset - 1 : offset)));
          range.collapse(true);
          return range.getBoundingClientRect().top - mirrorTop + (end ? lineHeight : 0);
        };
        for (const block of previewContent!.querySelectorAll<HTMLElement>('[data-source-start][data-source-end]')) {
          const start = Number(block.dataset.sourceStart);
          const end = Number(block.dataset.sourceEnd);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > content.length) continue;
          const rect = block.getBoundingClientRect();
          if (!rect.height) continue;
          points.push({ editor: sourceY(start, false), preview: rect.top - previewTop + preview!.scrollTop });
          points.push({ editor: sourceY(end, true), preview: rect.bottom - previewTop + preview!.scrollTop });
        }
      }
      points.sort((a, b) => a.editor - b.editor || a.preview - b.preview);
      anchors = [{ editor: 0, preview: 0 }];
      for (const point of points) {
        const previous = anchors[anchors.length - 1];
        if (point.editor <= previous.editor || point.editor >= editorMax || point.preview <= previous.preview || point.preview >= previewMax) continue;
        anchors.push(point);
      }
      anchors.push({ editor: editorMax, preview: previewMax });
      dirty = false;
    }

    function flush() {
      frame = null;
      // Deferred Markdown must catch up before it can describe the textarea.
      if (disposed || editor!.value !== content) return;
      if (dirty) measure();
      const side = pendingSide ?? 'editor';
      pendingSide = null;
      const last = anchors[anchors.length - 1];
      // A short source can render a tall image. Let that preview scroll freely.
      if (!last?.editor || !last.preview) return;
      const source = side === 'editor' ? editor! : preview!;
      const target = side === 'editor' ? preview! : editor!;
      const targetSide = side === 'editor' ? 'preview' : 'editor';
      const position = interpolate(source.scrollTop, anchors, side);
      if (Math.abs(target.scrollTop - position) < 0.5) return;
      expected[targetSide] = position;
      target.scrollTop = position;
      expected[targetSide] = target.scrollTop; // native clamping / pixel rounding
    }

    function schedule() {
      if (frame === null && !disposed) frame = requestAnimationFrame(flush);
    }
    function invalidate() {
      dirty = true;
      schedule();
    }
    function scroll(side: Side) {
      const element = side === 'editor' ? editor! : preview!;
      if (expected[side] !== null && Math.abs(element.scrollTop - expected[side]!) < 1) {
        expected[side] = null;
        return;
      }
      expected[side] = null;
      pendingSide = side;
      schedule();
    }
    const editorScroll = () => scroll('editor');
    const previewScroll = () => scroll('preview');
    const claimEditor = () => { expected.editor = null; };
    const claimPreview = () => { expected.preview = null; };
    editor.addEventListener('scroll', editorScroll, { passive: true });
    preview.addEventListener('scroll', previewScroll, { passive: true });
    const inputEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const;
    for (const event of inputEvents) {
      editor.addEventListener(event, claimEditor, { passive: true });
      preview.addEventListener(event, claimPreview, { passive: true });
    }
    // load/error capture also covers lazy images, fallback replacement and video.
    const mediaEvents = ['load', 'error', 'loadedmetadata'] as const;
    for (const event of mediaEvents) previewContent.addEventListener(event, invalidate, true);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate);
    resize?.observe(editor);
    resize?.observe(preview);
    resize?.observe(previewContent);
    const mutations = new window.MutationObserver(invalidate);
    mutations.observe(previewContent, { childList: true, subtree: true });
    window.addEventListener('resize', invalidate, { passive: true });
    document.fonts?.addEventListener('loadingdone', invalidate);
    schedule();

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations.disconnect();
      editor.removeEventListener('scroll', editorScroll);
      preview.removeEventListener('scroll', previewScroll);
      for (const event of inputEvents) {
        editor.removeEventListener(event, claimEditor);
        preview.removeEventListener(event, claimPreview);
      }
      for (const event of mediaEvents) previewContent.removeEventListener(event, invalidate, true);
      window.removeEventListener('resize', invalidate);
      document.fonts?.removeEventListener('loadingdone', invalidate);
      mirror.remove();
    };
  }, [editorRef, previewRef, contentRef, content, enabled]);
}
