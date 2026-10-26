// Footnote markers, swatches, tab stops and chips: each read out of a run
// into a placeholder character and set back as its own span (#1276: split
// out of inlineFormatting.ts).
import type { InlineSpan, InlineIcon, SwatchShape } from '../types.js';
import { injectPlaceholderSpans } from '../injectSpans.js';
import { parseDirectiveAttrs } from '../attrs.js';
import type { Dimension, TabStop } from '../../types.js';
import { parseLengthText, tabStopFromAttrs } from '../../defaults/text/tabStops.js';
import { bracketTextEnd, dataRanges } from './breaks.js';
import { nextBraced } from './crossRefs.js';
import { CODE_SPAN_RE } from './markup.js';
import { parseInlineFormatting, protectDollarEscapes } from './parse.js';

/** Atomic plain-text placeholder for an inline colour swatch span
 *  (`:swatch{…}`), one code unit per swatch like the ref and math
 *  placeholders, and a code point of its own so the three never collide. */
export const SWATCH_PLACEHOLDER = '⁤';

/** Atomic plain-text placeholder for an inline chip (`:chip[…]`), one
 *  code unit per chip. A private-use code point: the chip's words are never
 *  painted from it (they live in the span's `chip.spans`). */
export const CHIP_PLACEHOLDER = '\uE1A0';

/** `text` without its chip placeholders, each with the space before it
 *  (a chip at the start takes the space after it): a heading's title as
 *  its contents entry, running heads and bookmarks read it (#1100). */
export function withoutChips(text: string): string {
  let out = '';
  let dropSpace = false;
  for (const ch of text) {
    if (ch === CHIP_PLACEHOLDER) {
      if (out.endsWith(' ')) out = out.slice(0, -1);
      else if (out.trim() === '') dropSpace = true;
      continue;
    }
    if (dropSpace && ch === ' ') {
      dropSpace = false;
      continue;
    }
    dropSpace = false;
    out += ch;
  }
  return out;
}

/** Atomic plain-text placeholder for a footnote marker (`[^id]`), one code
 *  unit per marker. A private-use code point of its own. */
export const FOOTNOTE_PLACEHOLDER = '\uE1A6';

/** Metadata of an inline footnote marker `[^id]`. */
export interface FootnoteMarkerMeta {
  id: string;
  /** Absolute source offset of the `[`. */
  sourceStart: number;
  /** Absolute source offset just past the `]`. */
  sourceEnd: number;
}

/** `[^id]`: an id of letters, digits, `-`, `_`, `.` or `:`. */
const INLINE_FOOTNOTE_RE = /\[\^([\p{L}\p{N}_.:-]+)\]/gu;

/**
 * Extract footnote markers (`[^id]`) from a line's text, replacing each by
 * `FOOTNOTE_PLACEHOLDER` and returning their metadata in order. Runs right
 * after {@link extractInlineChips}.
 */
export function extractInlineFootnotes(
  text: string,
  fallbackStart: number,
): { cleaned: string; markers: FootnoteMarkerMeta[] } {
  if (!text.includes('[^')) return { cleaned: text, markers: [] };
  const markers: FootnoteMarkerMeta[] = [];
  let out = '';
  let last = 0;
  INLINE_FOOTNOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_FOOTNOTE_RE.exec(text)) !== null) {
    out += text.slice(last, m.index);
    markers.push({
      id: m[1]!,
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.index + m[0].length,
    });
    out += FOOTNOTE_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleaned: out, markers };
}

/** Attach a `footnote` to each `FOOTNOTE_PLACEHOLDER` occurrence in order. */
export function injectFootnoteSpans(spans: InlineSpan[], markers: FootnoteMarkerMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, markers, FOOTNOTE_PLACEHOLDER, (meta, bold, italic) => ({
    text: FOOTNOTE_PLACEHOLDER,
    bold,
    italic,
    footnote: { id: meta.id },
  }));
}

/** Metadata of an inline `:swatch{color="…"}` directive: the colour as
 *  written (a hex, or a palette entry id the pipeline resolves) and its
 *  source extent. */
export interface SwatchMeta {
  color: string;
  /** Absolute source offset of the leading `:` of `:swatch{…}`. */
  sourceStart: number;
  /** Absolute source offset just past the closing `}`. */
  sourceEnd: number;
  /** An inline symbol (`:icon[alt]{…}`, #1058) read in the swatch's
   *  place: `color` is then its tint as written (`''` for none). */
  icon?: InlineIcon;  /** `size`, `border`, `borderColor`, `borderWidth`, `radius` and `gap`
   *  as written (#1104). */
  shape?: SwatchShape;
}

/** The shape attributes of a `:swatch{…}` (#1104): `size`, `radius` and
 *  `gap` lengths (`8pt`, `0.9em`; a bare number is in points), `border`
 *  as `none` or a width and a colour in either order (`1pt #333`),
 *  `borderColor` and `borderWidth` on their own (they win over `border`).
 *  A value that does not read is left out; undefined when none reads. */
export function swatchShapeFromAttrs(attrs: Readonly<Record<string, string>>): SwatchShape | undefined {
  const shape: SwatchShape = {};
  const length = (raw: string | undefined): Dimension | undefined => {
    const d = raw !== undefined ? parseLengthText(raw) : undefined;
    return d && d.value >= 0 ? d : undefined;
  };
  const size = length(attrs.size);
  if (size && size.value > 0) shape.size = size;
  const border = attrs.border?.trim();
  if (border !== undefined && border !== '') {
    if (border.toLowerCase() === 'none') shape.borderWidth = { value: 0, unit: 'pt' };
    else {
      for (const part of border.split(/\s+/)) {
        const width = length(part);
        if (width) shape.borderWidth = width;
        else shape.borderColor = part;
      }
    }
  }
  const borderWidth = length(attrs.borderWidth);
  if (borderWidth) shape.borderWidth = borderWidth;
  const borderColor = attrs.borderColor?.trim();
  if (borderColor) shape.borderColor = borderColor;
  const radius = length(attrs.radius);
  if (radius) shape.radius = radius;
  const gap = length(attrs.gap);
  if (gap) shape.gap = gap;
  return Object.keys(shape).length > 0 ? shape : undefined;
}

const ICON_LINES = ['solid', 'dashed', 'dotted'] as const;

/** The `:icon[alt]{…}` that opens at `index` of `text` (#1058), or null
 *  when it is no symbol: no closing bracket, no attributes on the line,
 *  or none of `resource`, `glyph` and `line` among them. */
function readIcon(text: string, index: number): { end: number; color: string; icon: InlineIcon } | null {
  const from = index + ':icon['.length;
  const read = bracketTextEnd(text, from);
  if (!read.closed || text[read.at + 1] !== '{') return null;
  let close = read.at + 2;
  while (close < text.length && text[close] !== '}' && text[close] !== '\n') close++;
  if (text[close] !== '}') return null;
  const attrs = parseDirectiveAttrs(text.slice(read.at + 2, close));
  const alt = text.slice(from, read.at).replace(/\\([[\]])/g, '$1').replace(/\s+/g, ' ').trim();
  const resource = attrs.resource?.trim();
  const glyph = attrs.glyph;
  const lineRaw = attrs.line?.trim().toLowerCase();
  const sizeRaw = attrs.size !== undefined ? Number(attrs.size.trim()) : NaN;
  const size = Number.isFinite(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined;
  const font = attrs.font?.trim();
  let icon: InlineIcon;
  if (resource) icon = { alt, resource };
  else if (glyph !== undefined && glyph.length > 0) icon = { alt, glyph, ...(font ? { font } : {}) };
  else if (lineRaw !== undefined) icon = { alt, line: (ICON_LINES as readonly string[]).includes(lineRaw) ? lineRaw as InlineIcon['line'] : 'solid' };
  else return null;
  if (size !== undefined) icon.size = size;
  return { end: close + 1, color: attrs.color?.trim() ?? '', icon };
}

/**
 * Extract inline `:swatch{…}` colour swatches from a line's text, replacing
 * each by `SWATCH_PLACEHOLDER` and returning the swatch metadata in order.
 * `:swatch{…}` takes the same attribute grammar as `:ref{…}`; a swatch
 * without a `color` is not a swatch (left as text). With `icons`, the
 * inline symbols (`:icon[alt]{resource=…|glyph=…|line=…}`, #1058) are read
 * too, in the same placeholder: a figure label's text, a caption, a note,
 * a table cell (not the body text in this round).
 * Runs right after {@link extractInlineRefs} on its cleaned text.
 */
export function extractInlineSwatches(
  text: string,
  fallbackStart: number,
  options?: { icons?: boolean },
): { cleaned: string; swatches: SwatchMeta[] } {
  const swatches: SwatchMeta[] = [];
  let out = '';
  let last = 0;
  const icons = options?.icons === true && text.includes(':icon[');
  let swatch = nextBraced(text, ':swatch{', 0);
  let iconAt = icons ? text.indexOf(':icon[') : -1;
  while (swatch || iconAt >= 0) {
    if (iconAt >= 0 && (!swatch || iconAt < swatch.index)) {
      const at = iconAt;
      const read = at >= last ? readIcon(text, at) : null;
      if (read) {
        out += text.slice(last, at) + SWATCH_PLACEHOLDER;
        swatches.push({ color: read.color, icon: read.icon, sourceStart: fallbackStart + at, sourceEnd: fallbackStart + read.end });
        last = read.end;
      }
      iconAt = text.indexOf(':icon[', Math.max(at + 1, last));
      if (swatch && swatch.index < last) swatch = nextBraced(text, ':swatch{', last);
      continue;
    }
    const m = swatch!;
    swatch = nextBraced(text, ':swatch{', m.end);
    const attrs = parseDirectiveAttrs(m.body);
    const color = attrs.color?.trim();
    if (color === undefined || color.length === 0) continue;
    out += text.slice(last, m.index);
    const shape = swatchShapeFromAttrs(attrs);
    swatches.push({
      color,
      ...(shape ? { shape } : {}),
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.end,
    });
    out += SWATCH_PLACEHOLDER;
    last = m.end;
    if (iconAt >= 0 && iconAt < last) iconAt = text.indexOf(':icon[', last);
  }
  out += text.slice(last);
  return { cleaned: out, swatches };
}

/** Plain-text placeholder of a tab (#622) while a paragraph's inline marks
 *  are read; the spans' text has `'\t'` in its place (`buildBlockMapping`). */
export const TAB_PLACEHOLDER = '\uE1A8';

/** Metadata of a tab (#622): a tab character of the source (`literal`), or
 *  `:tab` with the one-off stop of its attributes. */
export interface TabMeta {
  literal?: true;
  /** Tab characters in a row (spaces between them aside): one tab of the
   *  plain text that goes on this many stops. */
  count?: number;
  stop?: TabStop;
}

/** `:tab`, `:tab{…}` or a tab character. A bare `:tab` is followed by
 *  anything but a letter (`3:table` is text). */
const INLINE_TAB_RE = /:tab(?:\{([^}\n]*)\}|(?!\p{L}))|\t(?:[ \t]*\t)*/gu;

/**
 * Take the tabs of a paragraph's text out (#622): every `:tab` (with its
 * attributes, see `tabStopFromAttrs`) and every tab character becomes
 * {@link TAB_PLACEHOLDER}, outside inline code, link destinations and
 * directive attributes. Runs on the text with its chips, references,
 * swatches and maths already taken out.
 */
export function extractInlineTabs(text: string): { cleaned: string; tabs: TabMeta[] } {
  if (!text.includes('\t') && !text.includes(':tab')) return { cleaned: text, tabs: [] };
  const kept = dataRanges(text);
  CODE_SPAN_RE.lastIndex = 0;
  let c: RegExpExecArray | null;
  while ((c = CODE_SPAN_RE.exec(text)) !== null) kept.push([c.index, c.index + c[0].length]);
  const tabs: TabMeta[] = [];
  INLINE_TAB_RE.lastIndex = 0;
  const cleaned = text.replace(INLINE_TAB_RE, (match: string, attrs: string | undefined, offset: number) => {
    if (kept.some(([st, e]) => offset >= st && offset < e)) return match;
    if (match.startsWith('\t')) {
      const count = match.split('\t').length - 1;
      tabs.push({ literal: true, ...(count > 1 ? { count } : {}) });
    } else {
      const stop = attrs !== undefined ? tabStopFromAttrs(parseDirectiveAttrs(attrs)) : undefined;
      tabs.push(stop ? { stop } : {});
    }
    return TAB_PLACEHOLDER;
  });
  return { cleaned, tabs };
}

/** Attach a `tab` to each {@link TAB_PLACEHOLDER} in order; the tab is a
 *  span of its own. */
export function injectTabSpans(spans: InlineSpan[], tabs: TabMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, tabs, TAB_PLACEHOLDER, (meta, bold, italic) => ({
    text: TAB_PLACEHOLDER,
    bold,
    italic,
    tab: { ...(meta.literal ? { literal: true as const } : {}), ...(meta.count ? { count: meta.count } : {}), ...(meta.stop ? { stop: meta.stop } : {}) },
  }));
}

/** Metadata of an inline `:chip[text]{style="…"}`: the text as written
 *  between the brackets, the style id and the source extent. */
export interface ChipMeta {
  /** Whitespace collapsed and trimmed; `''` for a chip of spaces alone. */
  text: string;
  style?: string;
  /** Absolute source offset of the leading `:` of `:chip[…]`. */
  sourceStart: number;
  /** Absolute source offset just past the directive (`]` or its `{…}`). */
  sourceEnd: number;
}

/**
 * `:chip[text]` with an optional `{attrs}` right after the bracket
 * (`/:chip\[((?:\\.|[^\]\\\n])+)\](?:\{([^}\n]*)\})?/g`). The text is
 * one line, may not be empty (`:chip[]` stays literal text) and takes `\]`
 * for a literal bracket. Text of spaces alone (NBSP included) makes an empty
 * chip: a blank box as wide as its style's padding.
 *
 * Extract inline `:chip[…]` chips from a line's text, replacing each by
 * `CHIP_PLACEHOLDER` and returning the chip metadata in order. Runs first,
 * before {@link extractInlineRefs}, so the chip text (which may hold marks
 * of its own) is shielded from the later passes.
 */
export function extractInlineChips(
  text: string,
  fallbackStart: number,
): { cleaned: string; chips: ChipMeta[] } {
  const chips: ChipMeta[] = [];
  let out = '';
  let last = 0;
  // Read as the expression above reads it, in one pass: an opening whose text
  // does not close skips to where that text stopped (a later opening inside
  // it stops there too), and the search for an attributes' `}` resumes
  // where the last one stopped.
  let stop = -1;
  for (let index = text.indexOf(':chip['); index >= 0; ) {
    const from = index + 6;
    const read = bracketTextEnd(text, from);
    if (!read.closed || read.at === from) {
      index = text.indexOf(':chip[', Math.max(read.at, index + 1));
      continue;
    }
    let end = read.at + 1;
    let attrs: string | undefined;
    if (text[end] === '{') {
      if (stop < end + 1) {
        stop = end + 1;
        while (stop < text.length && text[stop] !== '}' && text[stop] !== '\n') stop++;
      }
      if (text[stop] === '}') {
        attrs = text.slice(end + 1, stop);
        end = stop + 1;
      }
    }
    const inner = text.slice(from, read.at).replace(/\\([\[\]])/g, '$1').replace(/\s+/g, ' ').trim();
    const style = attrs !== undefined ? parseDirectiveAttrs(attrs).style?.trim() : undefined;
    out += text.slice(last, index);
    chips.push({
      text: inner,
      ...(style ? { style } : {}),
      sourceStart: fallbackStart + index,
      sourceEnd: fallbackStart + end,
    });
    out += CHIP_PLACEHOLDER;
    last = end;
    index = text.indexOf(':chip[', end);
  }
  out += text.slice(last);
  return { cleaned: out, chips };
}

/** Attach a `chip` to each `CHIP_PLACEHOLDER` occurrence in order; the chip
 *  span is its own entry carrying the ambient bold / italic, and its words
 *  are parsed for their own inline marks. A chip's label is not parsed for
 *  maths, so its `\$` is unescaped here, as in the running text. */
export function injectChipSpans(spans: InlineSpan[], chips: ChipMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, chips, CHIP_PLACEHOLDER, (meta, bold, italic) => ({
    text: CHIP_PLACEHOLDER,
    bold,
    italic,
    chip: {
      ...(meta.style ? { style: meta.style } : {}),
      spans: parseInlineFormatting(protectDollarEscapes(meta.text)),
    },
  }));
}

/** Attach a `swatch` to each `SWATCH_PLACEHOLDER` occurrence in order; the
 *  swatch span is its own entry, like a ref's. */
export function injectSwatchSpans(spans: InlineSpan[], swatches: SwatchMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, swatches, SWATCH_PLACEHOLDER, (meta, bold, italic) => ({
    text: SWATCH_PLACEHOLDER,
    bold,
    italic,
    swatch: meta.icon ? { color: meta.color, icon: meta.icon } : meta.shape ? { color: meta.color, shape: meta.shape } : { color: meta.color },
  }));
}
