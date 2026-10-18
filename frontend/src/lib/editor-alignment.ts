import { htmlSourceTags, markdownSource, sourceRange, type SourceRange } from './editor-markdown-source';

export type TextAlignment = 'left' | 'center' | 'right';

type AlignedBlock = { start: number; end: number; openingEnd: number; opening: string; align: TextAlignment; styleRange: SourceRange };
let latestAlignment: { content: string; blocks: AlignedBlock[] } | undefined;

function alignedBlocks(content: string): AlignedBlock[] {
  if (latestAlignment?.content === content) return latestAlignment.blocks;
  if (!/<div\b/i.test(content)) {
    latestAlignment = { content, blocks: [] };
    return latestAlignment.blocks;
  }
  const stack: { start: number; openingEnd: number; opening: string; align?: TextAlignment; styleRange?: SourceRange }[] = [];
  const blocks: AlignedBlock[] = [];
  // The editor emits block HTML with blank lines so Markdown inside stays live.
  let literalTag: string | null = null;
  for (const tag of htmlSourceTags(content)) {
    if (literalTag) {
      if (tag.closing && tag.name === literalTag) literalTag = null;
      continue;
    }
    if (['pre', 'code', 'script', 'style', 'textarea'].includes(tag.name) && !tag.closing) { literalTag = tag.name; continue; }
    if (tag.name !== 'div') continue;
    if (tag.closing) {
      const opening = stack.pop();
      if (opening?.align && opening.styleRange) blocks.push({ ...opening, align: opening.align, styleRange: opening.styleRange, end: tag.end });
    } else {
      const align = tag.attrs.style?.match(/\btext-align:\s*(left|center|right)\b/i)?.[1].toLowerCase() as TextAlignment | undefined;
      stack.push({ start: tag.start, openingEnd: tag.end, opening: tag.value, align, styleRange: tag.attributeRanges.style });
    }
  }
  latestAlignment = { content, blocks };
  return blocks;
}

export function selectionAlignment(content: string, start: number, end = start): TextAlignment {
  return alignedBlocks(content).find(block => block.start <= start && end <= block.end)?.align ?? 'left';
}

function rewriteAlignments(content: string, blocks: AlignedBlock[], align: TextAlignment) {
  const updates = blocks.filter(block => block.align !== align)
    .map(block => {
      const from = block.styleRange.start - block.start, to = block.styleRange.end - block.start;
      const style = block.opening.slice(from, to).replace(/(text-align:\s*)(left|center|right)\b/gi, `$1${align}`);
      return { ...block, replacement: block.opening.slice(0, from) + style + block.opening.slice(to) };
    })
    .sort((a, b) => a.start - b.start);
  let result = content;
  for (const block of [...updates].reverse()) {
    result = result.slice(0, block.start) + block.replacement + result.slice(block.openingEnd);
  }
  const offset = (position: number) => updates.reduce((sum, block) =>
    sum + (block.openingEnd <= position ? block.replacement.length - block.opening.length : 0), position);
  return { content: result, offset };
}

export function alignSelection(content: string, start: number, end: number, align: TextAlignment) {
  const aligned = alignedBlocks(content);
  const existing = aligned.find(block => block.start <= start && end <= block.end);
  if (existing) {
    const result = rewriteAlignments(content, aligned.filter(block => existing.start <= block.start && block.end <= existing.end), align);
    return {
      content: result.content,
      start: result.offset(start),
      end: result.offset(end),
    };
  }

  // The parser's complete block ranges preserve headings, lists and both code
  // forms without treating HTML-looking text inside literals as containers.
  const blocks = markdownSource(content).children.flatMap(node => {
    const range = sourceRange(node);
    return range ? [range] : [];
  });
  let from = blocks.find(block => block.start <= start && start <= block.end)?.start ?? start;
  let to = blocks.find(block => block.start <= Math.max(start, end - 1) && Math.max(start, end - 1) <= block.end)?.end ?? end;
  // A selection crossing an existing alignment includes that whole wrapper.
  for (const block of aligned) {
    if (block.start < to && block.end > from) {
      from = Math.min(from, block.start);
      to = Math.max(to, block.end);
    }
  }
  const before = content.slice(0, from);
  const after = content.slice(to);
  const result = rewriteAlignments(content, aligned.filter(block => from <= block.start && block.end <= to), align);
  const body = result.content.slice(result.offset(from), result.offset(to));
  const opening = `${before && !before.endsWith('\n\n') ? '\n\n' : ''}<div style="text-align: ${align};">\n\n`;
  const closing = `\n\n</div>${after && !after.startsWith('\n\n') ? '\n\n' : ''}`;
  return {
    content: before + opening + body + closing + after,
    start: result.offset(start) + opening.length,
    end: result.offset(end) + opening.length,
  };
}
