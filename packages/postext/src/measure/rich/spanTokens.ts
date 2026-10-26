// Tokens of particular spans: script fields, sideways numbers, atomic
// boxes, reference labels, placed markers and label tabs
// (#1276: split out of rich.ts).
import type { CjkRegion } from '../../types.js';
import { measureInlineIcon } from '../inlineIcon.js';
import type { InlineSpan } from '../../parse/index.js';
import { measureTextWidth, cleanSoftHyphens } from '../canvas.js';
import { graphemesOf, graphemeCount } from '../graphemes.js';
import { sideMarkerRun, CENTRAL } from '../cjk/cjkAnnotate.js';
import { measuringVertically, fontEm } from '../vertical.js';
import { latinReader, uprightDigitCandidates } from '../../writing/writingMode.js';
import { sliceSpan } from '../../parse/links.js';
import { refLabelPieces, isBreakingSpaceRun } from '../spaces.js';
import { wordLetterSpacing } from '../rtl/joining.js';
import { chipToken } from './chips.js';
import { type RichToken, pickSpanFont, scriptMetrics, scaledFont, textWidth, isSwatchFill, swatchSidePx, swatchShapeOf, type PendingSegment } from './tokens.js';

/** The script fields of a span's tokens (the font at the script size, and
 *  the shift), none for text that is no superscript or subscript. */
export function spanScriptFields(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift'> {
  if (!span.script) return {};
  const base = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
  const m = scriptMetrics(base, span.script);
  return { script: span.script, scriptFont: m.font, baselineShift: m.baselineShift };
}

/** Whether a span sets something other than its text: a `:ref` or a
 *  note marker (its label), a chip, a swatch or a formula. The orientation
 *  marks of vertical text leave such a span as it is. */
export function setsObject(span: InlineSpan): boolean {
  return span.ref !== undefined || span.footnote !== undefined || span.chip !== undefined || span.swatch !== undefined || span.math !== undefined || span.mathRender !== undefined;
}

/** A stand-in for what a span sets other than its text (a chip, a
 *  formula, a swatch, a reading, a warichu note), or sets upright: no
 *  Latin text to a number beside it. */
const NOT_LATIN = '\uFFFC';
/** A stand-in for a note marker or a reference: looked past, as a space
 *  is (`printed in 49[^1] copies`). */
const LOOKED_PAST = '\u200B';

/**
 * Vertical text: `spans` with each short number that runs with Latin text
 * (`latinReader`: `printed in 49 and 32 copies`) set sideways, as
 * `:sideways[…]` sets it, where the words it runs with lie past a space or
 * in another span (#222). A line keeps each word of a vertical paragraph in
 * a segment of its own, and a segment alone would read such a number
 * without its neighbours and stand it upright (`uprightDigitRuns`): the
 * number is measured and painted sideways as the paragraph reads it,
 * also one whose marks touch it (`(49)`, `49,`): the words those lead to
 * may lie in another segment. A piece of the paragraph never reads a
 * number as Latin that the paragraph stands upright (`latinReader`), so
 * the numbers left alone read alike in every segment. Nothing changes
 * when `digits` is 0 or no span holds a digit.
 */
export function sidewaysNumberSpans(spans: InlineSpan[], digits: number, region: CjkRegion): InlineSpan[] {
  if (!(digits > 0)) return spans;
  const numbered = (s: InlineSpan): boolean => /[0-9]/.test(s.text) && !setsObject(s) && !s.ruby && !s.kunten && !s.warichu && !s.combineUpright && !s.orientation && !s.script;
  if (!spans.some(numbered)) return spans;
  // The paragraph as graphemes; a note marker or a reference is looked
  // past, and a span that sets something else than its text (a formula, a
  // chip, a reading, a warichu note) or that the author set upright is one
  // character that is not Latin.
  const all: string[] = [];
  const firsts: number[] = [];
  for (const s of spans) {
    firsts.push(all.length);
    if (s.footnote !== undefined || s.ref !== undefined) all.push(LOOKED_PAST);
    else if (setsObject(s) || s.ruby || s.kunten || s.warichu || s.combineUpright || s.orientation === 'upright') all.push(NOT_LATIN);
    else for (const g of graphemesOf(s.text)) all.push(g);
  }
  const latin = latinReader(all, region);
  let out: InlineSpan[] | undefined;
  spans.forEach((s, k) => {
    const own = numbered(s) ? graphemesOf(s.text) : undefined;
    const cuts: Array<[number, number]> = [];
    if (own) {
      for (const [i, n] of uprightDigitCandidates(own, digits)) {
        const from = firsts[k]! + i;
        if (latin(from, from + n)) cuts.push([i, i + n]);
      }
    }
    if (!own || cuts.length === 0) {
      out?.push(s);
      return;
    }
    out ??= spans.slice(0, k);
    const offset: number[] = [0];
    for (const g of own) offset.push(offset[offset.length - 1]! + g.length);
    let at = 0;
    for (const [a, b] of cuts) {
      if (offset[a]! > at) out.push(sliceSpan(s, at, offset[a]!));
      out.push({ ...sliceSpan(s, offset[a]!, offset[b]!), orientation: 'sideways' });
      at = offset[b]!;
    }
    if (at < s.text.length) out.push(sliceSpan(s, at));
  });
  return out ?? spans;
}

/**
 * The one token of a span that is set as a whole, or undefined for text:
 * - an inline `:ref` or a footnote marker: the resolved label (already in
 *   `text`) as one box that never wraps apart. Kind 'text' keeps the
 *   generic layout and renderers treating it as a word; `refResourceId` /
 *   `footnoteId` flow onto the segment for link colouring and PDF links;
 * - a chip: a box with its own runs, never broken or hyphenated inside;
 * - a swatch: one square the size of a capital;
 * - a formula: one box with the render's `widthPx`. Kind 'text' (not
 *   'space'), so trimming a line's trailing spaces never drops it.
 */
export function atomicSpanToken(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): RichToken | undefined {
  // Vertical text: a run the author set upright or sideways is one unit a
  // line never breaks inside (tate-chu-yoko one em, upright letters one em
  // each, a sideways run its horizontal width). A reference, a note
  // marker, a chip, a swatch or a formula keeps its own setting.
  if ((span.combineUpright || span.orientation) && measuringVertically() && span.text.length > 0 && !setsObject(span)) {
    const font = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    const em = fontEm(font);
    const count = span.combineUpright ? 1 : graphemeCount(span.text);
    const track = letterSpacingPx === 0 ? 0 : letterSpacingPx * count;
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width: (span.combineUpright ? em : span.orientation === 'upright' ? em * count : measureTextWidth(span.text, font)) + track,
      ...(span.combineUpright ? { tcy: true as const } : { orientation: span.orientation! }),
    };
  }
  if (span.footnote?.place) return placedMarkerToken(span, span.footnote.place, pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont), letterSpacingPx);
  if (span.ref || span.footnote) {
    const scriptFields = spanScriptFields(span, normalFont, boldFont, italicFont, boldItalicFont);
    const scale = span.footnote?.scale;
    const markerFont = !span.script && scale !== undefined && scale > 0 && Math.abs(scale - 1) > 1e-6
      ? scaledFont(pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont), scale)
      : undefined;
    const refFont = scriptFields.scriptFont ?? markerFont ?? pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      ...scriptFields,
      ...(markerFont ? { markerFont } : {}),
      ...(span.smallCaps ? { smallCaps: true } : {}),
      kind: 'text',
      width: textWidth(span.text, refFont, span.smallCaps) + (letterSpacingPx === 0 ? 0 : wordLetterSpacing(span.text, letterSpacingPx) * graphemeCount(span.text)),
      ...(span.ref ? { refResourceId: span.ref.resourceId, ...(span.ref.anchor ? { refAnchor: true as const } : {}), ...(span.ref.pageIndex !== undefined ? { refPageIndex: span.ref.pageIndex } : {}) } : {}),
      ...(span.footnote ? { footnoteId: span.footnote.id } : {}),
    };
  }
  if (span.labelTab) {
    const font = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      kind: 'text',
      width: textWidth(span.text, font, false) + (letterSpacingPx === 0 ? 0 : wordLetterSpacing(span.text, letterSpacingPx) * graphemeCount(span.text)),
      labelTab: span.labelTab,
    };
  }
  if (span.chip) return chipToken(span, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  if (span.swatch) {
    const swatchFont = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    if (span.swatch.icon) {
      // An inline symbol (#1058): one box, its own width.
      const icon = measureInlineIcon(span.swatch.icon, span.swatch.color, normalFont);
      return { text: span.text, bold: span.bold, italic: span.italic, captionLabel: span.captionLabel, kind: 'text', width: icon.widthPx, swatch: { icon } };
    }
    const fill = isSwatchFill(span.swatch.color) ? { color: span.swatch.color } : {};
    const box = span.swatch.box;
    const side = box?.sidePx ?? swatchSidePx(swatchFont);
    const width = side + (box?.gapPx ?? 0);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width,
      swatch: box ? { ...fill, ...swatchShapeOf(box, side, width) } : fill,
    };
  }
  if (span.math && span.mathRender) {
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width: span.mathRender.widthPx,
      mathRender: span.mathRender,
    };
  }
  return undefined;
}

/**
 * The tokens of a reference whose label is words (`ref.breakable`, #702):
 * one per piece of the label (`refLabelPieces`: a word, with the number that
 * keeps to it, or a run of breaking spaces), or undefined for a label that
 * is one token ({@link atomicSpanToken}). A word is built as the whole
 * label is — the reference's font, no dictionary points, never divided —
 * and a space is an ordinary space of the line: a legal break, stretched
 * and shrunk with the others. Every piece carries the reference, so the
 * link has no holes; every piece after the first is flagged
 * `refContinues`, so the reference stays one position in the source. A
 * no-break space inside the label glues, as anywhere.
 */
export function refLabelTokens(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): RichToken[] | undefined {
  if (!span.ref?.breakable || span.footnote) return undefined;
  // A number, a Roman numeral or a single letter keeps to the word before
  // it: `Fig. 1a` is one piece, its space set as text.
  const parts = refLabelPieces(span.text);
  if (!parts) return undefined;
  const tokens: RichToken[] = [];
  for (const part of parts) {
    const token = atomicSpanToken({ ...span, text: part }, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
    if (!token) return undefined;
    if (isBreakingSpaceRun(part)) {
      token.kind = 'space';
      // A space has no capitals to shrink.
      delete token.smallCaps;
    }
    if (tokens.length > 0) token.refContinues = true;
    tokens.push(token);
  }
  return tokens;
}

/**
 * A footnote marker set apart from the text (`footnotes.markerPosition`,
 * JLReq §4.2.3), at its size (`span.footnote.scale` of `font`, the text's):
 * - `'side'`: an interlinear 合印 in the line gap over the text before it,
 *   a token 0 wide whose run is painted there ({@link sideMarkerRun});
 * - `'right'` (vertical text): an inline marker taking its advance down
 *   the line, its em box moved across to end where the line's ends, on
 *   the right (行右小書き).
 * Either is never broken from the text it marks (the CJK composer glues a
 * note marker to the unit before it; Latin text has no break point there).
 */
function placedMarkerToken(span: InlineSpan, place: 'side' | 'right', font: string, letterSpacingPx: number): RichToken {
  const scale = span.footnote?.scale ?? 1;
  const markerFont = Math.abs(scale - 1) > 1e-6 ? scaledFont(font, scale) : font;
  const em = fontEm(font);
  const base = {
    text: span.text,
    bold: span.bold,
    italic: span.italic,
    kind: 'text' as const,
    footnoteId: span.footnote!.id,
    markerFont,
  };
  if (place === 'side') return { ...base, width: 0, sideRuns: [sideMarkerRun(span.text, markerFont, em)] };
  // The marker's em box is centred `CENTRAL` of its em above its baseline,
  // the line's on the line's axis: moving it by the difference of the two
  // half-ems puts both boxes' right ends together.
  const markEm = fontEm(markerFont);
  const track = letterSpacingPx === 0 ? 0 : wordLetterSpacing(span.text, letterSpacingPx) * graphemeCount(span.text);
  return { ...base, width: textWidth(span.text, markerFont, false) + track, markerShift: -(em - markEm) * (CENTRAL + 0.5) };
}

/** The segment a token (or the part of one on a line) sets: its kind, text
 *  (soft hyphens removed), width and every flag the renderers read. Small
 *  capitals stay flagged until {@link expandSmallCaps} splits them. */
export function tokenSegment(t: RichToken): PendingSegment {
  const seg = {
    kind: t.mathRender ? 'math' : t.swatch ? 'swatch' : t.chip ? 'chip' : t.kind,
    text: cleanSoftHyphens(t.text),
    width: t.width,
    bold: t.bold || undefined,
    italic: t.italic || undefined,
    ...(t.mathRender ? { mathRender: t.mathRender } : {}),
    ...(t.swatch ? { swatch: t.swatch } : {}),
    ...(t.chip ? { chip: t.chip } : {}),
    ...(t.refResourceId !== undefined ? { refResourceId: t.refResourceId, ...(t.refAnchor ? { refAnchor: true as const } : {}), ...(t.refPageIndex !== undefined ? { refPageIndex: t.refPageIndex } : {}), ...(t.refContinues ? { refContinues: true } : {}) } : {}),
    ...(t.footnoteId !== undefined ? { footnoteId: t.footnoteId } : {}),
    ...(t.captionLabel ? { captionLabel: true } : {}),
    ...(t.labelTab || t.tab ? { labelTab: true as const } : {}),
    ...(t.script ? { script: t.script, fontString: t.scriptFont, baselineShift: t.baselineShift } : {}),
    ...(t.markerFont && !t.script ? { fontString: t.markerFont } : {}),
    ...(t.sideRuns ? { sideMarker: { runs: t.sideRuns } } : {}),
    ...(t.markerShift !== undefined ? { baselineShift: t.markerShift } : {}),
    ...(t.faceFont && !t.script ? { fontString: t.faceFont } : {}),
    ...(t.stacked === 'first' ? { stacked: true } : {}),
    ...(t.smallCaps ? { smallCaps: true } : {}),
  } as PendingSegment;
  // The fields of vertical and Chinese text, last, when set.
  if (t.tcy) seg.tcy = true;
  if (t.orientation) seg.orientation = t.orientation;
  if (t.cjkMarks) seg.cjkMarks = t.cjkMarks;
  if (t.inserted) seg.inserted = true;
  if (t.runs) seg.runs = t.runs;
  if (t.scriptContext) seg.scriptContext = t.scriptContext;
  return seg;
}

/**
 * Widen the spaces of a bibliography label (#290) so the entry's text
 * starts `columnPx` from the line's start: the gap after the label takes
 * what the label leaves of the column (its own width at least), or, with
 * a space before the label, that space takes it and the label ends against
 * the gap. `items` are a paragraph's tokens or units in order; `setWidth`
 * writes a new width.
 */
export function setLabelTabs<T extends { width: number }>(
  items: readonly T[],
  tabOf: (item: T) => 'lead' | 'gap' | undefined,
  columnPx: number,
  setWidth: (item: T, width: number) => void,
): void {
  const gapAt = items.findIndex((t) => tabOf(t) === 'gap');
  if (gapAt < 0) return;
  const leadAt = items.findIndex((t, i) => i < gapAt && tabOf(t) === 'lead');
  let label = 0;
  for (let i = leadAt + 1; i < gapAt; i++) label += items[i]!.width;
  const gap = items[gapAt]!;
  if (leadAt >= 0) setWidth(items[leadAt]!, Math.max(0, columnPx - gap.width - label));
  else setWidth(gap, Math.max(gap.width, columnPx - label));
}
