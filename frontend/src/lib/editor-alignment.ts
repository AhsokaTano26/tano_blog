export type TextAlignment = 'left' | 'center' | 'right';

type AlignedBlock = { start: number; end: number; openingEnd: number; opening: string; align: TextAlignment };

function fencedRanges(content: string) {
  const ranges: { start: number; end: number }[] = [];
  let opening: { start: number; marker: string } | null = null;
  for (const match of content.matchAll(/[^\n]*(?:\n|$)/g)) {
    const fence = match[0].match(/^ {0,3}(`{3,}|~{3,})(.*)/);
    if (!fence) continue;
    if (!opening) opening = { start: match.index, marker: fence[1] };
    else if (fence[1][0] === opening.marker[0] && fence[1].length >= opening.marker.length && !fence[2].trim()) {
      ranges.push({ start: opening.start, end: match.index + match[0].length });
      opening = null;
    }
  }
  if (opening) ranges.push({ start: opening.start, end: content.length });
  return ranges;
}

function alignedBlocks(content: string): AlignedBlock[] {
  const stack: { start: number; openingEnd: number; opening: string; align?: TextAlignment }[] = [];
  const blocks: AlignedBlock[] = [];
  const code = fencedRanges(content);
  let codeIndex = 0;
  // The editor emits block HTML with blank lines so Markdown inside stays live.
  for (const match of content.matchAll(/<\/?div\b[^>]*>/gi)) {
    while (codeIndex < code.length && code[codeIndex].end <= match.index) codeIndex++;
    if (code[codeIndex]?.start <= match.index) continue;
    if (/^<\//.test(match[0])) {
      const opening = stack.pop();
      if (opening?.align) blocks.push({ ...opening, align: opening.align, end: match.index + match[0].length });
    } else {
      const align = match[0].match(/\bstyle=["'][^"']*\btext-align:\s*(left|center|right)\b/i)?.[1].toLowerCase() as TextAlignment | undefined;
      stack.push({ start: match.index, openingEnd: match.index + match[0].length, opening: match[0], align });
    }
  }
  return blocks;
}

export function selectionAlignment(content: string, start: number, end = start): TextAlignment {
  return alignedBlocks(content).find(block => block.start <= start && end <= block.end)?.align ?? 'left';
}

function rewriteAlignments(content: string, blocks: AlignedBlock[], align: TextAlignment) {
  const updates = blocks.filter(block => block.align !== align)
    .map(block => ({ ...block, replacement: block.opening.replace(/(text-align:\s*)(left|center|right)/i, `$1${align}`) }))
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

  // Never split a paragraph, fenced code block, or HTML block at the caret.
  const blocks: { start: number; end: number }[] = [];
  let blockStart = 0;
  const code = fencedRanges(content);
  let codeIndex = 0;
  let divDepth = 0;
  for (const match of content.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0];
    if (!line) continue;
    while (codeIndex < code.length && code[codeIndex].end <= match.index) codeIndex++;
    const inCode = code[codeIndex]?.start <= match.index;
    if (!inCode) divDepth += [...line.matchAll(/<div\b/gi)].length - [...line.matchAll(/<\/div\s*>/gi)].length;
    if (!line.trim() && !inCode && divDepth <= 0) {
      if (match.index > blockStart) blocks.push({ start: blockStart, end: match.index - 1 });
      blockStart = match.index + line.length;
    }
  }
  if (blockStart < content.length) blocks.push({ start: blockStart, end: content.length });
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
