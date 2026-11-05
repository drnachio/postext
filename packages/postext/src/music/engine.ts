import type { ScoreFormat, ScoreItem, ScoreRender, ScoreRenderOptions, ScoreSystem } from './types.js';
import { flattenVerovioSvg, itemsToSvg } from './flatten.js';
import { measureTextWidth } from '../measure/canvas.js';
import { buildFontString } from '../measure/font.js';

// ---------------------------------------------------------------------------
// Verovio singleton — lazy init. Verovio (LGPL-3.0) stays its own package,
// loaded with a dynamic import only by documents that hold a score: it is
// ~12 MB of WebAssembly (3.7 MB compressed), and a host can swap in its own
// build. The build with the Humdrum reader, which the plain one lacks: it
// reads ABC, MusicXML and MEI as well.
// ---------------------------------------------------------------------------

interface VerovioToolkit {
  setOptions(options: Record<string, unknown>): void;
  loadData(data: string): boolean;
  getPageCount(): number;
  renderToSVG(page: number): string;
  getLog(): string;
  getMEI(options?: Record<string, unknown>): string;
}

let toolkit: VerovioToolkit | null = null;
let initPromise: Promise<void> | null = null;
const initListeners = new Set<() => void>();
let warnedWithoutEngine = false;

/** Whether the music engine has finished loading. */
export function isMusicReady(): boolean {
  return toolkit !== null;
}

/** Call `fn` when the music engine is ready. Returns the function that
 *  cancels it. */
export function onMusicReady(fn: () => void): () => void {
  if (toolkit !== null) {
    fn();
    return () => {};
  }
  initListeners.add(fn);
  return () => { initListeners.delete(fn); };
}

/**
 * Load Verovio and start the score engraver. Await it before laying out a
 * document with scores on the main thread (the layout worker calls it
 * itself): until it resolves, every score is set as a grey placeholder box.
 * Idempotent; a failed start can be retried.
 */
export async function initMusicEngine(): Promise<void> {
  if (toolkit !== null) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
        import('verovio/wasm-hum'),
        import('verovio/esm'),
      ]);
      const module = await createVerovioModule();
      toolkit = new VerovioToolkit(module) as unknown as VerovioToolkit;
    } catch (err) {
      initPromise = null;
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`[postext] the music engine failed to start: ${reason}`, { cause: err });
    }
    for (const fn of initListeners) fn();
    initListeners.clear();
  })();
  return initPromise;
}

/** Called when the layout sets a score with no engine running. Warns once,
 *  and only when nobody asked for the engine. */
export function noteMusicWithoutEngine(): void {
  if (toolkit !== null || initPromise !== null || warnedWithoutEngine) return;
  warnedWithoutEngine = true;
  console.warn(
    '[postext] This document contains music scores, but the music engine is not running, so every score is laid out as a grey placeholder box. '
    + 'Call `await initMusicEngine()` before `buildDocument` (the layout worker does it for you).',
  );
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

const MAX_CACHE = 512;
const cache = new Map<string, ScoreRender>();

function cacheKey(source: string, format: ScoreFormat, widthPx: number, o: ScoreRenderOptions): string {
  return [
    format, widthPx.toFixed(2), o.staffSizePx.toFixed(3), o.font, o.textFont ?? '', o.spacing,
    o.barNumbers, o.systemSpacing, source,
  ].join('|');
}

/** Forget every score engraved so far. */
export function clearMusicCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Verovio's staff height at scale 100, in px: 4 staff spaces of 18 px. */
const STAFF_PX_AT_100 = 72;

/** The value of the first ABC header line `field:` (`T:` title, `C:`
 *  composer), read line by line. */
function abcField(source: string, field: string): string | undefined {
  for (const line of source.split('\n')) {
    if (line.startsWith(`${field}:`)) {
      const value = line.slice(field.length + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

/** The text of the first element whose opening tag starts with one of
 *  `openings` (`<work-title`, `<creator type="composer"`), found with plain
 *  string scans. */
function elementText(source: string, openings: readonly string[]): string | undefined {
  const lower = source.toLowerCase();
  for (const opening of openings) {
    const at = lower.indexOf(opening);
    if (at < 0) continue;
    const next = source[at + opening.length];
    if (next !== '>' && next !== ' ' && next !== '\t' && next !== '\n') continue;
    const open = source.indexOf('>', at);
    const close = open < 0 ? -1 : source.indexOf('<', open + 1);
    if (close < 0) continue;
    const text = source.slice(open + 1, close).trim();
    if (text) return text;
  }
  return undefined;
}

function readMetadata(source: string, format: ScoreFormat): { title?: string; composer?: string } {
  if (format === 'abc') return { title: abcField(source, 'T'), composer: abcField(source, 'C') };
  return {
    title: elementText(source, ['<work-title', '<movement-title', '<title']),
    composer: elementText(source, ['<creator type="composer"', '<persname role="composer"', '<composer']),
  };
}

function verovioOptions(widthPx: number, o: ScoreRenderOptions, leftMarginPx = 0): Record<string, unknown> {
  // Engrave at scale 100 on a page as wide as the measure at that scale; the
  // slices are then scaled to the measure exactly (Verovio's scale is an
  // integer percentage, too coarse for a staff size in px).
  const toScale100 = STAFF_PX_AT_100 / o.staffSizePx;
  return {
    scale: 100,
    pageWidth: Math.max(100, Math.round(widthPx * toScale100)),
    // Room for a brace or bracket left of the staves (see `renderScore`).
    pageMarginLeft: Math.round(leftMarginPx * toScale100),
    // One system per page: each page is one breakable slice of the score.
    pageHeight: 100,
    adjustPageHeight: true,
    breaks: 'auto',
    header: 'none',
    footer: 'none',
    pageMarginTop: 0,
    pageMarginBottom: 0,
    pageMarginRight: 0,
    spacingSystem: o.systemSpacing,
    spacingLinear: 0.25 * o.spacing,
    spacingNonLinear: 0.6,
    mnumInterval: o.barNumbers === 'every' ? 1 : 0,
    // Room between the words of a lyric line: at the engraver's default
    // (1.2) the words of a narrow measure touch ("nigh,sha-").
    lyricWordSpace: 2.5,
    font: o.font,
    svgViewBox: true,
    svgRemoveXlink: true,
    smuflTextFont: 'none',
  };
}

const COORD_RUN_RE = /[MLCQST]([^A-Za-z]*)/g;

/** The width of a word set in `textFont` (about half an em per character
 *  where nothing measures). */
function wordWidth(text: string, sizePx: number, bold: boolean, italic: boolean, textFont: string): number {
  try {
    const w = measureTextWidth(text, buildFontString(textFont, sizePx, bold ? 'bold' : 'normal', italic ? 'italic' : 'normal'));
    if (w > 0) return w;
  } catch {
    // No measuring context: the estimate below.
  }
  return text.length * sizePx * 0.5;
}

/** The leftmost x a system paints at: its paths' points, and the start of
 *  its words. A bar number at a system start is centred on the staves'
 *  left edge, so half of it stands left of them (#1310). */
function itemsMinX(items: readonly ScoreItem[], textFont: string): number {
  let min = Infinity;
  for (const it of items) {
    if (it.type === 'text') {
      const w = it.anchor ? wordWidth(it.text, it.sizePx, it.bold, it.italic, textFont) : 0;
      const left = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
      if (left < min) min = left;
      continue;
    }
    for (const m of it.d.matchAll(COORD_RUN_RE)) {
      const nums = m[1]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      for (let k = 0; k < nums.length; k += 2) if (nums[k]! < min) min = nums[k]!;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/** The face Verovio measures words in when it spaces the notes. */
const ENGRAVER_TEXT_FONT = 'Times New Roman';

/**
 * A word of several runs (a chord symbol and its raised figure) as one item
 * per run, each at its size and baseline, laid side by side by their widths
 * in `textFont`.
 */
function layOutRuns(items: ScoreItem[], textFont: string): ScoreItem[] {
  if (!items.some((it) => it.type === 'text' && it.runs)) return items;
  const out: ScoreItem[] = [];
  for (const it of items) {
    if (it.type !== 'text' || !it.runs) { out.push(it); continue; }
    const widths = it.runs.map((r) => r.dx + wordWidth(r.text, r.sizePx, r.bold ?? it.bold, r.italic ?? it.italic, textFont));
    const total = widths.reduce((a, b) => a + b, 0);
    let x = it.anchor === 'middle' ? it.x - total / 2 : it.anchor === 'end' ? it.x - total : it.x;
    it.runs.forEach((r, i) => {
      x += r.dx;
      out.push({ type: 'text', x, y: it.y + r.rise, text: r.text, sizePx: r.sizePx, bold: r.bold ?? it.bold, italic: r.italic ?? it.italic });
      x += widths[i]! - r.dx;
    });
  }
  return out;
}

/**
 * Words set in `textFont` at the room the engraver gave them: it spaces
 * lyrics and directions by its own (Times) metrics, so a wider face would
 * run one syllable into the next. A word wider in `textFont` than in Times
 * is set that much smaller. Without a measuring context (a bare Node
 * process) the words are left as they are.
 */
function fitWords(items: ScoreItem[], textFont: string): ScoreItem[] {
  if (textFont === ENGRAVER_TEXT_FONT) return items;
  try {
    return items.map((it) => {
      if (it.type !== 'text') return it;
      const weight = it.bold ? 'bold' : 'normal';
      const style = it.italic ? 'italic' : 'normal';
      const planned = measureTextWidth(it.text, buildFontString(ENGRAVER_TEXT_FONT, 100, weight, style));
      const actual = measureTextWidth(it.text, buildFontString(textFont, 100, weight, style));
      if (!(planned > 0) || !(actual > planned * 1.01)) return it;
      return { ...it, sizePx: it.sizePx * (planned / actual) };
    });
  } catch {
    return items;
  }
}

const DEFAULT_TEXT_FONT = 'Times New Roman, serif';

function toSystem(svg: string, o: ScoreRenderOptions, widthPx: number): ScoreSystem | null {
  const flat = flattenVerovioSvg(svg, widthPx, o.barNumbers === 'none' ? { skipClasses: ['mNum'] } : undefined);
  if (!flat) return null;
  const textFont = o.textFont || DEFAULT_TEXT_FONT;
  const items = fitWords(layOutRuns(flat.items, textFont), textFont);
  return {
    widthPx,
    heightPx: flat.heightPx,
    items,
    // Every backend paints the same words: HTML, PDF and EPUB from this SVG.
    svg: itemsToSvg(items, widthPx, flat.heightPx, 'currentColor', textFont),
    textFont,
  };
}

/**
 * Engrave a score at a measure `widthPx` wide. Returns one slice per system;
 * an empty list (with `error`) when the source does not load or the engine
 * is not running.
 */
export function renderScore(
  source: string,
  format: ScoreFormat,
  widthPx: number,
  options: ScoreRenderOptions,
): ScoreRender {
  const key = cacheKey(source, format, widthPx, options);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const meta = readMetadata(source, format);
  if (toolkit === null) {
    noteMusicWithoutEngine();
    return { systems: [], error: 'music engine not running', ...meta };
  }
  const engrave = (leftMarginPx: number): ScoreSystem[] | null => {
    toolkit!.setOptions(verovioOptions(widthPx, options, leftMarginPx));
    if (!toolkit!.loadData(source)) return null;
    // Bar numbers need numbered measures: ABC and Humdrum import theirs
    // without `@n`. Numbered in order, and read again as MEI.
    if (options.barNumbers !== 'none') {
      const mei = toolkit!.getMEI();
      if (/<measure\b(?![^>]*\bn=)/.test(mei)) {
        let n = 0;
        if (!toolkit!.loadData(mei.replace(/<measure\b(?![^>]*\bn=)/g, () => `<measure n="${++n}"`))) return null;
      }
    }
    const systems: ScoreSystem[] = [];
    const pages = toolkit!.getPageCount();
    for (let p = 1; p <= pages; p++) {
      const slice = toSystem(toolkit!.renderToSVG(p), options, widthPx);
      if (slice) systems.push(slice);
    }
    return systems;
  };
  let systems = engrave(0);
  // A brace or bracket joining staves, or a bar number centred on their
  // left edge, stands left of them, past the measure's edge: engraved again
  // with a left margin that takes it, the staves indented as far.
  const overhang = systems ? -Math.min(0, ...systems.map((s) => itemsMinX(s.items, s.textFont))) : 0;
  if (systems && overhang > 0.5) systems = engrave(Math.ceil(overhang + 1));
  const result: ScoreRender = systems
    ? { systems, ...meta }
    : { systems: [], error: toolkit.getLog().trim() || `the ${format} source did not load`, ...meta };
  cache.set(key, result);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return result;
}
