// The canvas measurers and the measuring state: the language measured in,
// the width caches per language, and their clearing and eviction.
import { fontStringFamily } from '../fontString.js';

export type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** A measuring context and what was last set on it: the font string, to
 *  skip redundant `ctx.font` assignments (each assignment re-parses the
 *  shorthand), and the language. */
interface Measurer {
  ctx: Context2D;
  font: string;
  language: string;
}

// The language text is measured in (#764).
//
// A 2D context has a language (`ctx.lang`, Chrome 136 and later), which the
// shaper hands the font: Noto Serif SC sets `1` 47.1 px wide at 100 px in
// Chinese and 55 px in any language it has no forms for, Fira Sans sets
// `l·l` 62.5 px wide in Catalan and 81.6 px otherwise. Left alone
// (`inherit`) a context made on a page takes the language of the page that
// hosts the layout, and one made in a worker none, so one document had a
// layout per host. The engine sets the language itself, on every context
// it measures with: the document's, a block's or a run's own.
//
// Measured on Chrome 154: any string is taken; a tag the browser or the
// font knows nothing of (`''`, `und`, `xx`, `en` in a face with no English
// forms) gives the forms of no language, the ones a worker's `inherit`
// gives; setting the attribute to the value it has costs nothing that can
// be measured (40 000 measures in 6 ms either way), and so does reading it.
// A browser without the attribute measures as it did.

/** The value a context is given for "the host's language", what it has
 *  until someone sets another. */
const HOST_LANGUAGE = 'inherit';
/** The language set by {@link setMeasureLanguage}; undefined: the host's. */
export let _language: string | undefined;

/** Give `ctx` the language measured in, where the context has one. */
export function applyLanguage(ctx: object, language: string | undefined): void {
  if ('lang' in ctx) (ctx as { lang: string }).lang = language ?? HOST_LANGUAGE;
}

// A width that does not depend on what was measured before (#770).
//
// Chrome's canvas keeps the words it shaped, by context, font and
// language, under the word's text alone: a word is what stands between
// two spaces in one bidi run, cut before a Han character. The key says
// nothing of how the word was shaped, and there are two ways. A string of
// Latin-1 characters reaches the shaper one byte a character and is all
// Latin script to it. A string with any character past U+00FF, and a long
// slice of such a text (13 characters or more are a view of their parent
// in V8, still two bytes each), is cut into script runs word by word, and
// a word with no letter (`2026`, `(1)`, `.`, `"`) has no script there:
// the font draws it by its default rules, not its Latin ones. Noto Serif
// SC sets `2026` 22 px wide at 10 px in English the first way and
// 22.31 px the second, Amiri a full stop 2.02 px and 3.17 px. The first
// shape to enter the cache answers for both from then on: `2026` after
// `2026 — 2027`, the stop of `كتاب.` (a run of its own in a left-to-right
// context) after `.` was measured alone. So a width depended on the
// strings measured before it on the page: on the chapter laid out first,
// on the document the worker had before this one.
//
// A document shaped in its own language is measured on two contexts: one
// that only ever takes strings of Latin-1 characters, each rebuilt
// character by character so that it is one byte a character whatever text
// it was cut from, and one that only takes strings with a wider character.
// On each of them a word has one shape, so a string has one width: the one
// a context that never measured anything gives it. Measured in Chrome 154,
// on a page and in a worker: 182 strings in six orders, twelve pairs of
// face and language, no width moves (30 to 37 of them move on one context
// in Noto Serif SC and Amiri).
//
// A document in its host's language (`_language` undefined) is measured on
// one context, as up to postext 1.29: its widths are the ones it had.

/** A character past Latin-1: a string that holds one is two bytes a
 *  character to the browser. */
export const WIDE_RE = /[^\u0000-\u00FF]/;

/** The one context of a document measured in its host's language. */
let _host: Measurer | null = null;
/** The contexts of a document measured in its own: Latin-1 strings on one,
 *  strings with a wider character on the other. */
let _narrow: Measurer | null = null;
let _wide: Measurer | null = null;

function newMeasurer(): Measurer {
  const ctx = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(1, 1).getContext('2d')!
    : document.createElement('canvas').getContext('2d')!;
  return { ctx, font: '', language: HOST_LANGUAGE };
}

/** `text` as a string of one byte a character (V8 keeps a string built
 *  from single Latin-1 characters that way; a slice of a text with a wider
 *  character is two bytes a character, and Chrome shapes it otherwise).
 *  For a text of Latin-1 characters only. */
function oneByte(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += text[i];
  return out;
}

/** `text` as the measurer hands it to the canvas in a document shaped in
 *  its own language: a Latin-1 text one byte a character, any other as it
 *  is. A painter that hands its strings the same way has them shaped as
 *  they were measured. */
export function canvasText(text: string): string {
  return _language === undefined || WIDE_RE.test(text) ? text : oneByte(text);
}

/** The metrics of `text` in `font`, in the language measured in: on the
 *  context its kind of string is measured on (see above). `rtl`: in a
 *  context set right to left, as a right-to-left word is painted (its
 *  brackets mirrored). */
export function metricsOf(text: string, font: string, rtl = false, spacingPx = 0): TextMetrics {
  let measurer: Measurer;
  let handed = text;
  if (_language === undefined) {
    measurer = _host ??= newMeasurer();
  } else if (WIDE_RE.test(text)) {
    measurer = _wide ??= newMeasurer();
  } else {
    measurer = _narrow ??= newMeasurer();
    handed = oneByte(text);
  }
  const ctx = measurer.ctx;
  const wanted = _language ?? HOST_LANGUAGE;
  if (wanted !== measurer.language) {
    applyLanguage(ctx, _language);
    measurer.language = wanted;
  }
  if (font !== measurer.font) {
    ctx.font = font;
    measurer.font = font;
  }
  if (spacingPx !== 0) {
    // Only {@link measureSpacedWidth} asks, of a context that has the
    // attribute: it goes back to no spacing, what every other measure is
    // taken at.
    ctx.letterSpacing = `${spacingPx}px`;
    const metrics = ctx.measureText(handed);
    ctx.letterSpacing = '0px';
    return metrics;
  }
  if (!rtl || !('direction' in ctx)) return ctx.measureText(handed);
  const direction = ctx.direction;
  ctx.direction = 'rtl';
  const metrics = ctx.measureText(handed);
  ctx.direction = direction;
  return metrics;
}

/**
 * The width of `text` in `font` under a letter-spacing of `spacingPx`
 * (`ctx.letterSpacing`: the spacing after every letter counted in), in
 * the language measured in and on the context its kind of string is
 * measured on, kept nowhere. Undefined where the canvas has no
 * letter-spacing. For what asks how the browser shapes a tracked text
 * (`measure/trackedLigatures.ts`): under a letter-spacing it sets no
 * optional ligature.
 */
export function measureSpacedWidth(text: string, font: string, spacingPx: number): number | undefined {
  const probe = _language === undefined ? (_host ??= newMeasurer()) : WIDE_RE.test(text) ? (_wide ??= newMeasurer()) : (_narrow ??= newMeasurer());
  if (!('letterSpacing' in probe.ctx)) return undefined;
  return metricsOf(text, font, false, spacingPx).width;
}

/**
 * The width of `text` in `font` as the canvas gives it, in the language
 * measured in, kept nowhere: for a caller with a cache of its own (the
 * text library's segments, `measure/pretextLanguage.ts`).
 */
export function measureUncachedWidth(text: string, font: string): number {
  return metricsOf(text, font).width;
}

/** The widths measured in one language: every cache below is one of
 *  these, so a document in two languages keeps both. */
interface WidthCaches {
  width: Map<string, Map<string, number>>;
  widthEntries: number;
  run: Map<string, Map<string, number>>;
  runEntries: number;
  marked: Map<string, Map<string, number>>;
  markedEntries: number;
  /** Font string → whether its punctuation changes with the script. */
  sensitive: Map<string, boolean>;
}
const newCaches = (): WidthCaches => ({ width: new Map(), widthEntries: 0, run: new Map(), runEntries: 0, marked: new Map(), markedEntries: 0, sensitive: new Map() });
/** The caches of each language measured in (`''` under the key of the
 *  host's language is never mixed with the explicit empty tag: the host's
 *  is kept under {@link HOST_LANGUAGE}). */
let _cachesByLanguage = new Map<string, WidthCaches>();
/** The caches of the language measured in now. */
export let C: WidthCaches = newCaches();
_cachesByLanguage.set(HOST_LANGUAGE, C);

/**
 * Measure in `language` from now on: a BCP 47 tag (`zh-Hans`, `ca`), the
 * empty string for no language at all, or undefined for the host's (what
 * a context has when nobody sets one: the page's on a page, none in a
 * worker; a configuration with `bodyText.shapingLanguage: 'host'`). The
 * build sets the document's and puts back what it found; a block and a run
 * that name their own set it for their text ({@link withMeasureLanguage}).
 * Each language keeps its own widths, so going from one to another drops
 * nothing measured; a cache kept elsewhere of what was measured in a font
 * holds the language in its key ({@link measureLanguageKey}).
 */
export function setMeasureLanguage(language: string | undefined): void {
  if (language === _language) return;
  _language = language;
  const key = language ?? HOST_LANGUAGE;
  let caches = _cachesByLanguage.get(key);
  if (!caches) {
    caches = newCaches();
    _cachesByLanguage.set(key, caches);
  }
  C = caches;
}

/** The language set by {@link setMeasureLanguage}. */
export function getMeasureLanguage(): string | undefined {
  return _language;
}

/** Run `fn` measuring in `language`, then measure again in the language
 *  in force before, also when `fn` throws. */
export function withMeasureLanguage<T>(language: string | undefined, fn: () => T): T {
  const previous = _language;
  if (language === previous) return fn();
  setMeasureLanguage(language);
  try {
    return fn();
  } finally {
    setMeasureLanguage(previous);
  }
}

/** The part of a measurement cache key the language decides: empty for
 *  the host's, so those keys are unchanged. */
export function measureLanguageKey(): string {
  return _language === undefined ? '' : `lg${_language}\x00`;
}

/** Drop all cached text widths. Must be called whenever font faces are
 *  (un)registered: widths measured against fallback glyphs are stale. */
export function clearTextWidthCache(): void {
  evictTextWidths(null);
}

// The measurement generation (#629): bumped whenever widths are dropped, so
// caches filled under another generation (a host's `MeasurementCache`) know
// to drop what was measured with the faces that changed. The log says which
// families each bump concerned (null: all of them).
let _generation = 0;
const _evictions: { generation: number; families: ReadonlySet<string> | null }[] = [];
const MAX_EVICTIONS = 64;

/** The current measurement generation: a counter bumped by every
 *  {@link evictTextWidths} (and so by `clearMeasurementCache` and the
 *  per-family eviction when faces arrive). */
export function measurementGeneration(): number {
  return _generation;
}

/** What changed since `generation`: every family (`all`), or the
 *  families named by the evictions after it (lower case). */
export function evictionsSince(generation: number): { all: boolean; families: Set<string> } {
  const families = new Set<string>();
  if (generation >= _generation) return { all: false, families };
  const oldest = _evictions[0];
  if (!oldest || oldest.generation > generation + 1) return { all: true, families };
  for (const e of _evictions) {
    if (e.generation <= generation) continue;
    if (e.families === null) return { all: true, families };
    for (const f of e.families) families.add(f);
  }
  return { all: false, families };
}

function dropFamilies(caches: Map<string, Map<string, number>>, families: ReadonlySet<string>): number {
  let dropped = 0;
  for (const [font, byText] of caches) {
    const family = fontStringFamily(font);
    if (family !== null && families.has(family.toLowerCase())) {
      dropped += byText.size;
      caches.delete(font);
    }
  }
  return dropped;
}

/** Drop the cached widths measured in `families` (case-insensitive), or
 *  every width when `families` is null, and bump the measurement
 *  generation. The listeners of {@link onTextWidthCacheClear} (caches of
 *  ink and baselines) clear whole. */
export function evictTextWidths(families: Iterable<string> | null): void {
  const set = families === null ? null : new Set(Array.from(families, (f) => f.toLowerCase()));
  if (set === null) {
    // Every language's widths: the one measured in keeps its place.
    C = newCaches();
    _cachesByLanguage = new Map([[_language ?? HOST_LANGUAGE, C]]);
  } else {
    for (const caches of _cachesByLanguage.values()) {
      caches.widthEntries -= dropFamilies(caches.width, set);
      caches.runEntries -= dropFamilies(caches.run, set);
      caches.markedEntries -= dropFamilies(caches.marked, set);
      for (const font of [...caches.sensitive.keys()]) {
        const family = fontStringFamily(font);
        // A face of the stack may stand in for another: any font string
        // that names a changed family is asked again.
        if (family === null || [...set].some((f) => font.toLowerCase().includes(f))) caches.sensitive.delete(font);
      }
    }
  }
  // Each context resolves its font again on the next measure.
  for (const measurer of [_host, _narrow, _wide]) if (measurer) measurer.font = '';
  _generation++;
  _evictions.push({ generation: _generation, families: set });
  if (_evictions.length > MAX_EVICTIONS) _evictions.shift();
  for (const listener of _fontChangeListeners) listener();
}

const _fontChangeListeners = new Set<() => void>();

/** Called whenever {@link clearTextWidthCache} drops the widths (fonts
 *  changed): other font-dependent caches clear with it. */
export function onTextWidthCacheClear(listener: () => void): void {
  _fontChangeListeners.add(listener);
}
