/**
 * Complex-script shaping with HarfBuzz (issue #380).
 *
 * pdf-lib shapes through fontkit, which joins Arabic letters but places
 * none of their marks: every `yOffset` is dropped, so a shadda and its
 * fatha land on each other, Noto Naskh's dots and kasras merge, and Amiri
 * loses the contextual lookups of a vocalised ٱللَّه. It also reverses a
 * right-to-left run whole, digits and Latin included, and picks the script
 * from the run's first letters, so a line that opens in Latin gets no
 * Arabic shaping at all. The browser that measured the layout shapes with
 * HarfBuzz; so does this module, glyph for glyph the same.
 *
 * HarfBuzz is a WebAssembly build (harfbuzzjs's `harfbuzz.wasm`, about
 * 430 KB, 145 KB brotli), bound in `harfbuzz.ts` without the harfbuzzjs
 * glue. It is loaded only for a document that sets text needing it
 * ({@link needsComplexShaping}), once, before the pages are drawn
 * ({@link loadComplexShaper}); shaping itself is then synchronous, as the
 * page painters are.
 *
 * Fonts are identified by their bytes (the file pdf-lib embeds): one
 * HarfBuzz face per file, and per face the runs already shaped, since the
 * same words recur through a book.
 */

import { loadHarfBuzz, type HarfBuzz, type HarfBuzzWasmSource, type HbFontHandle } from './harfbuzz';

let hb: HarfBuzz | undefined;
let loading: Promise<HarfBuzz> | undefined;
let lastSource: HarfBuzzWasmSource | undefined;

/** Why HarfBuzz could not be loaded, for the `complexShapingUnavailable`
 *  warning. */
export interface ComplexShaperFailure {
  reason: string;
}

/**
 * Load HarfBuzz, once. Resolves true when it is ready; when it could not
 * be loaded (no WebAssembly, the binary found nowhere), false, and
 * `onFailure` hears why: the painters then shape with fontkit, as they did
 * before, and the text keeps its joining but not its marks or its order.
 * A failed load is tried again on the next call, which may bring a
 * `source` (`RenderToPdfOptions.harfbuzzWasm`) the first did not; a call
 * without one (an SVG's text, shaped while the resources are embedded)
 * uses the last given. Once loaded, `source` is not looked at.
 */
export async function loadComplexShaper(source?: HarfBuzzWasmSource, onFailure?: (failure: ComplexShaperFailure) => void): Promise<boolean> {
  if (hb) return true;
  if (source !== undefined) lastSource = source;
  if (!loading) {
    loading = loadHarfBuzz(lastSource);
    loading.catch(() => { loading = undefined; });
  }
  try {
    hb = await loading;
    return true;
  } catch (err) {
    onFailure?.({ reason: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Whether {@link loadComplexShaper} has finished loading HarfBuzz. */
export function complexShaperReady(): boolean {
  return hb !== undefined;
}

/**
 * Whether a code point is shaped with HarfBuzz: a letter or mark of a
 * right-to-left script (Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan,
 * Mandaic and the Arabic extensions up to U+08FF; their presentation forms;
 * the right-to-left blocks of the supplementary planes, Adlam and Hanifi
 * Rohingya among them). Every right-to-left run needs it, not only the
 * joining ones: fontkit turns a run around whole, so a pointed Hebrew word
 * loses its mark positions and a number inside a Hebrew phrase reads
 * backwards. The Indic scripts are shaped well enough by fontkit for now
 * and stay with it.
 */
export function codePointNeedsComplexShaping(cp: number): boolean {
  if (cp < 0x0590) return false;
  return cp <= 0x08ff
    || (cp >= 0xfb1d && cp <= 0xfdff)
    || (cp >= 0xfe70 && cp <= 0xfefe)
    || (cp >= 0x10800 && cp <= 0x10fff)
    || (cp >= 0x1e800 && cp <= 0x1efff);
}

/** Whether `text` holds a character {@link codePointNeedsComplexShaping}. */
export function needsComplexShaping(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x0590) continue;
    if (c >= 0xd800 && c <= 0xdbff) {
      if (codePointNeedsComplexShaping(text.codePointAt(i)!)) return true;
      i++;
      continue;
    }
    if (codePointNeedsComplexShaping(c)) return true;
  }
  return false;
}

/**
 * Whether `text` holds a letter of a joining script (Arabic and its
 * extensions, Syriac, N'Ko, Mandaic, Hanifi Rohingya, Sogdian, Adlam):
 * letters that connect to their neighbours, which character spacing (`Tc`)
 * would pull apart. Hebrew and Thaana do not join and may be tracked.
 */
export function joinsLetters(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x0600) continue;
    if ((cp <= 0x074f) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x07c0 && cp <= 0x07ff)
      || (cp >= 0x0840 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefe)
      || (cp >= 0x10d00 && cp <= 0x10d3f) || (cp >= 0x10f30 && cp <= 0x10f6f) || (cp >= 0x1e900 && cp <= 0x1e95f)) {
      return true;
    }
  }
  return false;
}

/** One glyph of a shaped run, in font units. `gid` is the glyph's id in
 *  the font file; `cluster` the UTF-16 offset in the run's text of the
 *  first character it stands for. Glyphs come in visual order (left to
 *  right), so a right-to-left run lists its clusters descending. */
export interface ShapedGlyph {
  gid: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

/** A run shaped by {@link shapeRun}: its glyphs and the face's units per em. */
export interface ShapedRun {
  glyphs: readonly ShapedGlyph[];
  upem: number;
}

/** OpenType features to shape with: tags turned on (`['ss01']`), or tags
 *  with their values (`{ liga: false, salt: 2 }`), as pdf-lib takes them. */
export type ShapeFeatures = readonly string[] | Readonly<Record<string, boolean | number>>;

export interface ShapeOptions {
  /** The run's direction: a right-to-left run comes out reversed, its
   *  brackets mirrored. The text must be one bidi run (see `bidiRuns.ts`):
   *  HarfBuzz applies no bidi algorithm, and reverses the digits inside
   *  an Arabic run with the letters. */
  direction: 'ltr' | 'rtl';
  /** ISO 15924 script tag (`Arab`); guessed from the text when absent. */
  script?: string;
  /** BCP 47 language tag (`ar`, `fa`, `ur`): selects the font's `locl`
   *  forms (Persian and Urdu digits, Sindhi letters). */
  language?: string;
  features?: ShapeFeatures;
}

interface FaceEntry {
  font: HbFontHandle;
  runs: Map<string, ShapedRun>;
}

/** HarfBuzz faces by font file. */
const faces = new WeakMap<Uint8Array, FaceEntry>();
/** Shaped runs kept per face before the cache is emptied. */
const RUN_CACHE_SLOTS = 50_000;

function faceOf(bytes: Uint8Array): FaceEntry {
  let entry = faces.get(bytes);
  if (!entry) {
    const runs = new Map<string, ShapedRun>();
    entry = { font: hb!.openFont(bytes, runs), runs };
    faces.set(bytes, entry);
  }
  return entry;
}

function featureList(features: ShapeFeatures | undefined): [string, number][] | undefined {
  if (!features) return undefined;
  if (Array.isArray(features)) return (features as readonly string[]).map((tag) => [tag, 1]);
  return Object.entries(features).map(([tag, value]) => [tag, typeof value === 'number' ? value : value ? 1 : 0]);
}

function featureKey(features: ShapeFeatures | undefined): string {
  if (!features) return '';
  return Array.isArray(features) ? (features as readonly string[]).join(',') : Object.entries(features).map(([t, v]) => `${t}=${Number(v)}`).join(',');
}

/**
 * Shape `text` in the font file `fontBytes` with HarfBuzz. Undefined when
 * HarfBuzz is not loaded ({@link loadComplexShaper}). Cached per face,
 * text, direction, script, language and features; the result must not be
 * changed.
 *
 * Clusters are graphemes (`MONOTONE_GRAPHEMES`): a letter and its marks
 * are one cluster, which text extraction reads as one unit.
 */
export function shapeRun(fontBytes: Uint8Array, text: string, options: ShapeOptions): ShapedRun | undefined {
  if (!hb) return undefined;
  const face = faceOf(fontBytes);
  const key = `${options.direction}|${options.script ?? ''}|${options.language ?? ''}|${featureKey(options.features)}|${text}`;
  const hit = face.runs.get(key);
  if (hit) return hit;
  const glyphs: ShapedGlyph[] = hb.shape(face.font, text, {
    direction: options.direction,
    ...(options.script ? { script: options.script } : {}),
    ...(options.language ? { language: options.language } : {}),
    ...(options.features ? { features: featureList(options.features) } : {}),
  });
  const run: ShapedRun = { glyphs, upem: face.font.upem };
  if (face.runs.size >= RUN_CACHE_SLOTS) face.runs.clear();
  face.runs.set(key, run);
  return run;
}

/** The text each glyph of `run` stands for, for text extraction: the
 *  first glyph met of each cluster carries the cluster's characters
 *  (`text` from its offset up to the next cluster's), every other glyph of
 *  it (a mark a decomposition added, the second glyph of a split vowel)
 *  none. */
export function clusterTexts(run: ShapedRun, text: string): string[] {
  const starts = [...new Set(run.glyphs.map((g) => g.cluster))].sort((a, b) => a - b);
  const endOf = new Map<number, number>();
  for (let i = 0; i < starts.length; i++) endOf.set(starts[i]!, starts[i + 1] ?? text.length);
  const seen = new Set<number>();
  return run.glyphs.map((g) => {
    if (seen.has(g.cluster)) return '';
    seen.add(g.cluster);
    return text.slice(g.cluster, endOf.get(g.cluster));
  });
}
