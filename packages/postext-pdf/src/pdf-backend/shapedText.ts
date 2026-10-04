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
import { PDFArray, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, moveText, setCharacterSpacing, setCharacterSqueeze, setFillingColor, setTextRise, type Color, type PDFFont } from 'pdf-lib';
import { lineRuns, resolveParagraph } from 'postext';
import { complexShaperReady, joinsLetters, needsComplexShaping, shapeRun, clusterTexts, type ShapeFeatures, type ShapedRun } from '../complexShaping';
import { fileRuns, noteMissingGlyphs } from '../faceFiles';
import { toUnicodeCmap } from '../fontCache';
import { pushTextObject, registerComplexPainter, textAdvancePx, textShows, type PageCtx, type TextOutline, type TextShow } from './primitives';

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

/** A stretch of a shaped run encoded in one file of a face: its `TJ`
 * operators, each with the rise (thousandths of the em) its glyphs are
 * shown at and, for the glyphs of a cluster the ToUnicode map cannot read
 * back as written, the index in `spans` of the `/ActualText` they are
 * shown under; where the stretch leaves the pen (thousandths of the em
 * from where it starts); and how many glyphs it shows (each takes the
 * character spacing). */
interface ShapedShow {
  pieces: Array<{ rise: number; op: PDFOperator; span?: number }>;
  spans: string[];
  advance: number;
  glyphs: number;
}

/** One cluster of a {@link Shaping}: its text, its glyphs (visual order)
 *  and whether it is read through a span of its own (see the module
 *  comment), kashidas aside. */
interface ShapedCluster {
  text: string;
  glyphs: number[];
  span: boolean;
}

/**
 * A run shaped by HarfBuzz in one file of a face, with what reading it
 * back needs, glyph by glyph in visual order: the characters each glyph is
 * given in the ToUnicode map, the offset in the run's text of the
 * character it stands for (which styled run of a word it belongs to), its
 * origin and the pen before it (thousandths of the em from the run's left
 * end; `pen` has one entry more, where the run ends), its cluster, and the
 * order the glyphs are shown in. Encoding any stretch of it
 * ({@link encodeStretch}) reads from this.
 */
interface Shaping {
  run: ShapedRun;
  text: string;
  rtl: boolean;
  wants: number[][];
  owner: number[];
  at: number[];
  pen: number[];
  clusterOf: number[];
  clusters: ShapedCluster[];
  showOrder: number[];
}

const shapingsByFont = new WeakMap<PDFFont, Map<string, Shaping | null>>();
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

function cached<T>(byFont: WeakMap<PDFFont, Map<string, T>>, font: PDFFont, key: string, make: () => T): T {
  let cache = byFont.get(font);
  if (!cache) {
    cache = new Map();
    byFont.set(font, cache);
  }
  if (cache.has(key)) return cache.get(key)!;
  const value = make();
  if (cache.size >= SHOW_CACHE_SLOTS) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * `text` (one bidi run, set in one file) shaped by HarfBuzz in `font`:
 * cached per font, direction and language. Null when the font has no file
 * bytes to shape from (a standard font) or HarfBuzz is not loaded.
 */
function shapingOf(font: PDFFont, text: string, direction: 'ltr' | 'rtl', language: string | undefined): Shaping | null {
  return cached(shapingsByFont, font, `${direction}|${language ?? ''}|${text}`, () => buildShaping(font, text, direction, language));
}

/**
 * A stretch of {@link shapingOf}, glyphs `[from, to)` in visual order (by
 * default all of them), encoded in `font`: cached per font, direction,
 * language, whether tatweels are read, and stretch.
 */
/** `ShapedTextOptions.hideTatweel` as a count (`Infinity`: all). */
function tatweelsToHide(hide: boolean | number | undefined): number {
  return hide === true ? Number.POSITIVE_INFINITY : typeof hide === 'number' && hide > 0 ? hide : 0;
}

function shapedShow(
  font: PDFFont,
  text: string,
  direction: 'ltr' | 'rtl',
  language: string | undefined,
  hideTatweel: number,
  from?: number,
  to?: number,
): ShapedShow | null {
  const key = `${direction}|${language ?? ''}|${hideTatweel}|${from ?? ''}|${to ?? ''}|${text}`;
  return cached(showsByFont, font, key, () => {
    const shaping = shapingOf(font, text, direction, language);
    return shaping ? encodeStretch(font, shaping, from ?? 0, to ?? shaping.run.glyphs.length, hideTatweel) : null;
  });
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

/** The offset in a cluster's text of the character a glyph stands for:
 *  the first of `want` not yet taken by another glyph of the cluster (a
 *  glyph given nothing stands for the cluster's first character). */
function ownerOffset(clusterText: string, want: readonly number[], taken: Set<number>): number {
  const first = want.length > 0 ? Math.min(...want.map((cp) => {
    for (let k = 0; k < clusterText.length;) {
      const c = clusterText.codePointAt(k)!;
      if (c === cp && !taken.has(k)) return k;
      k += c > 0xffff ? 2 : 1;
    }
    return clusterText.length;
  })) : 0;
  const at = first < clusterText.length ? first : 0;
  taken.add(at);
  return at;
}

function buildShaping(font: PDFFont, text: string, direction: 'ltr' | 'rtl', language: string | undefined): Shaping | null {
  const embedder = embedderOf(font);
  if (!embedder) return null;
  const run = shapeRun(embedder.fontData!, text, { direction, language, features: shapeFeatures(embedder.fontFeatures) });
  if (!run) return null;
  noteMissingGlyphs(font, text);
  const face = embedder.font;
  const rtl = direction === 'rtl';
  const toText = 1000 / run.upem;
  let settled = settledByEmbedder.get(embedder);
  if (!settled) {
    settled = new Set();
    settledByEmbedder.set(embedder, settled);
  }
  const texts = clusterTexts(run, text);
  const glyphs = run.glyphs;
  const n = glyphs.length;
  const wants: number[][] = new Array(n);
  const owner: number[] = new Array(n);
  const clusterOf: number[] = new Array(n);
  const clusters: ShapedCluster[] = [];
  // The order glyphs are shown in: cluster by cluster, left to right, and
  // inside a cluster read through a span its glyphs on the baseline first:
  // a reader places the span's text where its first glyph is, and a raised
  // mark there would put it on a line of its own.
  const showOrder: number[] = [];
  for (let a = 0; a < n;) {
    let b = a + 1;
    while (b < n && glyphs[b]!.cluster === glyphs[a]!.cluster) b++;
    // The cluster's glyphs, logical order; its text is on the first met.
    const indices = Array.from({ length: b - a }, (_, k) => a + k);
    if (rtl) indices.reverse();
    const clusterText = texts[a]!;
    const start = glyphs[a]!.cluster;
    const cps = clusterCodePoints(face, indices.map((i) => glyphs[i]!.gid), codePointsOf(clusterText), rtl);
    const taken = new Set<number>();
    let readsBack = true;
    indices.forEach((i, k) => {
      const g = glyphs[i]!;
      const want = cps[k]!;
      wants[i] = want;
      owner[i] = start + ownerOffset(clusterText, want, taken);
      clusterOf[i] = clusters.length;
      const glyph = face.getGlyph(g.gid, want);
      if (!glyph) return;
      // A glyph met for the first time reads as given here; one already in
      // the font keeps what it was given.
      const known = settled.has(g.gid) || (embedder.glyphIdMap?.has(g.gid) ?? false) || glyph.codePoints.length > 0;
      if (!known) glyph.codePoints = want;
      settled.add(g.gid);
      if (!sameCodePoints(glyph.codePoints, want)) readsBack = false;
    });
    // A vocalised letter (marks raised or lowered, which readers would set
    // on a line of their own) and a cluster whose glyphs read as other
    // text: read as the cluster's text.
    const vocalised = indices.some((i) => glyphs[i]!.yOffset !== 0);
    const visual = Array.from({ length: b - a }, (_, k) => a + k);
    if (vocalised) visual.sort((p, q) => Number(glyphs[p]!.yOffset !== 0) - Number(glyphs[q]!.yOffset !== 0));
    clusters.push({ text: clusterText, glyphs: indices, span: !readsBack || vocalised });
    showOrder.push(...visual);
    a = b;
  }
  const at: number[] = new Array(n);
  const pen: number[] = new Array(n + 1);
  let end = 0;
  for (let i = 0; i < n; i++) {
    pen[i] = end;
    at[i] = end + glyphs[i]!.xOffset * toText;
    end += glyphs[i]!.xAdvance * toText;
  }
  pen[n] = end;
  return { run, text, rtl, wants, owner, at, pen, clusterOf, clusters, showOrder };
}

/**
 * Glyphs `[from, to)` (visual order) of `shaping`, encoded in `font`, the
 * pen starting where glyph `from` is. A cluster whose glyphs all fall in
 * the stretch reads through its span as written; one cut by the stretch
 * (a vowel sign in another colour than its letter) reads, in each
 * stretch, as the characters of the glyphs shown there. With
 * `hideTatweel` (how many, `Infinity` for all), a cluster holding a tatweel
 * reads through a span without that many of its tatweels: justification
 * inserted them. A tatweel the author typed next to them stays read.
 */
function encodeStretch(font: PDFFont, shaping: Shaping, from: number, to: number, hideTatweel: number): ShapedShow | null {
  const embedder = embedderOf(font);
  if (!embedder) return null;
  const face = embedder.font;
  const glyphs = shaping.run.glyphs;
  const toText = 1000 / shaping.run.upem;
  const subset = embedder.subset && embedder.glyphs && embedder.glyphIdMap ? embedder : undefined;
  const inside = (i: number) => i >= from && i < to;
  // The span each cluster of the stretch reads through, by cluster.
  const spans: string[] = [];
  const spanOfCluster = new Map<number, number | undefined>();
  let toHide = hideTatweel;
  const spanOf = (i: number): number | undefined => {
    const c = shaping.clusterOf[i]!;
    if (spanOfCluster.has(c)) return spanOfCluster.get(c);
    const cluster = shaping.clusters[c]!;
    const tatweel = toHide > 0 && cluster.text.includes('ـ');
    let span: number | undefined;
    if (cluster.span || tatweel) {
      const whole = cluster.glyphs.every(inside);
      let text = whole ? cluster.text : cluster.glyphs.filter(inside).map((g) => String.fromCodePoint(...shaping.wants[g]!)).join('');
      if (tatweel) text = text.replace(/ـ/g, (t) => (toHide-- > 0 ? '' : t));
      spans.push(text);
      span = spans.length - 1;
    }
    spanOfCluster.set(c, span);
    return span;
  };

  const origin = shaping.pen[from]!;
  const end = shaping.pen[to]! - origin;
  const pieces: ShapedShow['pieces'] = [];
  let parts: Array<string | number> = [];
  let rise = 0;
  let span: number | undefined;
  let added = false;
  let shown = 0;
  // Where the pen is, thousandths of the em from the stretch's start.
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
  for (const i of shaping.showOrder) {
    if (!inside(i)) continue;
    const g = glyphs[i]!;
    const glyph = face.getGlyph(g.gid, shaping.wants[i]);
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
    const glyphSpan = spanOf(i);
    if (glyphRise !== rise || glyphSpan !== span) {
      // The pen move into the glyph opens the next piece, inside its span.
      flush();
      rise = glyphRise;
      span = glyphSpan;
    }
    // A TJ number moves the pen back by thousandths of the em: to the
    // glyph's origin, then the viewer advances it by its `W` width (notdef
    // in a subset has none and takes the default).
    const move = tjNumber(pen - (shaping.at[i]! - origin));
    push(move);
    pen -= move;
    push(id.toString(16).padStart(4, '0'));
    pen += id === 0 && subset ? MISSING_WIDTH : glyph.advanceWidth * toText;
    shown++;
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
  return { pieces, spans, advance: end, glyphs: shown };
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
   *  the text is cut into runs first, by the engine's UAX #9
   *  (`resolveParagraph`, `lineRuns`). */
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
   *  them. `true`: every one; a number: that many, the ones kashida
   *  justification inserted into a word (`VDTLineSegment.kashida`), so a
   *  tatweel the author typed stays in the text read. */
  hideTatweel?: boolean | number;
  outline?: TextOutline;
}

/** A run of one direction, `[start, end)` in the text. */
interface DirectedRun {
  start: number;
  end: number;
  rtl: boolean;
}

/** The runs of `text` HarfBuzz shapes, in visual order: one in the given
 *  direction, else the text's bidi runs of one level each (UAX #9 with
 *  rules L1 and L2, the engine's `bidi.ts`, as the layout resolves a
 *  paragraph). */
function runsOf(text: string, options: Pick<ShapedTextOptions, 'direction' | 'base'>): DirectedRun[] {
  if (options.direction) return [{ start: 0, end: text.length, rtl: options.direction === 'rtl' }];
  return lineRuns(resolveParagraph(text, options.base ?? 'auto')).map((r) => ({ start: r.start, end: r.end, rtl: (r.level & 1) === 1 }));
}

/** Text shown by {@link layoutShapedText}: the shows of one text object
 *  and how far they move the pen, thousandths of the em, with the number
 *  of glyphs shown (each also takes the character spacing). */
interface ShapedLayout {
  shows: TextShow[];
  advance: number;
  glyphs: number;
}

/** Appends the pieces of `shown` to `shows`, each at its rise (text space
 *  units are thousandths of the em times `fontSize`) and, with `spanOp`,
 *  inside the span its cluster reads through. `state` carries the rise set
 *  and the span open from one call to the next. */
function appendShown(
  shows: TextShow[],
  file: PDFFont,
  shown: ShapedShow,
  fontSize: number,
  state: { rise: number },
  spanOp: ((text: string) => PDFOperator) | undefined,
): void {
  let span: number | undefined;
  let open = false;
  for (const piece of shown.pieces) {
    if (spanOp && piece.span !== span) {
      if (open) shows.push({ font: file, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) });
      open = false;
      if (piece.span !== undefined) {
        shows.push({ font: file, op: spanOp(shown.spans[piece.span]!) });
        open = true;
      }
      span = piece.span;
    }
    if (piece.rise !== state.rise) {
      shows.push({ font: file, op: setTextRise(tjNumber((piece.rise / 1000) * fontSize)) });
      state.rise = piece.rise;
    }
    shows.push({ font: file, op: piece.op });
  }
  if (open) shows.push({ font: file, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) });
}

/**
 * `text` shaped by HarfBuzz as the show operators of one text object: each
 * bidi run in its direction, the runs left to right, each run cut by the
 * file of the face that has its characters. `fontSize` is the font size in
 * the text space the shows are painted in (for the rise of marks).
 * `spanOp` opens the `/ActualText` span of a cluster; without it no span
 * is written. Null when HarfBuzz is not loaded.
 */
function layoutShapedText(
  font: PDFFont,
  text: string,
  fontSize: number,
  options: ShapedTextOptions,
  spanOp: ((text: string) => PDFOperator) | undefined,
): ShapedLayout | null {
  if (!complexShaperReady()) return null;
  const shows: TextShow[] = [];
  const state = { rise: 0 };
  let advance = 0;
  let glyphs = 0;
  for (const run of runsOf(text, options)) {
    const files = fileRuns(font, text.slice(run.start, run.end));
    // The files of a right-to-left run follow each other leftwards.
    if (run.rtl) files.reverse();
    for (const { font: file, text: part } of files) {
      const shown = shapedShow(file, part, run.rtl ? 'rtl' : 'ltr', options.language, tatweelsToHide(options.hideTatweel));
      if (!shown) {
        // A file HarfBuzz cannot read (a standard font): fontkit's glyphs.
        if (state.rise !== 0) shows.push({ font: file, op: setTextRise(0) });
        state.rise = 0;
        shows.push(...textShows(file, part));
        const plain = textAdvancePx(file, part, 1000);
        advance += plain.advance;
        glyphs += plain.glyphs;
        continue;
      }
      appendShown(shows, file, shown, fontSize, state, spanOp);
      advance += shown.advance;
      glyphs += shown.glyphs;
    }
  }
  return { shows, advance, glyphs };
}

/**
 * Paint `text` shaped by HarfBuzz from `xPx` on the baseline, in one text
 * object: each bidi run in its direction, the runs left to right, each run
 * cut by the file of the face that has its characters. Character spacing
 * is turned off for a text with joining letters, whose joins it would
 * break. On a mirrored page the text object is turned back about the box
 * HarfBuzz's own advances give the text (`pushTextObject`'s `advancePx`),
 * so it lands exactly where it was measured. Returns false, painting
 * nothing, when HarfBuzz is not loaded: the caller paints the text the
 * fontkit way.
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
  if (!(sizePx > 0)) return false;
  const sizePt = sizePx * ctx.scale;
  // Cluster spans, unless the caller reads the text some other way.
  const layout = layoutShapedText(font, text, sizePt, options, options.actualText === undefined ? (t) => spanOperator(ctx, t) : undefined);
  if (!layout) return false;
  const shows = layout.shows;
  // Joining letters are never spaced apart (the canvas ignores
  // `letterSpacing` on them too); the graphics state the text object is
  // wrapped in restores the line's spacing after it.
  const untracked = (ctx.trackingPx ?? 0) !== 0 && joinsLetters(text);
  if (untracked) shows.unshift({ font: shows[0]?.font ?? font, op: setCharacterSpacing(0) });
  const advancePx = (layout.advance / 1000) * sizePx + layout.glyphs * (untracked ? 0 : ctx.trackingPx ?? 0);
  pushTextObject(ctx, shows, xPx, baselinePx, font, sizePx, color, options.outline, options.actualText ?? undefined, advancePx);
  return true;
}

/**
 * Text of an SVG drawing (`svgVector.ts`) shaped by HarfBuzz: the show
 * operators of one text object in `font`'s face at `size` (the drawing's
 * units), and its advance in those units. No `/ActualText` spans: the
 * drawing is a figure, read through its alternate text. Null when
 * HarfBuzz is not loaded.
 */
export function shapedSvgText(font: PDFFont, text: string, size: number, base?: 'ltr' | 'rtl'): { shows: TextShow[]; advance: number } | null {
  const layout = layoutShapedText(font, text, size, { base }, undefined);
  return layout ? { shows: layout.shows, advance: (layout.advance / 1000) * size } : null;
}

/** A styled run of a word painted by {@link drawStyledWordPx}: `[start,
 *  end)` in the word's text, and the face and colour it is set in. */
export interface StyledWordPart {
  start: number;
  end: number;
  font: PDFFont;
  color: Color;
}

/** The one file of `font`'s face that sets all of `text`, if there is one. */
function singleFile(font: PDFFont, text: string): PDFFont | undefined {
  const files = fileRuns(font, text);
  return files.length === 1 ? files[0]!.font : undefined;
}

/**
 * Paint a word set in several styles (`VDTLineSegment.runs`, `كتا**ب**`)
 * as one shaped run, so its letters keep the forms they take in the whole
 * word, each glyph in the style of the run its character belongs to.
 *
 * The word is shaped once in its own face (`font`, the style it was
 * measured in): that shaping gives every glyph's place and the word's
 * width. Walking its glyphs left to right, each stretch of glyphs of one
 * run is shown in that run's colour:
 * - in the same face, the stretch's own glyphs, where they are;
 * - in another face (a bold letter in a regular word), the word is shaped
 *   whole in that face too, so the letters at the cut take the joining
 *   forms of the whole word, and the glyphs of the stretch's characters are
 *   shown over the box the stretch has in the word's own shaping,
 *   horizontally scaled (`Tz`) to its width: the joins at both ends meet
 *   their neighbours, and the word keeps the width it was measured with.
 *   A stretch of vowel signs alone (no advance) keeps the word's face and
 *   takes only the colour, since a mark's place depends on its letter's
 *   glyph.
 * A vowel sign in a run of its own (a red fatha) is a glyph of its own,
 * so it is coloured apart from its letter. All the stretches are one text
 * object, glyphs left to right (each stretch placed with `Td`), so the
 * word reads back as one, as an unstyled word does.
 *
 * Returns false, painting nothing, when HarfBuzz is not loaded or a face
 * sets the word from several files: the caller then paints the word in
 * one style.
 */
export function drawStyledWordPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  parts: readonly StyledWordPart[],
  options: Pick<ShapedTextOptions, 'direction' | 'language' | 'hideTatweel' | 'actualText'> = {},
): boolean {
  if (!text) return true;
  if (!complexShaperReady() || !(sizePx > 0)) return false;
  const file = singleFile(font, text);
  if (!file) return false;
  const direction = options.direction ?? 'ltr';
  const base = shapingOf(file, text, direction, options.language);
  if (!base) return false;
  const hide = tatweelsToHide(options.hideTatweel);
  const sizePt = sizePx * ctx.scale;
  const n = base.run.glyphs.length;
  const partOf = base.owner.map((offset) => parts.findIndex((p) => offset >= p.start && offset < p.end));
  const spanOp = options.actualText === undefined ? (t: string) => spanOperator(ctx, t) : undefined;
  const shows: TextShow[] = [];
  const state = { rise: 0 };
  let fill = color;
  let squeeze = 100;
  // Where the last `Td` put the line, thousandths of the em.
  let lineAt = 0;
  for (let a = 0; a < n;) {
    let b = a + 1;
    while (b < n && partOf[b] === partOf[a]) b++;
    const part = parts[partOf[a]!];
    let showFile = file;
    let shown: ShapedShow | null = null;
    let scale = 1;
    const other = part && part.font !== font ? singleFile(part.font, text) : undefined;
    const width = base.pen[b]! - base.pen[a]!;
    if (other && other !== file && width > 0) {
      // The other face's glyphs of the same characters, in its own shaping
      // of the whole word.
      const shaping = shapingOf(other, text, direction, options.language);
      const owners = new Set(base.owner.slice(a, b));
      let from = -1;
      let to = -1;
      shaping?.owner.forEach((o, i) => {
        if (!owners.has(o)) return;
        if (from < 0) from = i;
        to = i + 1;
      });
      if (shaping && from >= 0) {
        const otherWidth = shaping.pen[to]! - shaping.pen[from]!;
        shown = otherWidth > 0 ? shapedShow(other, text, direction, options.language, hide, from, to) : null;
        if (shown) {
          scale = width / otherWidth;
          showFile = other;
        }
      }
    }
    shown ??= shapedShow(file, text, direction, options.language, hide, a, b);
    if (!shown) return false;
    const partColor = part?.color ?? color;
    if (partColor !== fill) {
      shows.push({ font: showFile, op: setFillingColor(partColor) });
      fill = partColor;
    }
    const percent = tjNumber(scale * 100);
    if (percent !== squeeze) {
      shows.push({ font: showFile, op: setCharacterSqueeze(percent) });
      squeeze = percent;
    }
    // `Td` moves the line start, in unscaled text space (points).
    const move = tjNumber(((base.pen[a]! - lineAt) / 1000) * sizePt);
    if (move !== 0) {
      shows.push({ font: showFile, op: moveText(move, 0) });
      lineAt = base.pen[a]!;
    }
    appendShown(shows, showFile, shown, sizePt, state, spanOp);
    a = b;
  }
  if ((ctx.trackingPx ?? 0) !== 0 && joinsLetters(text)) shows.unshift({ font: shows[0]?.font ?? file, op: setCharacterSpacing(0) });
  pushTextObject(ctx, shows, xPx, baselinePx, file, sizePx, color, undefined, options.actualText ?? undefined, (base.pen[n]! / 1000) * sizePx);
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
