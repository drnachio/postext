// Rich design text: runs, chips, fonts and the parse into inline spans
// (#1278: split out of richText.ts).
import { flowTextWidth, measuringVertically } from '../../measure/vertical.js';
import type { ForcedOrientation } from '../../writing/writingMode.js';
import { parseInlineFormatting, extractInlineChips, injectChipSpans } from '../../parse/inlineFormatting.js';
import type { InlineSpan } from '../../parse/types.js';
import { buildFontString } from '../../measure/index.js';
import { scriptMetrics, chipToken } from '../../measure/rich.js';
import { resolveChipSpans } from '../../pipeline/text/chips.js';
import type { VDTChip } from '../../vdt.js';
import type { ResolvedChipStyleConfig } from '../../types.js';
import { graphemeCount } from '../../measure/graphemes.js';

/** One run of a design text line in its own font (see `VDTDesignTextRun`). */
export interface DesignTextRun {
  text: string;
  fontString: string;
  /** A contents part row's leader (see `VDTDesignTextRun.leader`). */
  leader?: true;
  /** The run's own colour (see `VDTDesignTextRun.color`). */
  color?: string;
  /** Advance of the run, tracking included. */
  width: number;
  /** Script offset off the baseline (px, positive down). */
  baselineShift?: number;
  /** The first of a subscript and a superscript set over each other: it
   *  advances nothing (width 0) and the next run is painted at its x. */
  stacked?: boolean;
  /** Vertical text: a run the author set in one upright cell (`:tcy[…]`). */
  tcy?: true;
  /** Vertical text: a run the author stood upright (`:upright[…]`) or
   *  turned (`:sideways[…]`). */
  orientation?: 'upright' | 'sideways';
  /** Painted right to left (see `VDTDesignTextRun.rtl`). */
  rtl?: true;
  /** The run's `width` is its box, not its glyphs' advance: a CJK mark
   *  that gave up blank, a space set at the Han–Latin width (#637). Its
   *  glyphs are painted from `x + inkOffset` (see
   *  `VDTDesignTextRun.inkOffset`). */
  inkOffset?: number;
  /** A dash of a 破折号 stretched over its cell (#652): the scale its
   *  glyph is painted at along the line (see
   *  `VDTDesignTextRun.inkScale`). */
  inkScale?: number;
  /** An inline chip (`:chip[…]`, #1162): the run is the chip's one
   *  placeholder character, `width` its advance, and the box and its words
   *  are painted from `chip` (see `VDTDesignTextRun.chip`). */
  chip?: VDTChip;
}

/** The chips a design text may set (#1162): the document's chip styles
 *  and what their boxes are resolved with. A text read without it keeps
 *  `:chip[…]` as written. */
export interface DesignChipContext {
  styles: readonly ResolvedChipStyleConfig[];
  dpi: number;
  /** The text's tracking, which the chip's words are measured with. */
  letterSpacingPx: number;
}

interface RunStyle {
  font: string;
  /** The marks the style was made from (the CJK composer picks its fonts
   *  by them, `design/cjkText.ts`); absent on the element's own. */
  bold?: boolean;
  italic?: boolean;
  shift?: number;
  /** The script, for stacking a subscript and a superscript that touch;
   *  `stackedShift` is a subscript's drop under a superscript. */
  script?: 'sup' | 'sub';
  stackedShift?: number;
  /** Vertical text: the orientation the author forced. Each `:tcy` span
   *  has a style of its own, so two never merge into one cell. */
  orient?: ForcedOrientation;
  /** The same style without the orientation (a hyphen or an ellipsis set
   *  beside an oriented run takes it); for a chip, the style of the text
   *  around it. */
  base?: number;
  /** A chip's own style (one per chip): its laid-out box, its advance
   *  and the span it was measured from (the CJK composer sets it again). */
  chip?: VDTChip;
  chipWidth?: number;
  chipSpan?: InlineSpan;
  /** The chip style's gap (px) to a neighbour across a space. */
  chipGap?: number;
}

/**
 * A chip keeps at least its style's `gap` to a neighbour across a run of
 * spaces, as in a paragraph (`measure/rich.ts`, `applyChipGaps`): a
 * narrower run is topped up by a margin inside the chip's own advance, and
 * between two chips the shortfall is shared. A chip at either end of the
 * text has no margin on that side; one that opens or closes a line loses
 * it there (`RichMeasurer.line`).
 */
function applyDesignChipGaps(text: string, styleAt: readonly number[], styles: RunStyle[], letterSpacingPx: number): void {
  const isChip = (i: number): boolean => i >= 0 && i < text.length && styles[styleAt[i]!]!.chip !== undefined;
  const add = (i: number, side: 'marginLeft' | 'marginRight', px: number): void => {
    const st = styles[styleAt[i]!]!;
    st.chip = { ...st.chip!, [side]: st.chip![side] + px };
    st.chipWidth = (st.chipWidth ?? 0) + px;
  };
  let i = 0;
  while (i < text.length) {
    if (!/\s/.test(text[i]!) || text[i] === '\n') {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && /\s/.test(text[j]!) && text[j] !== '\n') j++;
    const left = i > 0 && text[i - 1] !== '\n' && isChip(i - 1) ? i - 1 : -1;
    const right = j < text.length && text[j] !== '\n' && isChip(j) ? j : -1;
    // Spaces at an end of the text, or with no chip beside them: nothing.
    if (i > 0 && j < text.length && (left >= 0 || right >= 0)) {
      const font = styles[styleAt[i]!]!.font;
      const run = text.slice(i, j);
      const width = Math.max(0, flowTextWidth(run, font) + letterSpacingPx * graphemeCount(run));
      const gapOf = (k: number): number => (k >= 0 ? styles[styleAt[k]!]!.chipGap ?? 0 : 0);
      const shortfall = Math.max(gapOf(left), gapOf(right)) - width;
      if (shortfall > 0) {
        const share = left >= 0 && right >= 0 ? shortfall / 2 : shortfall;
        if (left >= 0) add(left, 'marginRight', share);
        if (right >= 0) add(right, 'marginLeft', share);
      }
    }
    i = j;
  }
}

/** A design text read for inline marks: its plain text (markers dropped)
 *  and the style of every character. */
export interface RichDesignText {
  text: string;
  /** Index into `styles` of each character of `text`. */
  styleAt: number[];
  /** `styles[0]` is the element's own font. */
  styles: RunStyle[];
  /** Whether any character is set in a style other than the element's. */
  hasMarks: boolean;
}

/** The element typography the runs derive from. */
export interface RichFontSpec {
  family: string;
  sizePx: number;
  weight: number;
  italic: boolean;
}

const fontFor = (spec: RichFontSpec, weight: number, italic: boolean): string =>
  buildFontString(spec.family, spec.sizePx, weight === 400 ? 'normal' : String(weight), italic ? 'italic' : 'normal');

/** The fonts the runs of a design text with inline marks take: the
 *  element's, bold (700, or the element's weight when heavier), italic
 *  (the element's slant flipped) and both, as {@link parseRichDesignText}
 *  picks them. */
export function richFontSet(spec: RichFontSpec): { normal: string; bold: string; italic: string; boldItalic: string } {
  const heavy = Math.max(700, spec.weight);
  return {
    normal: fontFor(spec, spec.weight, spec.italic),
    bold: fontFor(spec, heavy, spec.italic),
    italic: fontFor(spec, spec.weight, !spec.italic),
    boldItalic: fontFor(spec, heavy, !spec.italic),
  };
}

/** Read `text` for inline marks. Bold runs take weight 700 (the element's
 *  own weight when it is heavier); italic runs flip the element's slant;
 *  scripts use the body text's script size and shift. In vertical text
 *  (`measuringVertically`) a run the author set with `:tcy`, `:upright` or
 *  `:sideways` stands as the body sets it; horizontal text ignores the
 *  marks. */
export function parseRichDesignText(text: string, spec: RichFontSpec, chips?: DesignChipContext): RichDesignText {
  const styles: RunStyle[] = [{ font: fontFor(spec, spec.weight, spec.italic) }];
  const keys = new Map<string, number>([['0|0|', 0]]);
  let out = '';
  const styleAt: number[] = [];
  let hasMarks = false;
  const vertical = measuringVertically();
  const styleFor = (span: { bold: boolean; italic: boolean; script?: 'sup' | 'sub' }): number => {
    const key = `${span.bold ? 1 : 0}|${span.italic ? 1 : 0}|${span.script ?? ''}`;
    let idx = keys.get(key);
    if (idx === undefined) {
      const base = fontFor(spec, span.bold ? Math.max(700, spec.weight) : spec.weight, span.italic ? !spec.italic : spec.italic);
      const style: RunStyle = { font: base, ...(span.bold ? { bold: true } : {}), ...(span.italic ? { italic: true } : {}) };
      if (span.script) {
        const m = scriptMetrics(base, span.script);
        style.font = m.font;
        style.shift = m.baselineShift;
        style.script = span.script;
        if (span.script === 'sub') style.stackedShift = scriptMetrics(base, 'sub', true).baselineShift;
      }
      idx = styles.length;
      styles.push(style);
      keys.set(key, idx);
    }
    return idx;
  };
  const spans = richDesignInlineSpans(text, chips, spec.sizePx);
  const fonts = chips ? richFontSet(spec) : undefined;
  for (let si = 0; si < spans.length; si++) {
    const span = spans[si]!;
    let idx = styleFor(span);
    if (span.chip && fonts && chips) {
      // A chip is a style of its own: one character, as wide as its box,
      // set in the element's faces (the chip style's family and size over
      // them).
      const token = chipToken(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, chips.letterSpacingPx);
      const chipIdx = styles.length;
      styles.push({ font: styles[idx]!.font, base: idx, chip: token.chip!, chipWidth: token.width, chipSpan: span, chipGap: token.chipGap ?? 0 });
      hasMarks = true;
      out += span.text;
      for (let i = 0; i < span.text.length; i++) styleAt.push(chipIdx);
      continue;
    }
    const orient: ForcedOrientation | undefined = vertical ? (span.combineUpright ? 'tcy' : span.orientation) : undefined;
    if (orient && span.text.length > 0) {
      // An oriented run: the style of its font with the orientation, one
      // per `:tcy` span (two cells never merge), shared by the others.
      const key = `${orient === 'tcy' ? `tcy${si}` : orient}|${idx}`;
      let oriented = keys.get(key);
      if (oriented === undefined) {
        oriented = styles.length;
        styles.push({ ...styles[idx]!, orient, base: idx });
        keys.set(key, oriented);
      }
      idx = oriented;
    }
    if (idx !== 0) hasMarks = true;
    out += span.text;
    for (let i = 0; i < span.text.length; i++) styleAt.push(idx);
  }
  if (chips) applyDesignChipGaps(out, styleAt, styles, chips.letterSpacingPx);
  return { text: out, styleAt, styles, hasMarks };
}

/** The inline spans of a design text read for inline marks: with `chips`,
 *  each `:chip[…]` is a chip span with its box resolved at `sizePx`
 *  (#1162); without, it is text as written. */
function richDesignInlineSpans(text: string, chips: DesignChipContext | undefined, sizePx: number): InlineSpan[] {
  if (!chips || !text.includes(':chip[')) return parseInlineFormatting(text);
  const { cleaned, chips: metas } = extractInlineChips(text, 0);
  const spans = parseInlineFormatting(cleaned);
  return metas.length > 0 ? resolveChipSpans(injectChipSpans(spans, metas), { styles: chips.styles, dpi: chips.dpi }, sizePx) : spans;
}

/** The plain text of `text` read for inline marks: the markers dropped,
 *  as `parseRichDesignText` sets it (a chip one placeholder character,
 *  when the text reads chips). */
export function plainDesignText(text: string, chips = false): string {
  if (chips && text.includes(':chip[')) {
    const { cleaned, chips: metas } = extractInlineChips(text, 0);
    return injectChipSpans(parseInlineFormatting(cleaned), metas).map((span) => span.text).join('');
  }
  return parseInlineFormatting(text).map((span) => span.text).join('');
}

/** The spans of `[a, b)` of a rich design text, one per change of style,
 *  for the CJK composer (`design/cjkText.ts`): bold, italic, script and
 *  orientation as the parser read them. */
export function richDesignSpans(rt: RichDesignText, a: number, b: number): InlineSpan[] {
  const out: InlineSpan[] = [];
  let i = a;
  while (i < b) {
    const idx = rt.styleAt[i]!;
    let j = i + 1;
    while (j < b && rt.styleAt[j] === idx) j++;
    const st = rt.styles[idx]!;
    if (st.chipSpan) {
      // A chip, as the body's composer sets it.
      out.push(st.chipSpan);
      i = j;
      continue;
    }
    out.push({
      text: rt.text.slice(i, j),
      bold: st.bold === true,
      italic: st.italic === true,
      ...(st.script ? { script: st.script } : {}),
      ...(st.orient === 'tcy' ? { combineUpright: true } : st.orient ? { orientation: st.orient } : {}),
    });
    i = j;
  }
  return out;
}
