// HarfBuzz shapings cached per font, their clusters, stretches encoded
// as glyph ids in the subset and the TJ operators they make
// (#1276: split out of shapedText.ts).
import { type PDFFont, PDFOperator, PDFArray, PDFNumber, PDFHexString, PDFOperatorNames } from 'pdf-lib';
import { type ShapedRun, type ShapeFeatures, shapeRun, clusterTexts } from '../../../complexShaping.js';
import { noteMissingGlyphs } from '../../../faceFiles.js';
import { shapingScriptOf, shapingLanguage } from '../../../shapingLanguage.js';
import { toUnicodeCmap } from '../../../fontCache.js';

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
export interface ShapedShow {
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

export function tjNumber(n: number): number {
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
export function shapingOf(font: PDFFont, text: string, direction: 'ltr' | 'rtl', language: string | undefined): Shaping | null {
  return cached(shapingsByFont, font, `${direction}|${language ?? ''}|${scriptKey(text)}${text}`, () => buildShaping(font, text, direction, language));
}

/** The script `text` is shaped in (`shapingScriptOf`: the one in force,
 *  #725, the one of the letter a part was cut from beside or Latin for
 *  text the canvas shaped as Latin, #764) in a cache key: empty with none,
 *  so every other key is unchanged. */
function scriptKey(text: string): string {
  const script = shapingScriptOf(text);
  return script === undefined ? '' : `${script}\u0001`;
}

/** The language a run is shaped in: the one its caller names, else the
 *  one in force (the document's, a segment's own; #764), none when that
 *  is no language. */
export function languageOf(named: string | undefined): string | undefined {
  return named ?? (shapingLanguage() || undefined);
}

/**
 * A stretch of {@link shapingOf}, glyphs `[from, to)` in visual order (by
 * default all of them), encoded in `font`: cached per font, direction,
 * language, whether tatweels are read, and stretch.
 */
/** `ShapedTextOptions.hideTatweel` as a count (`Infinity`: all). */
export function tatweelsToHide(hide: boolean | number | undefined): number {
  return hide === true ? Number.POSITIVE_INFINITY : typeof hide === 'number' && hide > 0 ? hide : 0;
}

export function shapedShow(
  font: PDFFont,
  text: string,
  direction: 'ltr' | 'rtl',
  language: string | undefined,
  hideTatweel: number,
  from?: number,
  to?: number,
): ShapedShow | null {
  const key = `${direction}|${language ?? ''}|${hideTatweel}|${from ?? ''}|${to ?? ''}|${scriptKey(text)}${text}`;
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
  // A word with no letter is shaped in the script the layout measured it
  // in (#725), a part with no letter in the script of the word it was cut
  // out of and text the canvas shaped as Latin in the Latin script (#764);
  // any other text in the script HarfBuzz reads from it.
  const script = shapingScriptOf(text);
  const run = shapeRun(embedder.fontData!, text, { direction, language, ...(script ? { script } : {}), features: shapeFeatures(embedder.fontFeatures) });
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
