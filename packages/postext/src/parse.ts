// ---------------------------------------------------------------------------
// Minimal block-level markdown tokenizer
// ---------------------------------------------------------------------------

export type ContentBlockType = 'heading' | 'paragraph' | 'blockquote' | 'listItem';

export interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type ListKind = 'unordered' | 'ordered' | 'task';

export interface ContentBlock {
  type: ContentBlockType;
  text: string;
  spans: InlineSpan[];
  level?: number; // heading level 1-6
  /** Depth (1-based) for listItem blocks. Level 1 = outermost. */
  depth?: number;
  /** Discriminator for listItem blocks. Defaults to 'unordered' when absent. */
  listKind?: ListKind;
  /** First number literal from the source (ordered lists only). */
  startNumber?: number;
  /** Checkbox state for task list items. */
  checked?: boolean;
  /** Character offset of the first source character of this block in the original markdown */
  sourceStart: number;
  /** Character offset just past the last source character of this block */
  sourceEnd: number;
  /**
   * Per-plain-character map: sourceMap[i] = absolute source offset (in the
   * original markdown) of the i-th character of `text`. `sourceMap.length`
   * equals `text.length`.
   */
  sourceMap: number[];
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const TASK_ITEM_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/;
const ORDERED_LIST_ITEM_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const LIST_ITEM_RE = /^(\s*)([-*+])\s+(.*)$/;

/**
 * Strip inline markdown formatting for plain-text extraction.
 * Handles bold, italic, code, links, and images.
 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/__(.+?)__/g, '$1')              // bold alt
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/_(.+?)_/g, '$1')               // italic alt
    .replace(/`(.+?)`/g, '$1')              // inline code
    .trim();
}

/**
 * Strip non-emphasis inline formatting (images, links, code) but keep bold/italic markers.
 */
function stripNonEmphasisFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/`(.+?)`/g, '$1');             // inline code
}

/**
 * Split a text region into italic/non-italic spans, carrying an ambient bold flag.
 */
function splitItalicSpans(text: string, bold: boolean, forcedItalic: boolean, out: InlineSpan[]): void {
  if (forcedItalic) {
    if (text.length > 0) out.push({ text, bold, italic: true });
    return;
  }
  const italicRe = /\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index);
      if (before.length > 0) out.push({ text: before, bold, italic: false });
    }
    const inner = m[1] ?? m[2]!;
    if (inner.length > 0) out.push({ text: inner, bold, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last);
    if (rest.length > 0) out.push({ text: rest, bold, italic: false });
  }
}

/**
 * Parse inline formatting to produce spans with bold and italic flags.
 * Recognizes ***bold italic***, **bold**, *italic* (and underscore equivalents).
 */
function parseInlineFormatting(text: string): InlineSpan[] {
  const cleaned = stripNonEmphasisFormatting(text);
  const spans: InlineSpan[] = [];

  // Triple markers (bold+italic) first, then double (bold) — longest first.
  const boldRe = /\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      splitItalicSpans(cleaned.slice(lastIndex, match.index), false, false, spans);
    }
    const triple = match[1] ?? match[2];
    if (triple !== undefined) {
      splitItalicSpans(triple, true, true, spans);
    } else {
      const inner = match[3] ?? match[4]!;
      splitItalicSpans(inner, true, false, spans);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    splitItalicSpans(cleaned.slice(lastIndex), false, false, spans);
  }

  if (spans.length === 0) {
    const trimmed = cleaned.trim();
    if (trimmed.length > 0) {
      splitItalicSpans(trimmed, false, false, spans);
    }
  }

  return spans;
}

/**
 * Build a per-character map from plain text to absolute source offsets.
 * Greedy matches each plain char against the raw source (delimited by
 * [blockSrcStart, blockSrcEnd)), skipping markdown markers and treating
 * newlines/tabs as spaces for paragraph line joins.
 */
function computeSourceMap(
  markdown: string,
  blockSrcStart: number,
  blockSrcEnd: number,
  plainText: string,
): number[] {
  const map = new Array<number>(plainText.length);
  let r = blockSrcStart;
  for (let p = 0; p < plainText.length; p++) {
    const ch = plainText[p]!;
    const isSpace = ch === ' ';
    while (r < blockSrcEnd) {
      const rc = markdown[r]!;
      if (rc === ch) break;
      if (isSpace && (rc === '\n' || rc === '\t')) break;
      r++;
    }
    if (r >= blockSrcEnd) {
      map[p] = blockSrcEnd;
    } else {
      map[p] = r;
      r++;
    }
  }
  return map;
}

const COLLAPSIBLE_WS_RE = /[ \t\n\r\f]/;

/**
 * Collapse runs of `[ \t\n\r\f]` to a single space and strip leading/trailing
 * whitespace across spans. Mirrors pretext's `normalizeWhitespaceNormal` so
 * that `spans` and the block's plain text stay aligned with what the layout
 * engine actually renders — otherwise cursor/selection mapping drifts by one
 * character per collapsed whitespace character.
 */
function normalizeWhitespaceInSpans(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let inSpace = true; // start true to strip leading whitespace
  for (const span of spans) {
    let result = '';
    for (const ch of span.text) {
      if (COLLAPSIBLE_WS_RE.test(ch)) {
        if (!inSpace) {
          result += ' ';
          inSpace = true;
        }
      } else {
        result += ch;
        inSpace = false;
      }
    }
    out.push({ ...span, text: result });
  }
  // Strip trailing space from the last span that contributed content
  for (let i = out.length - 1; i >= 0; i--) {
    const text = out[i]!.text;
    if (text.length === 0) continue;
    if (text.endsWith(' ')) {
      out[i] = { ...out[i]!, text: text.slice(0, -1) };
    }
    break;
  }
  return out.filter((s) => s.text.length > 0);
}

/**
 * Build normalized text, spans, and sourceMap for a block. The plain text is
 * whitespace-normalized to match pretext's internal normalization so that the
 * per-character `sourceMap` aligns with rendered line segments.
 */
function buildBlockMapping(
  markdown: string,
  blockSrcStart: number,
  blockSrcEnd: number,
  rawSpans: InlineSpan[],
): { text: string; spans: InlineSpan[]; sourceMap: number[] } {
  const rawText = rawSpans.map((s) => s.text).join('');
  const rawSourceMap = computeSourceMap(markdown, blockSrcStart, blockSrcEnd, rawText);

  const spans = normalizeWhitespaceInSpans(rawSpans);
  const text = spans.map((s) => s.text).join('');

  // Walk the raw text building the same normalization, and project each kept
  // normalized character onto the rawSourceMap to obtain the source offset.
  const sourceMap: number[] = [];
  let inSpace = true;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i]!;
    if (COLLAPSIBLE_WS_RE.test(ch)) {
      if (!inSpace) {
        sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
        inSpace = true;
      }
    } else {
      sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
      inSpace = false;
    }
  }
  if (sourceMap.length > text.length) sourceMap.length = text.length;

  return { text, spans, sourceMap };
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs.
 */
export function parseMarkdown(markdown: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const rawLines = markdown.split('\n');

  // Precompute starting offset of each raw line in the original markdown.
  // lineOffsets[i] = offset of first char of rawLines[i]. Line terminator '\n'
  // contributes exactly 1 character between consecutive lines.
  const lineOffsets: number[] = new Array(rawLines.length);
  {
    let cur = 0;
    for (let k = 0; k < rawLines.length; k++) {
      lineOffsets[k] = cur;
      cur += rawLines[k]!.length + 1; // +1 for the '\n' that was split away
    }
  }

  const lineEndOffset = (k: number): number =>
    lineOffsets[k]! + rawLines[k]!.length;

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const rawText = stripInlineFormatting(headingMatch[2]!);
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, [
        { text: rawText, bold: false, italic: false },
      ]);
      blocks.push({
        type: 'heading',
        text: mapping.text,
        spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
        level: headingMatch[1]!.length,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
      i++;
      continue;
    }

    // List items — unordered (`-`, `*`, `+`), ordered (`1.`, `1)`) and
    // GFM task (`- [ ]`, `- [x]`). Consume consecutive list lines of any kind
    // (nesting and mixed kinds are allowed); the pipeline segments ordered
    // runs by kind and depth for numbering.
    const isListStart =
      TASK_ITEM_RE.test(line) || ORDERED_LIST_ITEM_RE.test(line) || LIST_ITEM_RE.test(line);
    if (isListStart) {
      while (i < rawLines.length) {
        const curRaw = rawLines[i]!;
        const taskMatch = curRaw.match(TASK_ITEM_RE);
        const orderedMatch = !taskMatch ? curRaw.match(ORDERED_LIST_ITEM_RE) : null;
        const unorderedMatch = !taskMatch && !orderedMatch ? curRaw.match(LIST_ITEM_RE) : null;
        const anyMatch = taskMatch ?? orderedMatch ?? unorderedMatch;
        if (anyMatch) {
          const leading = anyMatch[1]!.length;
          const depth = Math.max(1, Math.min(5, Math.floor(leading / 2) + 1));
          const srcStart = lineOffsets[i]!;
          const srcEnd = lineEndOffset(i);

          let listKind: ListKind;
          let itemText: string;
          let markerLength: number;
          let startNumber: number | undefined;
          let checked: boolean | undefined;

          if (taskMatch) {
            listKind = 'task';
            checked = taskMatch[3] !== ' ';
            itemText = taskMatch[4]!;
            // leading spaces + bullet (1) + space (1) + `[x]` (3) + space (1)
            markerLength = taskMatch[2]!.length + 1 + 3 + 1;
          } else if (orderedMatch) {
            listKind = 'ordered';
            startNumber = parseInt(orderedMatch[2]!, 10);
            itemText = orderedMatch[4]!;
            // number digits + separator (1) + space (1)
            markerLength = orderedMatch[2]!.length + 1 + 1;
          } else {
            listKind = 'unordered';
            itemText = unorderedMatch![3]!;
            markerLength = unorderedMatch![2]!.length + 1;
          }

          const rawSpans = parseInlineFormatting(itemText);
          const contentOffset = leading + markerLength;
          const itemSrcStart = srcStart + contentOffset;
          const mapping = buildBlockMapping(markdown, itemSrcStart, srcEnd, rawSpans);
          const block: ContentBlock = {
            type: 'listItem',
            text: mapping.text,
            spans: mapping.spans.length > 0 ? mapping.spans : [{ text: '', bold: false, italic: false }],
            depth,
            listKind,
            sourceStart: srcStart,
            sourceEnd: srcEnd,
            sourceMap: mapping.sourceMap,
          };
          if (startNumber !== undefined) block.startNumber = startNumber;
          if (checked !== undefined) block.checked = checked;
          blocks.push(block);
          i++;
          continue;
        }
        // Blank line: allow a single blank followed by another list item.
        if (
          curRaw.trim() === '' &&
          i + 1 < rawLines.length &&
          (TASK_ITEM_RE.test(rawLines[i + 1]!) ||
            ORDERED_LIST_ITEM_RE.test(rawLines[i + 1]!) ||
            LIST_ITEM_RE.test(rawLines[i + 1]!))
        ) {
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // Blockquote — collect consecutive > lines
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      const startIdx = i;
      let lastIdx = i;
      while (i < rawLines.length) {
        const ql = rawLines[i]!.trim();
        if (!ql.startsWith('>')) break;
        quoteLines.push(ql.replace(/^>\s?/, ''));
        lastIdx = i;
        i++;
      }
      const rawSpans = parseInlineFormatting(quoteLines.join(' '));
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      blocks.push({
        type: 'blockquote',
        text: mapping.text,
        spans: mapping.spans,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    const startIdx = i;
    let lastIdx = i;
    while (i < rawLines.length) {
      const rawLine = rawLines[i]!;
      const pl = rawLine.trim();
      if (pl === '' || pl.match(HEADING_RE) || pl.startsWith('>') || rawLine.match(LIST_ITEM_RE)) break;
      paraLines.push(pl);
      lastIdx = i;
      i++;
    }
    if (paraLines.length > 0) {
      const rawSpans = parseInlineFormatting(paraLines.join(' '));
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      blocks.push({
        type: 'paragraph',
        text: mapping.text,
        spans: mapping.spans,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: mapping.sourceMap,
      });
    }
  }

  return blocks;
}
