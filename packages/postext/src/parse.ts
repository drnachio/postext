// ---------------------------------------------------------------------------
// Minimal block-level markdown tokenizer
// ---------------------------------------------------------------------------

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'mathDisplay';

/** Metadata attached to an `InlineSpan` when it represents a math formula.
 *  The span's `text` is a single `\uFFFC` (object replacement character)
 *  acting as a one-char-wide atomic placeholder in the plain text. */
export interface MathMeta {
  tex: string;
  /** Absolute source offset of the opening `$` in the original markdown. */
  sourceStart: number;
  /** Absolute source offset just past the closing `$`. */
  sourceEnd: number;
}

export interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Present when this span carries an inline math formula. The `text` is
   *  a single `\uFFFC` placeholder that layout treats atomically. */
  math?: MathMeta;
  /** Resolved math render — populated by the pipeline before measurement
   *  so the parser remains free of MathJax dependencies. */
  mathRender?: import('./math/types').MathRender;
}

/** Convenience discriminants for inline span iteration. */
export type TextSpan = InlineSpan & { math?: undefined };
export type MathSpan = InlineSpan & { math: MathMeta };

export type ListKind = 'unordered' | 'ordered' | 'task';

export type ParseIssueKind = 'unclosedMath' | 'unclosedMathBlock';

export interface ParseIssue {
  kind: ParseIssueKind;
  delimiter: '$' | '$$';
  /** Absolute source offset of the unmatched opening delimiter. */
  sourceStart: number;
  /** End of the scanned region (usually the line or block end). */
  sourceEnd: number;
  /** Raw TeX captured up to the end of the scanned region, for warning
   *  messages — may be empty. */
  tex: string;
}

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
  /** TeX source for `mathDisplay` blocks. */
  tex?: string;
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

/** Object Replacement Character — atomic plain-text placeholder for a math
 *  span. One code unit per formula so `sourceMap` stays 1-to-1. */
export const MATH_PLACEHOLDER = '\uFFFC';

/** One-line `$$ ... $$` display math (the whole line is the formula). */
const BLOCK_MATH_SINGLE_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
/** Standalone `$$` marker (opening or closing a multi-line display block). */
const BLOCK_MATH_FENCE_RE = /^\s*\$\$\s*$/;

/** Extract inline `$...$` math spans from a line's text.
 *  - Returns a cleaned text where each match is replaced by `MATH_PLACEHOLDER`.
 *  - Returns the list of math metadata aligned with the order of placeholders.
 *  - Detects unclosed `$` (odd number of unescaped `$` in the text).
 *
 *  `absOffsets[i]` is the absolute source offset of `text[i]` in the original
 *  markdown; used to emit accurate `sourceStart`/`sourceEnd` on each math
 *  span. When the caller cannot provide an exact map (e.g. text has been
 *  reassembled from multiple source lines) it can pass `null` and math
 *  offsets will default to the block's source range.
 */
function extractInlineMath(
  text: string,
  absOffsets: number[] | null,
  fallbackStart: number,
  fallbackEnd: number,
): { cleaned: string; maths: MathMeta[]; issues: ParseIssue[] } {
  const maths: MathMeta[] = [];
  const issues: ParseIssue[] = [];
  let out = '';
  let i = 0;
  const absAt = (idx: number): number => {
    if (absOffsets && idx < absOffsets.length) return absOffsets[idx]!;
    if (absOffsets && absOffsets.length > 0) return absOffsets[absOffsets.length - 1]! + (idx - (absOffsets.length - 1));
    return fallbackStart + idx;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && text[i + 1] === '$') {
      // Escaped dollar sign — keep as literal `$` in output.
      out += '$';
      i += 2;
      continue;
    }
    if (ch !== '$') {
      out += ch;
      i++;
      continue;
    }
    // Found a '$'. Skip display-math `$$` sequences — those are handled at
    // block level, so inside a paragraph we treat `$$` as literal.
    if (text[i + 1] === '$') {
      out += '$$';
      i += 2;
      continue;
    }
    // Scan for the matching closing `$`, honouring `\$` escapes.
    let j = i + 1;
    let foundClose = -1;
    while (j < text.length) {
      if (text[j] === '\\' && text[j + 1] === '$') {
        j += 2;
        continue;
      }
      if (text[j] === '$') {
        foundClose = j;
        break;
      }
      // Bail on newline — inline math must be on a single line.
      if (text[j] === '\n') break;
      j++;
    }
    if (foundClose < 0) {
      issues.push({
        kind: 'unclosedMath',
        delimiter: '$',
        sourceStart: absAt(i),
        sourceEnd: fallbackEnd,
        tex: text.slice(i + 1),
      });
      out += text.slice(i);
      break;
    }
    const tex = text.slice(i + 1, foundClose).replace(/\\\$/g, '$');
    maths.push({ tex, sourceStart: absAt(i), sourceEnd: absAt(foundClose) + 1 });
    out += MATH_PLACEHOLDER;
    i = foundClose + 1;
  }
  return { cleaned: out, maths, issues };
}

/** Walk an InlineSpan list and attach MathMeta to each `\uFFFC` occurrence
 *  in order. Splits plain-text spans around the placeholder so the math
 *  span is its own entry (carrying the ambient bold/italic). */
function injectMathSpans(spans: InlineSpan[], maths: MathMeta[]): InlineSpan[] {
  if (maths.length === 0) return spans;
  const out: InlineSpan[] = [];
  let idx = 0;
  for (const span of spans) {
    if (span.text.indexOf(MATH_PLACEHOLDER) < 0) {
      out.push(span);
      continue;
    }
    let buf = '';
    for (const ch of span.text) {
      if (ch === MATH_PLACEHOLDER) {
        if (buf.length > 0) {
          out.push({ text: buf, bold: span.bold, italic: span.italic });
          buf = '';
        }
        const meta = maths[idx++];
        if (meta) {
          out.push({
            text: MATH_PLACEHOLDER,
            bold: span.bold,
            italic: span.italic,
            math: meta,
          });
        }
      } else {
        buf += ch;
      }
    }
    if (buf.length > 0) {
      out.push({ text: buf, bold: span.bold, italic: span.italic });
    }
  }
  return out;
}

/** Overwrite `sourceMap[i]` entries corresponding to math placeholders with
 *  the math span's absolute sourceStart. Keeps click-to-focus accurate for
 *  formulas even though the placeholder char has no direct source match. */
function fixMathSourceMap(text: string, spans: InlineSpan[], sourceMap: number[]): void {
  if (sourceMap.length === 0) return;
  // Walk spans in order, tracking plain-text position. Each math span
  // contributes exactly one placeholder char whose sourceMap entry we
  // overwrite with its span's sourceStart.
  let p = 0;
  for (const span of spans) {
    if (span.math && p < sourceMap.length) {
      sourceMap[p] = span.math.sourceStart;
    }
    p += span.text.length;
    if (p > text.length) break;
  }
}

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
    // Math placeholder: the plain char represents `$...$` in the markdown.
    // Advance to the opening `$`, map to it, then skip past the closing `$`
    // so subsequent plain chars can keep aligning with the source.
    if (ch === MATH_PLACEHOLDER) {
      while (r < blockSrcEnd && markdown[r] !== '$') r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r + 1;
      while (j < blockSrcEnd) {
        if (markdown[j] === '\\' && markdown[j + 1] === '$') { j += 2; continue; }
        if (markdown[j] === '$') { j++; break; }
        if (markdown[j] === '\n') break;
        j++;
      }
      r = j;
      continue;
    }
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

// Single-slot memo used by parseMarkdownMemo. The returned array and its
// ContentBlocks are treated as read-only by the rest of the pipeline.
let _parseMemoInput: string | null = null;
let _parseMemoResult: { blocks: ContentBlock[]; issues: ParseIssue[] } | null = null;

/**
 * Memoized wrapper around parseMarkdown: returns the cached result when the
 * input string is byte-for-byte identical to the previous call. This avoids
 * reparsing the whole document on each keystroke when upstream recomputes
 * only because a sibling state changed.
 */
export function parseMarkdownMemo(markdown: string): ContentBlock[] {
  if (_parseMemoResult !== null && _parseMemoInput === markdown) {
    return _parseMemoResult.blocks;
  }
  const result = parseMarkdownWithIssues(markdown);
  _parseMemoInput = markdown;
  _parseMemoResult = result;
  return result.blocks;
}

export function parseMarkdownWithIssuesMemo(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  if (_parseMemoResult !== null && _parseMemoInput === markdown) {
    return _parseMemoResult;
  }
  const result = parseMarkdownWithIssues(markdown);
  _parseMemoInput = markdown;
  _parseMemoResult = result;
  return result;
}

export function parseMarkdown(markdown: string): ContentBlock[] {
  return parseMarkdownWithIssues(markdown).blocks;
}

/**
 * Merge consecutive blockquote lines into a single block, and consecutive
 * non-blank, non-special lines into paragraphs.
 */
export function parseMarkdownWithIssues(markdown: string): { blocks: ContentBlock[]; issues: ParseIssue[] } {
  const blocks: ContentBlock[] = [];
  const issues: ParseIssue[] = [];
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

    // Display math — single-line `$$ ... $$`
    const singleMath = line.match(BLOCK_MATH_SINGLE_RE);
    if (singleMath) {
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      blocks.push({
        type: 'mathDisplay',
        text: '',
        spans: [],
        tex: singleMath[1]!,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      i++;
      continue;
    }

    // Display math — multi-line `$$` ... `$$` (opening fence on its own line).
    if (BLOCK_MATH_FENCE_RE.test(line)) {
      const startIdx = i;
      i++;
      const texLines: string[] = [];
      let closed = false;
      while (i < rawLines.length) {
        if (BLOCK_MATH_FENCE_RE.test(rawLines[i]!)) {
          closed = true;
          break;
        }
        texLines.push(rawLines[i]!);
        i++;
      }
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = closed ? lineEndOffset(i) : lineEndOffset(i - 1);
      if (!closed) {
        issues.push({
          kind: 'unclosedMathBlock',
          delimiter: '$$',
          sourceStart: srcStart,
          sourceEnd: srcEnd,
          tex: texLines.join('\n'),
        });
      }
      blocks.push({
        type: 'mathDisplay',
        text: '',
        spans: [],
        tex: texLines.join('\n'),
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        sourceMap: [],
      });
      if (closed) i++; // consume the closing fence
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const headingRawContent = headingMatch[2]!;
      const srcStart = lineOffsets[i]!;
      const srcEnd = lineEndOffset(i);
      // Absolute offset of the first content char (after the `# `).
      const prefixLen = line.indexOf(headingRawContent);
      const contentAbsStart = srcStart + (prefixLen >= 0 ? prefixLen : 0);
      const { cleaned, maths, issues: mathIssues } = extractInlineMath(
        headingRawContent,
        null,
        contentAbsStart,
        srcEnd,
      );
      issues.push(...mathIssues);
      const rawText = stripInlineFormatting(cleaned);
      const rawSpans = injectMathSpans(
        [{ text: rawText, bold: false, italic: false }],
        maths,
      );
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
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

          const contentOffset = leading + markerLength;
          const itemSrcStart = srcStart + contentOffset;
          const mathExtract = extractInlineMath(itemText, null, itemSrcStart, srcEnd);
          issues.push(...mathExtract.issues);
          const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
          const mapping = buildBlockMapping(markdown, itemSrcStart, srcEnd, rawSpans);
          fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
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
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const mathExtract = extractInlineMath(quoteLines.join(' '), null, srcStart, srcEnd);
      issues.push(...mathExtract.issues);
      const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
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
      const srcStart = lineOffsets[startIdx]!;
      const srcEnd = lineEndOffset(lastIdx);
      const mathExtract = extractInlineMath(paraLines.join(' '), null, srcStart, srcEnd);
      issues.push(...mathExtract.issues);
      const rawSpans = injectMathSpans(parseInlineFormatting(mathExtract.cleaned), mathExtract.maths);
      const mapping = buildBlockMapping(markdown, srcStart, srcEnd, rawSpans);
      fixMathSourceMap(mapping.text, mapping.spans, mapping.sourceMap);
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

  return { blocks, issues };
}
