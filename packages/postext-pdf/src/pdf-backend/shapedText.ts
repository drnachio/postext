/**
 * Text shaped with HarfBuzz, painted through glyph ids (issue #380).
 *
 * pdf-lib's own text path asks fontkit for the glyphs (`encodeText`). For
 * a run HarfBuzz shapes (`complexShaping.ts`) the glyphs are registered
 * with the font's subset here instead, as the vertical twins register
 * theirs (`verticalFonts.ts`): the subset keeps every glyph a run shows and
 * its `W` width, and the hex codes are the subset's ids (or the face's own,
 * for a font embedded whole).
 *
 * Positions: a run is one `TJ` per stretch of glyphs at one height. Its
 * numbers move the pen to each glyph's origin (`pen + xOffset`) and, after
 * the last, to where HarfBuzz's advances end, so a run is exactly as wide
 * as the layout measured it. A mark HarfBuzz raises or lowers (`yOffset`:
 * a fatha on a shadda, a kasra under a dotted letter) is shown with the
 * text rise (`Ts`) set to it, which moves no pen. Glyphs are shown left to
 * right, a right-to-left run in visual order, as every right-to-left PDF
 * shows them: readers put the line back in logical order from their
 * positions.
 *
 * Reading the text back (`/ToUnicode`): clusters are graphemes, a letter
 * with its marks. Each glyph newly added to the font is given the
 * characters of its cluster it stands for ({@link clusterCodePoints}), and
 * the font's map is written from them. That map is global to the font, so
 * a glyph keeps the characters it was first given: a mirrored bracket
 * shares its glyph with the other bracket, a contextual form can stand for
 * other text elsewhere. A cluster whose glyphs do not read back as its own
 * characters, a vocalised letter (readers set a raised or lowered mark on
 * a line of its own, or after the next letter) and a cluster holding
 * kashidas justification inserted are shown under an `/ActualText` span
 * with the cluster's text as written, in logical order (PDF 1.7 §14.9.4).
 * pdf.js 5 ignores the span and reads the glyphs; Poppler reads it, but
 * turns a span of several characters around in a right-to-left line.
 */
import { PDFArray, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, setCharacterSpacing, setTextRise, type Color, type PDFFont } from 'pdf-lib';
import { complexShaperReady, joinsLetters, needsComplexShaping, shapeRun, clusterTexts, type ShapeFeatures } from '../complexShaping';
import { bidiRuns, type BidiRun } from '../bidiRuns';
import { fileRuns, noteMissingGlyphs } from '../faceFiles';
import { toUnicodeCmap } from '../fontCache';
import { pushTextObject, registerComplexPainter, textShows, type PageCtx, type TextOutline, type TextShow } from './primitives';

/** A fontkit glyph, as far as registering it with a subset needs it. */
interface FontkitGlyph {
  id: number;
  advanceWidth: number;
  codePoints: number[];
}

/** The parts of pdf-lib's custom-font embedder this module reaches into. */
interface Embedder {
  font: { unitsPerEm: number; getGlyph(id: number, codePoints?: number[]): FontkitGlyph | null };
  fontData?: Uint8Array;
  fontFeatures?: unknown;
  subset?: { includeGlyph(glyph: FontkitGlyph): number };
  glyphs?: FontkitGlyph[];
  glyphIdMap?: Map<number, number>;
  glyphCache?: { invalidate(): void };
}

function embedderOf(font: PDFFont): Embedder | undefined {
  const e = (font as unknown as { embedder?: Embedder }).embedder;
  return e && e.fontData && e.font && typeof e.font.getGlyph === 'function' ? e : undefined;
}

/** A run shaped and encoded in one file of a face: its `TJ` operators,
 * each with the rise (thousandths of the em) its glyphs are shown at and,
 * for the glyphs of a cluster the ToUnicode map cannot read back as
 * written, the index in `spans` of the `/ActualText` they are shown under;
 * and where the run leaves the pen (thousandths of the em). */
interface ShapedShow {
  pieces: Array<{ rise: number; op: PDFOperator; span?: number }>;
  spans: string[];
  advance: number;
}

const showsByFont = new WeakMap<PDFFont, Map<string, ShapedShow | null>>();
const SHOW_CACHE_SLOTS = 50_000;
/** Glyph ids whose characters are settled, per embedder: given once, never
 *  changed, so a cluster found to read back right stays so. */
const settledByEmbedder = new WeakMap<Embedder, Set<number>>();

/** The width a viewer gives a glyph with no `W` entry (no `DW` is written). */
const MISSING_WIDTH = 1000;

function tjNumber(n: number): number {
  return Math.round(n * 100) / 100;
}

function sameCodePoints(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function codePointsOf(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) out.push(ch.codePointAt(0)!);
  return out;
}

/** pdf-lib's font features in the form the shaper takes. */
function shapeFeatures(features: unknown): ShapeFeatures | undefined {
  if (Array.isArray(features)) return features.filter((f): f is string => typeof f === 'string');
  if (features && typeof features === 'object') return features as Record<string, boolean | number>;
  return undefined;
}

/**
 * `text` (one bidi run, set in one file) shaped by HarfBuzz and encoded in
 * `font`: cached per font, direction, language and whether tatweels are
 * read. Null when the font has no file bytes to shape from (a standard
 * font) or HarfBuzz is not loaded.
 */
function shapedShow(font: PDFFont, text: string, direction: 'ltr' | 'rtl', language: string | undefined, hideTatweel: boolean): ShapedShow | null {
  let cache = showsByFont.get(font);
  if (!cache) {
    cache = new Map();
    showsByFont.set(font, cache);
  }
  const key = `${direction}|${language ?? ''}|${hideTatweel ? 1 : 0}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const show = buildShow(font, text, direction, language, hideTatweel);
  if (cache.size >= SHOW_CACHE_SLOTS) cache.clear();
  cache.set(key, show);
  return show;
}

/**
 * The characters each glyph of one cluster is given in the ToUnicode map,
 * the glyphs listed in logical order. A glyph that is the font's own glyph
 * for one of the cluster's characters (a mark, a letter in its isolated
 * form) takes that character; the glyphs left (contextual forms, a mark
 * set on a mark) take the characters left one each, in order, the last
 * of them any still left (a ligature); a glyph with none left gets none.
 * A glyph of a
 * right-to-left run that stands for several characters lists them right to
 * left: Poppler and pdf.js spread such a glyph's characters across its
 * width left to right, then read the right-to-left line from its right
 * end.
 */
function clusterCodePoints(
  face: Embedder['font'] & { glyphForCodePoint?(cp: number): { id: number } | null },
  gids: readonly number[],
  chars: readonly number[],
  rtl: boolean,
): number[][] {
  const left = chars.slice();
  const out: number[][] = gids.map(() => []);
  const claimed = gids.map(() => false);
  if (gids.length > 1 && face.glyphForCodePoint) {
    gids.forEach((gid, i) => {
      const k = left.findIndex((cp) => face.glyphForCodePoint!(cp)?.id === gid);
      if (k < 0) return;
      out[i] = [left[k]!];
      claimed[i] = true;
      left.splice(k, 1);
    });
  }
  const free = claimed.flatMap((c, i) => (c ? [] : [i]));
  if (free.length === 0 && left.length > 0) free.push(0);
  free.forEach((i, k) => {
    const take = k === free.length - 1 ? left.splice(0) : left.splice(0, 1);
    if (take.length > 1 && rtl) take.reverse();
    out[i] = [...out[i]!, ...take];
  });
  return out;
}

function buildShow(font: PDFFont, text: string, direction: 'ltr' | 'rtl', language: string | undefined, hideTatweel: boolean): ShapedShow | null {
  const embedder = embedderOf(font);
  if (!embedder) return null;
  const run = shapeRun(embedder.fontData!, text, { direction, language, features: shapeFeatures(embedder.fontFeatures) });
  if (!run) return null;
  noteMissingGlyphs(font, text);
  const face = embedder.font;
  const rtl = direction === 'rtl';
  const toText = 1000 / run.upem;
  const subset = embedder.subset && embedder.glyphs && embedder.glyphIdMap ? embedder : undefined;
  let settled = settledByEmbedder.get(embedder);
  if (!settled) {
    settled = new Set();
    settledByEmbedder.set(embedder, settled);
  }
  const texts = clusterTexts(run, text);
  const glyphs = run.glyphs;
  // Each glyph's characters and, per glyph, the span its cluster is shown
  // under (when it needs one).
  const wants: number[][] = new Array(glyphs.length);
  const spanOf: Array<number | undefined> = new Array(glyphs.length);
  const spans: string[] = [];
  // The order glyphs are shown in: cluster by cluster, left to right, and
  // inside a cluster read through a span its glyphs on the baseline first:
  // a reader places the span's text where its first glyph is, and a raised
  // mark there would put it on a line of its own.
  const showOrder: number[] = [];
  let added = false;
  for (let a = 0; a < glyphs.length;) {
    let b = a + 1;
    while (b < glyphs.length && glyphs[b]!.cluster === glyphs[a]!.cluster) b++;
    // The cluster's glyphs, logical order; its text is on the first met.
    const indices = Array.from({ length: b - a }, (_, k) => a + k);
    if (rtl) indices.reverse();
    const clusterText = texts[a]!;
    const chars = codePointsOf(clusterText);
    const cps = clusterCodePoints(face, indices.map((i) => glyphs[i]!.gid), chars, rtl);
    let readsBack = true;
    indices.forEach((i, k) => {
      const g = glyphs[i]!;
      const want = cps[k]!;
      wants[i] = want;
      const glyph = face.getGlyph(g.gid, want);
      if (!glyph) return;
      // A glyph met for the first time reads as given here; one already in
      // the font keeps what it was given.
      const known = settled.has(g.gid) || (subset?.glyphIdMap!.has(g.gid) ?? false) || glyph.codePoints.length > 0;
      if (!known) glyph.codePoints = want;
      settled.add(g.gid);
      if (!sameCodePoints(glyph.codePoints, want)) readsBack = false;
    });
    // A vocalised letter (marks raised or lowered, which readers would set
    // on a line of their own), a cluster whose glyphs read as other text,
    // and kashidas justification inserted: read as the cluster's text.
    const vocalised = indices.some((i) => glyphs[i]!.yOffset !== 0);
    const tatweel = hideTatweel && clusterText.includes('\u0640');
    const visual = Array.from({ length: b - a }, (_, k) => a + k);
    if (vocalised) visual.sort((p, q) => Number(glyphs[p]!.yOffset !== 0) - Number(glyphs[q]!.yOffset !== 0));
    if (!readsBack || vocalised || tatweel) {
      spans.push(tatweel ? clusterText.replace(/\u0640/g, '') : clusterText);
      for (const i of indices) spanOf[i] = spans.length - 1;
    }
    showOrder.push(...visual);
    a = b;
  }
  // Each glyph's origin, thousandths of the em from the run's start.
  const at: number[] = new Array(glyphs.length);
  let end = 0;
  for (let i = 0; i < glyphs.length; i++) {
    at[i] = end + glyphs[i]!.xOffset * toText;
    end += glyphs[i]!.xAdvance * toText;
  }

  const pieces: ShapedShow['pieces'] = [];
  let parts: Array<string | number> = [];
  let rise = 0;
  let span: number | undefined;
  // Where the pen is, thousandths of the em from the run's start.
  let pen = 0;
  const flush = () => {
    if (parts.length > 0) pieces.push(span === undefined ? { rise, op: tjOperator(font, parts) } : { rise, op: tjOperator(font, parts), span });
    parts = [];
  };
  const push = (part: string | number) => {
    const last = parts[parts.length - 1];
    if (typeof part === 'number') {
      if (part === 0) return;
      if (typeof last === 'number') parts[parts.length - 1] = tjNumber(last + part);
      else parts.push(part);
    } else if (typeof last === 'string') parts[parts.length - 1] = last + part;
    else parts.push(part);
  };
  for (const i of showOrder) {
    const g = glyphs[i]!;
    const glyph = face.getGlyph(g.gid, wants[i]);
    if (!glyph) return null;
    let id = g.gid;
    if (subset) {
      if (!subset.glyphIdMap!.has(g.gid)) added = true;
      id = subset.subset!.includeGlyph(glyph);
      if (id > 0) {
        subset.glyphs![id - 1] = glyph;
        subset.glyphIdMap!.set(g.gid, id);
      }
    }
    const glyphRise = g.yOffset * toText;
    if (glyphRise !== rise || spanOf[i] !== span) {
      // The pen move into the glyph opens the next piece, inside its span.
      flush();
      rise = glyphRise;
      span = spanOf[i];
    }
    // A TJ number moves the pen back by thousandths of the em: to the
    // glyph's origin, then the viewer advances it by its `W` width (notdef
    // in a subset has none and takes the default).
    const move = tjNumber(pen - at[i]!);
    push(move);
    pen -= move;
    push(id.toString(16).padStart(4, '0'));
    pen += id === 0 && subset ? MISSING_WIDTH : glyph.advanceWidth * toText;
  }
  // The pen ends where HarfBuzz's advances put it, as the canvas measured.
  const last = tjNumber(pen - end);
  if (span !== undefined && last !== 0) {
    flush();
    span = undefined;
  }
  push(last);
  flush();
  if (subset) omitEmptyUnicode(subset);
  if (added) {
    embedder.glyphCache?.invalidate();
    // pdf-lib writes a font only once text was encoded with it.
    (font as unknown as { modified: boolean }).modified = true;
  }
  return { pieces, spans, advance: end };
}

const patchedCmaps = new WeakSet<Embedder>();

/** pdf-lib writes a glyph with no characters into the ToUnicode map as
 *  `<…> <>`, which pdf.js reads as the glyph's code: leave such glyphs out
 *  (the second glyph of a decomposed letter; its cluster's `/ActualText`
 *  reads for it). */
function omitEmptyUnicode(embedder: Embedder): void {
  if (patchedCmaps.has(embedder)) return;
  patchedCmaps.add(embedder);
  const e = embedder as unknown as {
    glyphCache: { access(): FontkitGlyph[] };
    glyphId(glyph: FontkitGlyph): number;
    embedUnicodeCmap(context: { flateStream(s: string): unknown; register(o: unknown): unknown }): unknown;
  };
  e.embedUnicodeCmap = (context) =>
    context.register(context.flateStream(toUnicodeCmap(e.glyphCache.access().map((g) => ({ id: e.glyphId(g), codePoints: g.codePoints })))));
}

function tjOperator(font: PDFFont, parts: ReadonlyArray<string | number>): PDFOperator {
  const array = PDFArray.withContext(font.doc.context);
  for (const part of parts) array.push(typeof part === 'number' ? PDFNumber.of(part) : PDFHexString.of(part));
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]);
}

/** How {@link drawShapedTextPx} sets a text. */
export interface ShapedTextOptions {
  /** The text is one bidi run in this direction (a VDT segment flagged
   *  `rtl`, or one without it on a line that carries directions). Absent:
   *  the text is cut into runs first (`bidiRuns.ts`). */
  direction?: 'ltr' | 'rtl';
  /** With no {@link direction}: the paragraph direction the runs are
   *  ordered in; by default the text's first strong letter's. */
  base?: 'ltr' | 'rtl';
  /** BCP 47 language of the text, for the font's `locl` forms. */
  language?: string;
  /** What copying and text extraction read for the glyphs: by default
   *  each glyph's characters, with the clusters that cannot be read so (see
   *  the module comment) under spans of their own; the whole text under one
   *  span when given (the line's repeated hyphen left out); null for no
   *  span at all. */
  actualText?: string | null;
  /** Leave tatweels (U+0640) out of the text read: justification inserted
   *  them (`VDTLine.kashida`). */
  hideTatweel?: boolean;
  outline?: TextOutline;
}

/** The runs of `text` HarfBuzz shapes, in visual order. */
function runsOf(text: string, options: ShapedTextOptions): BidiRun[] {
  if (options.direction) {
    const rtl = options.direction === 'rtl';
    return [{ start: 0, end: text.length, level: rtl ? 1 : 0, rtl }];
  }
  return bidiRuns(text, options.base);
}

/**
 * Paint `text` shaped by HarfBuzz from `xPx` on the baseline, in one text
 * object: each bidi run in its direction, the runs left to right, each run
 * cut by the file of the face that has its characters. Character spacing
 * is turned off for a text with joining letters, whose joins it would
 * break. Returns false, painting nothing, when HarfBuzz is not loaded: the
 * caller paints the text the fontkit way.
 */
export function drawShapedTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  options: ShapedTextOptions = {},
): boolean {
  if (!text) return true;
  if (!complexShaperReady() || !(sizePx > 0)) return false;
  const runs = runsOf(text, options);
  const sizePt = sizePx * ctx.scale;
  // Cluster spans, unless the caller reads the text some other way.
  const clusterSpans = options.actualText === undefined;
  const shows: TextShow[] = [];
  let rise = 0;
  let open = false;
  const close = (file: PDFFont) => {
    if (open) shows.push({ font: file, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) });
    open = false;
  };
  for (const run of runs) {
    const files = fileRuns(font, text.slice(run.start, run.end));
    // The files of a right-to-left run follow each other leftwards.
    if (run.rtl) files.reverse();
    for (const { font: file, text: part } of files) {
      const shown = shapedShow(file, part, run.rtl ? 'rtl' : 'ltr', options.language, options.hideTatweel === true);
      if (!shown) {
        // A file HarfBuzz cannot read (a standard font): fontkit's glyphs.
        if (rise !== 0) shows.push({ font: file, op: setTextRise(0) });
        rise = 0;
        shows.push(...textShows(file, part));
        continue;
      }
      let span: number | undefined;
      for (const piece of shown.pieces) {
        if (clusterSpans && piece.span !== span) {
          close(file);
          if (piece.span !== undefined) {
            shows.push({ font: file, op: spanOperator(ctx, shown.spans[piece.span]!) });
            open = true;
          }
          span = piece.span;
        }
        if (piece.rise !== rise) {
          shows.push({ font: file, op: setTextRise(tjNumber((piece.rise / 1000) * sizePt)) });
          rise = piece.rise;
        }
        shows.push({ font: file, op: piece.op });
      }
      close(file);
    }
  }
  // Joining letters are never spaced apart (the canvas ignores
  // `letterSpacing` on them too); the graphics state the text object is
  // wrapped in restores the line's spacing after it.
  if ((ctx.trackingPx ?? 0) !== 0 && joinsLetters(text)) shows.unshift({ font: shows[0]?.font ?? font, op: setCharacterSpacing(0) });
  pushTextObject(ctx, shows, xPx, baselinePx, font, sizePx, color, options.outline, options.actualText ?? undefined);
  return true;
}

type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;

/** `BDC` of a `/Span` whose `/ActualText` is `text`. */
function spanOperator(ctx: PageCtx, text: string): PDFOperator {
  const props = ctx.page.doc.context.obj({ ActualText: PDFHexString.fromText(text) }) as unknown as OperatorArg;
  return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]);
}

// `drawTextPx` hands complex text over (it cannot import this module back).
registerComplexPainter((ctx, text, xPx, baselinePx, font, sizePx, color, outline, actualText, direction) =>
  needsComplexShaping(text) && drawShapedTextPx(ctx, text, xPx, baselinePx, font, sizePx, color, { outline, actualText, ...(direction ? { direction } : {}) }));
