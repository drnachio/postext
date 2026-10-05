/**
 * Index marks (`:index[…]` and `:index{…}`, #165): the terms a back-of-book
 * index lists. The marks are taken out of the markdown before the block
 * parser runs — an invisible mark leaves nothing, a visible one leaves its
 * text — so they never change the spans, the line breaks or the layout;
 * the parse result's source offsets are mapped back to the original
 * markdown. Each mark keeps the source offset of the character it is
 * attached to (`anchor`): the build finds the page of the laid-out line
 * holding that character.
 */

import type { AnchorMark, ContentBlock, IndexMark, ParseIssue } from './types';
import { parseDirectiveAttrs } from './attrs';
import { stripInlineFormatting } from './inlineFormatting';

/** `:index[text]{attrs}`, `:index[text]` or `:index{attrs}`: not after a
 *  colon (the `:::index` directive) or a backslash (an escaped mark). The
 *  text is one line and takes `\]` for a literal bracket. */
const INDEX_MARK_RE = /(?<![:\\]):index(?:\[((?:\\.|[^\]\\\n])*)\])?(?:\{([^}\n]*)\})?/g;
/** An inline anchor (#261): `:anchor{#id}` / `:anchor{id="…"}`, not after
 *  a colon or a backslash, and Pandoc's bracketed span `[text]{#id}` whose
 *  text stays, not after a backslash or a `]`/`!` (a link or an image). */
const ANCHOR_MARK_RE = /(?<![:\\]):anchor\{([^}\n]*)\}/g;
const SPAN_ANCHOR_RE = /(?<![\]\\!])\[((?:\\.|[^\]\\\n^])(?:\\.|[^\]\\\n])*)\]\{#([\p{L}\p{N}_][\p{L}\p{N}_.:-]*)\}/gu;
/** Inline code on one line: its marks stay literal, and no mark may start
 *  or end inside it (#413). */
const CODE_SPAN_RE = /`[^`\n]+`/g;

/** A removal from the markdown: `length` characters that sat just before
 *  the character now at `at` in the stripped text. */
interface Removal {
  at: number;
  length: number;
}

/** A mark as extracted, before it is attached to a block. */
interface PendingMark {
  mark: IndexMark | AnchorMark;
  /** Position in the stripped text where the mark was. */
  at: number;
}

export interface IndexMarkExtraction {
  /** The markdown without the marks (a visible mark leaves its text). */
  text: string;
  marks: PendingMark[];
  /** Offset in `text` → offset in the original markdown. */
  toOriginal: (offset: number) => number;
}

const isBlank = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\r';

/** The levels of a term: `Heart!valves` → `['Heart', 'valves']`. */
function termLevels(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value.split('!').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0);
}

/** The printed term of a visible mark: its text without inline marks. */
function plainText(text: string): string {
  return stripInlineFormatting(text.replace(/\\([[\]])/g, '$1')).replace(/\s+/g, ' ').trim();
}

function markFrom(attrsRaw: string | undefined, visible: string | undefined, sourceStart: number, sourceEnd: number): IndexMark {
  const attrs = attrsRaw !== undefined ? parseDirectiveAttrs(attrsRaw) : {};
  let path = termLevels(attrs.term);
  if (path.length === 0 && visible !== undefined) {
    const plain = plainText(visible);
    if (plain.length > 0) path = [plain];
  }
  path = [...path, ...termLevels(attrs.sub)];
  const main = attrs.main !== undefined && attrs.main !== 'false';
  const range = attrs.range === 'start' || attrs.range === 'end' ? attrs.range : undefined;
  const sort = attrs.sort?.trim();
  const see = attrs.see?.trim();
  const seeAlso = attrs.seealso?.trim();
  return {
    index: attrs.index?.trim() ?? '',
    path,
    ...(sort ? { sort } : {}),
    ...(see ? { see } : {}),
    ...(seeAlso ? { seeAlso } : {}),
    ...(main ? { main: true } : {}),
    ...(range ? { range } : {}),
    sourceStart,
    sourceEnd,
    anchor: -1,
    attach: 'after',
  };
}

/**
 * The markdown with its index marks taken out, or null when it holds none.
 * A line left blank by its marks alone is removed with its line end, so a
 * mark on a line of its own never splits a paragraph.
 */
/** One mark found on a line: where it is, its whole text, the text that
 *  stays (a visible mark) and the mark it makes. */
interface LineMatch {
  index: number;
  whole: string;
  /** The text that stays, and where it starts in `whole`. */
  visible?: { text: string; offset: number };
  make: (start: number, end: number) => IndexMark | AnchorMark;
}

/** Whether a line may hold a mark. */
const mayHoldMark = (line: string): boolean => line.includes(':index') || line.includes(':anchor') || line.includes(']{#');

function anchorFrom(id: string, text: string | undefined, sourceStart: number, sourceEnd: number): AnchorMark {
  const plain = text !== undefined ? plainText(text) : '';
  return { anchorId: id, ...(plain ? { text: plain } : {}), sourceStart, sourceEnd, anchor: -1, attach: 'after' };
}

/** The inline code spans of a line, as `[start, end)` ranges. */
function codeSpans(line: string): [number, number][] {
  const code: [number, number][] = [];
  CODE_SPAN_RE.lastIndex = 0;
  for (let m = CODE_SPAN_RE.exec(line); m; m = CODE_SPAN_RE.exec(line)) code.push([m.index, m.index + m[0].length]);
  return code;
}

/** Whether a match starts or ends inside a code span. A match that holds a
 *  whole code span (`:index[`code`]`) keeps it. When it cuts one, the
 *  search goes on from the next character, so a mark after its start is
 *  still found. */
function cutsCode(re: RegExp, m: RegExpExecArray, code: [number, number][]): boolean {
  const start = m.index;
  const end = start + m[0].length;
  if (!code.some(([s, e]) => (start > s && start < e) || (end > s && end < e))) return false;
  re.lastIndex = start + 1;
  return true;
}

/** The marks of one line, in order, none overlapping. */
function lineMatches(line: string): LineMatch[] {
  const out: LineMatch[] = [];
  const code = codeSpans(line);
  INDEX_MARK_RE.lastIndex = 0;
  for (let m = INDEX_MARK_RE.exec(line); m; m = INDEX_MARK_RE.exec(line)) {
    if (cutsCode(INDEX_MARK_RE, m, code)) continue;
    const [whole, visible, attrs] = m;
    if (visible === undefined && attrs === undefined) continue;
    out.push({
      index: m.index,
      whole,
      ...(visible !== undefined && visible.length > 0 ? { visible: { text: visible, offset: ':index['.length } } : {}),
      make: (start, end) => markFrom(attrs, visible, start, end),
    });
  }
  ANCHOR_MARK_RE.lastIndex = 0;
  for (let m = ANCHOR_MARK_RE.exec(line); m; m = ANCHOR_MARK_RE.exec(line)) {
    if (cutsCode(ANCHOR_MARK_RE, m, code)) continue;
    const id = parseDirectiveAttrs(m[1]!).id?.trim();
    if (!id) continue;
    out.push({ index: m.index, whole: m[0], make: (start, end) => anchorFrom(id, undefined, start, end) });
  }
  SPAN_ANCHOR_RE.lastIndex = 0;
  for (let m = SPAN_ANCHOR_RE.exec(line); m; m = SPAN_ANCHOR_RE.exec(line)) {
    if (cutsCode(SPAN_ANCHOR_RE, m, code)) continue;
    const text = m[1]!;
    const id = m[2]!;
    out.push({ index: m.index, whole: m[0], visible: { text, offset: 1 }, make: (start, end) => anchorFrom(id, text, start, end) });
  }
  out.sort((a, b) => a.index - b.index);
  // A mark inside another one (an anchor in an index mark's text) is text.
  const kept: LineMatch[] = [];
  let end = -1;
  for (const m of out) {
    if (m.index < end) continue;
    kept.push(m);
    end = m.index + m.whole.length;
  }
  return kept;
}

export function extractIndexMarks(markdown: string): IndexMarkExtraction | null {
  if (!mayHoldMark(markdown)) return null;
  const pending: { mark: IndexMark | AnchorMark; at: number; textStart?: number }[] = [];
  const removals: Removal[] = [];
  let out = '';
  let lineStart = 0;
  while (lineStart <= markdown.length) {
    const nl = markdown.indexOf('\n', lineStart);
    const lineEnd = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(lineStart, lineEnd);
    if (!mayHoldMark(line)) {
      out += line;
      if (nl !== -1) out += '\n';
      lineStart = lineEnd + 1;
      if (nl === -1) break;
      continue;
    }
    const lineOut = out.length;
    const lineRemovals: Removal[] = [];
    const linePending: typeof pending = [];
    let kept = '';
    let last = 0;
    for (const m of lineMatches(line)) {
      const { whole, visible } = m;
      kept += line.slice(last, m.index);
      const start = lineStart + m.index;
      const mark = m.make(start, start + whole.length);
      if (visible) {
        // `:index[` (or `[`) goes, the text stays, `]{…}` goes.
        lineRemovals.push({ at: lineOut + kept.length, length: visible.offset });
        const textStart = lineOut + kept.length;
        kept += visible.text;
        lineRemovals.push({ at: lineOut + kept.length, length: whole.length - visible.offset - visible.text.length });
        linePending.push({ mark, at: textStart, textStart });
      } else {
        lineRemovals.push({ at: lineOut + kept.length, length: whole.length });
        linePending.push({ mark, at: lineOut + kept.length });
      }
      last = m.index + whole.length;
    }
    kept += line.slice(last);
    if (linePending.length > 0 && kept.trim().length === 0 && line.trim().length > 0) {
      // The line held marks alone: it goes, with its line end.
      removals.push({ at: lineOut, length: line.length + (nl !== -1 ? 1 : 0) });
      for (const p of linePending) pending.push({ mark: p.mark, at: lineOut });
    } else {
      out += kept;
      if (nl !== -1) out += '\n';
      removals.push(...lineRemovals);
      pending.push(...linePending);
    }
    if (nl === -1) break;
    lineStart = lineEnd + 1;
  }
  if (pending.length === 0) return null;

  // Cumulative removed length at each removal, for the offset map.
  const at: number[] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (const r of removals) {
    total += r.length;
    at.push(r.at);
    cumulative.push(total);
  }
  const toOriginal = (offset: number): number => {
    // Removals at or before `offset` (the removed text sat before it).
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (at[mid]! <= offset) lo = mid + 1;
      else hi = mid;
    }
    return offset + (lo > 0 ? cumulative[lo - 1]! : 0);
  };
  /** Offset in the original of the stripped character at `i` (it sits
   *  after the text removed right before it). */
  const charOriginal = toOriginal;

  const text = out;
  for (const p of pending) {
    const { mark } = p;
    if (p.textStart !== undefined) {
      mark.anchor = charOriginal(p.textStart);
      mark.attach = 'after';
      continue;
    }
    // An invisible mark belongs to the text before it on its line, else to
    // the text after it.
    let j = p.at - 1;
    while (j >= 0 && isBlank(text[j])) j--;
    if (j >= 0 && text[j] !== '\n') {
      mark.anchor = charOriginal(j);
      mark.attach = 'before';
      continue;
    }
    let k = p.at;
    while (k < text.length && (isBlank(text[k]) || text[k] === '\n')) k++;
    if (k < text.length) {
      mark.anchor = charOriginal(k);
      mark.attach = 'after';
    }
  }
  return { text, marks: pending.map((p) => ({ mark: p.mark, at: p.at })), toOriginal };
}

/** Blocks a mark can belong to: the ones that set text. */
const TEXT_BLOCKS = new Set<ContentBlock['type']>(['heading', 'paragraph', 'blockquote', 'listItem']);

/**
 * Attach the extracted marks to the blocks parsed from the stripped text
 * (offsets still in stripped coordinates): the text block holding the
 * mark's position, else the next one, else the last one.
 */
export function attachIndexMarks(blocks: ContentBlock[], marks: readonly PendingMark[]): void {
  const text = blocks.filter((b) => TEXT_BLOCKS.has(b.type));
  if (text.length === 0) return;
  for (const { mark, at } of marks) {
    let owner = text.find((b) => at >= b.sourceStart && at <= b.sourceEnd);
    owner ??= text.find((b) => b.sourceStart > at) ?? text[text.length - 1]!;
    if ('anchorId' in mark) (owner.anchorMarks ??= []).push(mark);
    else (owner.indexMarks ??= []).push(mark);
  }
}

/** Map every source offset of a parse result from the stripped text back
 *  to the original markdown. */
export function remapParseOffsets(
  result: { blocks: ContentBlock[]; issues: ParseIssue[] },
  toOriginal: (offset: number) => number,
): void {
  for (const b of result.blocks) {
    b.sourceStart = toOriginal(b.sourceStart);
    b.sourceEnd = toOriginal(b.sourceEnd);
    for (let i = 0; i < b.sourceMap.length; i++) b.sourceMap[i] = toOriginal(b.sourceMap[i]!);
    if (b.attrSources) {
      for (const r of Object.values(b.attrSources)) {
        r.start = toOriginal(r.start);
        r.end = toOriginal(r.end);
      }
    }
    for (const s of b.spans) {
      if (s.math) s.math = { ...s.math, sourceStart: toOriginal(s.math.sourceStart), sourceEnd: toOriginal(s.math.sourceEnd) };
    }
  }
  for (const issue of result.issues) {
    issue.sourceStart = toOriginal(issue.sourceStart);
    issue.sourceEnd = toOriginal(issue.sourceEnd);
  }
}
