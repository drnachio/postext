/**
 * Drop caps in body paragraphs (#623). A paragraph style (the first
 * paragraph of a `:::paragraphs` group, or each one) or a heading level or
 * style (the first body paragraph after the heading) opens a paragraph with
 * its first letter set large. The letter is taken out of the text the
 * measurers break, and the paragraph's first `sink` lines are indented by
 * its width and the gap (`MeasureBlockOptions.lineIndentsPx`, #620), so
 * Knuth–Plass, the line-by-line breakers and the CJK composer set them
 * short like any indented line; the block carries the letter
 * (`VDTBlock.dropCap`) for the renderers to paint beside them. The plain
 * text and source map stay the paragraph's own: the first line's
 * `plainStart` counts past the letter, which holds the range before it.
 *
 * Decided here: whether a paragraph takes a drop cap, what it prints, its
 * size (cap heights measured from the faces), the indents and the lead-in.
 * The placement (`build.ts`) keeps a raised initial's rise clear above the
 * paragraph, never breaks it before its line `sink` and stamps the letter on
 * the fragment that holds its first line.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import type { ResolvedConfig } from '../vdt';
import type { BlockStyle } from './styles';
import type { HeadingLevelResolver } from './headingStyles';
import { dropCapAttr, readDropCap, type DropCapSettings } from '../defaults/dropCap';
import { buildFontString } from '../measure';
import { measureInkBox, measureTextWidth, onTextWidthCacheClear } from '../measure/canvas';
import { fontFamilyOf } from '../measure/vertical';
import { graphemesOf } from '../measure/graphemes';
import { hasCJK } from '../measure/cjk';
import { joinsWithNext } from '../bidi';
import { dimensionToPx } from '../units';
import { isMarkerBlock } from './buildHelpers';
import { uppercasePreservingLength } from './buildBlockKind';

/** The share of a letter's size its capitals take when a face gives no
 *  ink metrics (the design text's `CAP_HEIGHT_RATIO`, EF-127). */
export const FALLBACK_CAP_HEIGHT_RATIO = 0.72;

// ---------------------------------------------------------------------------
// Which paragraphs open with a drop cap
// ---------------------------------------------------------------------------

/** What the structure says about a paragraph: the innermost `:::paragraphs`
 *  group it sits in (its start marker's content index) and whether it is
 *  the group's first paragraph, and whether it sits in a box. */
interface ParagraphPlace {
  group?: number;
  first: boolean;
  inBox: boolean;
}

const placesMemo = new WeakMap<readonly ContentBlock[], (ParagraphPlace | undefined)[]>();

/** A paragraph of running text: not a poem, a note, a contents or index
 *  row, a bibliography entry. */
function isRunningParagraph(b: ContentBlock): boolean {
  return b.type === 'paragraph' && b.verse === undefined && b.footnoteDef === undefined && b.footnoteNote === undefined
    && b.toc === undefined && b.index === undefined && b.bibEntry === undefined;
}

/** {@link ParagraphPlace} of every paragraph of `blocks`, computed once per
 *  parse. */
function placesOf(blocks: readonly ContentBlock[]): (ParagraphPlace | undefined)[] {
  const hit = placesMemo.get(blocks);
  if (hit) return hit;
  const out = new Array<ParagraphPlace | undefined>(blocks.length);
  const open: { name: string | undefined; start: number; seen: boolean }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'containerStart') {
      open.push({ name: b.containerName, start: i, seen: false });
      continue;
    }
    if (b.type === 'containerEnd') {
      open.pop();
      continue;
    }
    if (!isRunningParagraph(b)) continue;
    let group: (typeof open)[number] | undefined;
    for (let j = open.length - 1; j >= 0; j--) if (open[j]!.name === 'paragraphs') { group = open[j]; break; }
    out[i] = {
      ...(group ? { group: group.start } : {}),
      first: group ? !group.seen : false,
      inBox: open.some((c) => c.name === 'callout'),
    };
    if (group) group.seen = true;
  }
  placesMemo.set(blocks, out);
  return out;
}

/** What the drop cap decision reads besides the block. */
export interface DropCapContext {
  resolved: ResolvedConfig;
  contentBlocks: readonly ContentBlock[];
  headingLevels?: HeadingLevelResolver;
  floatedIds: ReadonlySet<string>;
  /** Boxes that left the flow (see `BlockMeasureContext.leftFlow`). */
  leftFlow?: ReadonlySet<number>;
}

/** The content index of the heading the paragraph at `idx` follows, looking
 *  past directives, markers, boxes that left the flow and floated
 *  resources (the rules `bodyText.indentAfterHeading` reads, EF-67). */
function headingBefore(idx: number, ctx: DropCapContext): number | undefined {
  const blocks = ctx.contentBlocks;
  let i = idx - 1;
  while (i >= 0) {
    const prev = blocks[i]!;
    if (prev.type === 'heading') return i;
    if (prev.type === 'containerEnd' && ctx.leftFlow && ctx.leftFlow.size > 0 && prev.containerId !== undefined) {
      let start = i - 1;
      while (start >= 0 && !(blocks[start]!.type === 'containerStart' && blocks[start]!.containerId === prev.containerId)) start--;
      if (start >= 0 && ctx.leftFlow.has(start)) {
        i = start - 1;
        continue;
      }
    }
    if (prev.type === 'resourceBlock' && prev.resourceId !== undefined && ctx.floatedIds.has(prev.resourceId)) {
      i--;
      continue;
    }
    // A box's own start: the paragraph is the box's (never reached for
    // one, which `inBox` already turned away).
    if (prev.type === 'containerStart' && prev.containerName === 'callout') return undefined;
    if (prev.type !== 'directive' && !isMarkerBlock(prev)) return undefined;
    i--;
  }
  return undefined;
}

/** The drop cap the paragraph `raw` (content index `idx`, set in `style`)
 *  opens with, or undefined. */
export function paragraphDropCap(raw: ContentBlock, idx: number, style: BlockStyle, ctx: DropCapContext): DropCapSettings | undefined {
  const blocks = ctx.contentBlocks;
  if (blocks[idx] !== raw || !isRunningParagraph(raw)) return undefined;
  const place = placesOf(blocks)[idx];
  if (!place || place.inBox) return undefined;
  if (place.group !== undefined) {
    const attr = dropCapAttr(blocks[place.group]!.containerAttrs);
    if (attr === 'off') return undefined;
    const own = style.dropCap;
    if ((own || attr !== undefined) && (place.first || own?.each === true)) {
      return readDropCap(own ?? {}, typeof attr === 'number' ? attr : undefined);
    }
  }
  const at = headingBefore(idx, ctx);
  if (at === undefined) return undefined;
  const heading = blocks[at]!;
  const attr = dropCapAttr(heading.attrs);
  if (attr === 'off') return undefined;
  const level = ctx.headingLevels?.forBlock(heading) ?? ctx.resolved.headings.levels.find((l) => l.level === heading.level);
  const cap = level?.dropCap;
  if (!cap && attr === undefined) return undefined;
  return readDropCap(cap ?? {}, typeof attr === 'number' ? attr : undefined);
}

/** Whether the first body paragraph after the heading at `headingIdx`
 *  opens with a drop cap, and how many lines it sinks: what a heading kept
 *  with its text needs under it. */
export function dropCapSinkAfter(headingIdx: number, ctx: DropCapContext): number {
  const blocks = ctx.contentBlocks;
  for (let i = headingIdx + 1; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'directive' || isMarkerBlock(b)) continue;
    if (b.type === 'resourceBlock' && b.resourceId !== undefined && ctx.floatedIds.has(b.resourceId)) continue;
    if (!isRunningParagraph(b)) return 0;
    const heading = blocks[headingIdx]!;
    const attr = dropCapAttr(heading.attrs);
    if (attr === 'off') return 0;
    const level = ctx.headingLevels?.forBlock(heading) ?? ctx.resolved.headings.levels.find((l) => l.level === heading.level);
    const cap = level?.dropCap;
    if (!cap && attr === undefined) return 0;
    return readDropCap(cap ?? {}, typeof attr === 'number' ? attr : undefined).sink;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// The letter, its size and the lines it shortens
// ---------------------------------------------------------------------------

const capHeights = new Map<string, number>();
onTextWidthCacheClear(() => capHeights.clear());

/** How far the capitals of `font` rise above the baseline (px): the ink of
 *  `sample` (an `H`, or the initial itself in CJK text), else 0.72 of the
 *  size. */
export function capHeightOf(font: string, sizePx: number, sample = 'H'): number {
  const key = `${font}\u0000${sample}`;
  const hit = capHeights.get(key);
  if (hit !== undefined) return hit;
  const ink = measureInkBox(sample, font);
  const value = ink && ink.ascent > 0 ? ink.ascent : sizePx * FALLBACK_CAP_HEIGHT_RATIO;
  capHeights.set(key, value);
  return value;
}

const FONT_RE = /^(?:(italic|oblique)\s+)?(?:(bold|bolder|lighter|\d{3})\s+)?(\d+(?:\.\d+)?)px\s/;

/** The weight a font string sets (`'normal'` when none). */
function weightOf(font: string): string {
  return FONT_RE.exec(font)?.[2] ?? 'normal';
}

/** An opening mark: quotes, brackets, `¿`, `¡`. */
const OPENING_RE = /^[\p{Ps}\p{Pi}¿¡"'«‹„‚]+/u;
const LETTER_RE = /[\p{L}\p{N}]/u;
const SPACE_RE = /\s/;

/** The paragraph a drop cap opens, ready to measure, and the letter. */
export interface PreparedDropCap {
  /** The block without the initial (and with the lead-in), as measured. */
  block: ContentBlock;
  /** The plain-text range taken out of `block.text` (the initial, an
   *  opening mark set with it or hung, the space after a one-letter
   *  word). */
  removed: { start: number; end: number };
  /** What the initial prints, its face and size, its advance. */
  text: string;
  fontString: string;
  fontSizePx: number;
  width: number;
  color: string;
  /** The indent of each of the first `sink` lines (the initial's width and
   *  the gap; line 0 a word space more after a one-letter word). */
  indents: number[];
  /** px the initial's capitals rise above those of the first line (a
   *  raised initial). */
  rise: number;
  lines: number;
  sink: number;
  /** The plain range the initial stands for (an opening mark hung or set
   *  with it included). */
  plainStart: number;
  plainEnd: number;
  word: string;
  wordRest: number;
  hang?: { text: string; fontString: string; width: number };
  settings: DropCapSettings;
}

/** Why a paragraph meant to open with a drop cap does not. */
export type DropCapSkip = 'joiningScript' | 'noLetter';

/** A span the initial may be taken from: text as written. */
function plainSpan(s: InlineSpan): boolean {
  return !(s.ref || s.footnote || s.mathRender || s.citation || s.chip || s.swatch || s.tab || s.inserted || s.labelTab
    || s.fixedSpace || s.ruby || s.warichu || s.kunten);
}

/** `spans` with the plain range `[start, end)` of their joined text taken
 *  out, links shifted. */
function cutSpans(spans: readonly InlineSpan[], start: number, end: number): InlineSpan[] {
  const out: InlineSpan[] = [];
  let at = 0;
  for (const s of spans) {
    const a = at;
    const b = at + s.text.length;
    at = b;
    if (b <= start || a >= end) {
      out.push(s);
      continue;
    }
    const cutFrom = Math.max(start, a) - a;
    const cutTo = Math.min(end, b) - a;
    const text = s.text.slice(0, cutFrom) + s.text.slice(cutTo);
    if (text.length === 0) continue;
    const removed = cutTo - cutFrom;
    const links = s.links
      ?.map((l) => ({
        ...l,
        start: l.start >= cutTo ? l.start - removed : Math.min(l.start, cutFrom),
        end: l.end >= cutTo ? l.end - removed : Math.min(l.end, cutFrom),
      }))
      .filter((l) => l.end > l.start);
    out.push({ ...s, text, ...(s.links ? { links: links && links.length > 0 ? links : undefined } : {}) });
  }
  return out;
}

/** `spans` with the range `[0, end)` of their joined text in small capitals
 *  or capitals (a lead-in). */
function leadInSpans(spans: readonly InlineSpan[], end: number, smallCaps: boolean, uppercase: boolean): InlineSpan[] {
  const out: InlineSpan[] = [];
  let at = 0;
  const mark = (s: InlineSpan): InlineSpan => ({
    ...s,
    ...(uppercase ? { text: uppercasePreservingLength(s.text) } : {}),
    ...(smallCaps ? { smallCaps: true } : {}),
  });
  for (const s of spans) {
    const a = at;
    at += s.text.length;
    if (a >= end || !plainSpan(s)) {
      out.push(s);
      continue;
    }
    if (at <= end) {
      out.push(mark(s));
      continue;
    }
    const k = end - a;
    const shift = (from: number) => s.links
      ?.map((l) => ({ ...l, start: Math.max(0, l.start - from), end: Math.max(0, l.end - from) }))
      .filter((l) => l.end > l.start);
    const head = { ...s, text: s.text.slice(0, k), ...(s.links ? { links: s.links.filter((l) => l.start < k).map((l) => ({ ...l, end: Math.min(l.end, k) })) } : {}) };
    const tail = { ...s, text: s.text.slice(k), ...(s.links ? { links: shift(k) } : {}) };
    out.push(mark(head), tail);
  }
  return out;
}

/** Where the first `words` words of `text` end (past the last one's
 *  letters, before the space after it). */
function wordsEnd(text: string, words: number): number {
  let i = 0;
  let n = 0;
  while (i < text.length && n < words) {
    while (i < text.length && SPACE_RE.test(text[i]!)) i++;
    if (i >= text.length) break;
    while (i < text.length && !SPACE_RE.test(text[i]!)) i++;
    n++;
  }
  return i;
}

/**
 * Take the initial out of the paragraph `block` (set in `style`) and work
 * out its face, size, width and the indents of the lines it shortens.
 * `leadInWords` is the number of words the lead-in takes when its setting
 * says `'line'` and the first setting counted them.
 */
export function prepareDropCap(
  block: ContentBlock,
  settings: DropCapSettings,
  style: BlockStyle,
  resolved: ResolvedConfig,
  leadInWords?: number,
): PreparedDropCap | DropCapSkip {
  const text = block.text;
  const opening = OPENING_RE.exec(text)?.[0] ?? '';
  const pLen = opening.length;
  // The letters: whole grapheme clusters, letters or digits, no further
  // than the first word.
  const graphemes = graphemesOf(text.slice(pLen, pLen + 48));
  let gLen = 0;
  let count = 0;
  let lastStart = pLen;
  for (const g of graphemes) {
    if (count >= settings.characters || !LETTER_RE.test(g)) break;
    lastStart = pLen + gLen;
    gLen += g.length;
    count++;
  }
  if (count === 0) return 'noLetter';
  // A letter joined to the next one (Arabic) is never set apart.
  if (joinsWithNext(text, lastStart)) return 'joiningScript';
  // The initial must come from text as written, not from a reference's
  // label or a note mark the spans print in its place.
  const head = pLen + gLen;
  let joined = 0;
  for (const s of block.spans) {
    if (joined >= head) break;
    if (!plainSpan(s)) return 'noLetter';
    joined += s.text.length;
  }
  if (block.spans.map((s) => s.text).join('').slice(0, head) !== text.slice(0, head)) return 'noLetter';

  const punctuation = pLen > 0 ? settings.punctuation : 'with-cap';
  const letterStart = punctuation === 'with-cap' ? 0 : pLen;
  // `'text'`: the mark stays at the start of the first line.
  const removeStart = punctuation === 'text' ? pLen : 0;
  let removeEnd = head;
  // The rest of the first word goes on after the initial with no space; a
  // one-letter word keeps its word space (on the first line's indent).
  let spaceAfter = false;
  while (removeEnd < text.length && SPACE_RE.test(text[removeEnd]!)) {
    removeEnd++;
    spaceAfter = true;
  }
  const capText = text.slice(letterStart, head);
  // The whole first word, for a tagged PDF's /ActualText.
  const cjk = hasCJK(capText);
  let wordEnd = head;
  if (!cjk) while (wordEnd < text.length && !SPACE_RE.test(text[wordEnd]!) && !hasCJK(text[wordEnd]!)) wordEnd++;
  const word = text.slice(0, wordEnd);
  const wordRest = (punctuation === 'text' ? pLen : 0) + (wordEnd - head);

  // Face and size.
  const dpi = resolved.page.dpi;
  const family = settings.fontFamily ?? fontFamilyOf(style.fontString);
  const weight = settings.fontWeight !== undefined ? (settings.fontWeight === 400 ? 'normal' : String(settings.fontWeight)) : weightOf(style.fontString);
  const slant = settings.italic ? 'italic' : 'normal';
  const sample = cjk ? capText : 'H';
  const textCap = capHeightOf(style.fontString, style.fontSizePx, cjk ? capText : 'H');
  let fontSizePx: number;
  if (settings.fontSize) {
    fontSizePx = dimensionToPx(settings.fontSize, dpi, style.fontSizePx);
  } else {
    // Its capitals reach those of the first line from the baseline of line
    // `lines`: cap heights scale with the size, read at 100 px.
    const ratio = capHeightOf(buildFontString(family, 100, weight, slant), 100, sample) / 100;
    const target = textCap + (settings.lines - 1) * style.lineHeightPx;
    fontSizePx = target / (ratio > 0 ? ratio : FALLBACK_CAP_HEIGHT_RATIO);
  }
  if (!(fontSizePx > 0) || !Number.isFinite(fontSizePx)) fontSizePx = style.fontSizePx;
  const fontString = buildFontString(family, fontSizePx, weight, slant);
  const width = measureTextWidth(capText, fontString);
  const gapPx = Math.max(0, dimensionToPx(settings.gap, dpi, style.fontSizePx));
  const capCap = capHeightOf(fontString, fontSizePx, sample);
  const rise = Math.max(0, capCap - (settings.sink - 1) * style.lineHeightPx - textCap);
  const room = width + gapPx;
  const space = spaceAfter ? measureTextWidth(' ', style.fontString) : 0;
  const indents = Array.from({ length: settings.sink }, (_, i) => room + (i === 0 ? space : 0));

  let stripped: ContentBlock = {
    ...block,
    text: text.slice(0, removeStart) + text.slice(removeEnd),
    spans: cutSpans(block.spans, removeStart, removeEnd),
    sourceMap: [...block.sourceMap.slice(0, removeStart), ...block.sourceMap.slice(removeEnd)],
  };
  // The lead-in: the first words after the initial.
  const leadIn = settings.leadIn;
  if (leadIn && (leadIn.smallCaps || leadIn.uppercase)) {
    const n = leadIn.words === 'line' ? leadInWords : leadIn.words;
    if (n !== undefined && n > 0) {
      const end = wordsEnd(stripped.text, n);
      stripped = {
        ...stripped,
        ...(leadIn.uppercase ? { text: uppercasePreservingLength(stripped.text.slice(0, end)) + stripped.text.slice(end) } : {}),
        spans: leadInSpans(stripped.spans, end, leadIn.smallCaps, leadIn.uppercase),
      };
    }
  }
  const hang = punctuation === 'hang'
    ? { text: opening, fontString: style.fontString, width: measureTextWidth(opening, style.fontString) }
    : undefined;
  return {
    block: stripped,
    removed: { start: removeStart, end: removeEnd },
    text: capText,
    fontString,
    fontSizePx,
    width,
    color: settings.color?.hex ?? style.color,
    indents,
    rise,
    lines: settings.lines,
    sink: settings.sink,
    plainStart: punctuation === 'text' ? pLen : 0,
    plainEnd: head,
    word,
    wordRest,
    ...(hang ? { hang } : {}),
    settings,
  };
}

/** A plain offset of the measured text (the initial taken out) as an
 *  offset of the paragraph's own text. */
export function fullPlainOffset(prepared: Pick<PreparedDropCap, 'removed'>, offset: number): number {
  return offset >= prepared.removed.start ? offset + (prepared.removed.end - prepared.removed.start) : offset;
}

/** A drop cap as the placement reads it from a measured block (see
 *  `MeasuredContentBlock.dropCap`): the letter's geometry relative to the
 *  block's column. */
export interface MeasuredDropCap {
  text: string;
  fontString: string;
  fontSizePx: number;
  color: string;
  width: number;
  /** Left edge of the initial, from the column's left edge (flow frame). */
  x: number;
  lines: number;
  sink: number;
  /** px kept clear above the paragraph's first line (a raised initial). */
  rise: number;
  /** The block is set at least this many lines tall (`'reserve'`). */
  minLines: number;
  plainStart: number;
  plainEnd: number;
  sourceStart?: number;
  sourceEnd?: number;
  word: string;
  wordRest: number;
  hang?: { text: string; fontString: string; x: number; width: number };
}
