// Ink and face measurements: ink boxes, font boxes, own-face probes, ink
// profiles and glyph widths.
import { fontStringWithFamily } from '../fontString.js';
import { metricsOf, onTextWidthCacheClear, measureUncachedWidth, type Context2D, _language, WIDE_RE, canvasText, applyLanguage } from './state.js';
import { measureTextWidth } from './widths.js';

/** The ink box of `text` in `font` above and below the alphabetic
 *  baseline (px), or null when the measurer gives no ink metrics. Not
 *  cached. */
export function measureInkBox(text: string, font: string): { ascent: number; descent: number } | null {
  const m = metricsOf(text, font) as Partial<TextMetrics>;
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  if (typeof ascent !== 'number' || typeof descent !== 'number' || !Number.isFinite(ascent) || !Number.isFinite(descent)) return null;
  return { ascent, descent };
}

/** The faces' line boxes, by font string (see {@link measureFontBox}). */
const fontBoxes = new Map<string, { ascent: number; descent: number } | null>();
onTextWidthCacheClear(() => fontBoxes.clear());

/** The line box `font` is laid out in, above and below the alphabetic
 *  baseline (px), or null when the measurer gives no face metrics. These
 *  are the numbers a browser sets a line box by: text in a box of
 *  `line-height: L` stands on a baseline `(L + ascent − descent) / 2`
 *  from the box's top, and `line-height: normal` makes L their sum. */
export function measureFontBox(font: string): { ascent: number; descent: number } | null {
  const known = fontBoxes.get(font);
  if (known !== undefined) return known;
  const m = metricsOf(' ', font) as Partial<TextMetrics>;
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  const box = typeof ascent === 'number' && typeof descent === 'number'
    && Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0
    ? { ascent, descent }
    : null;
  fontBoxes.set(font, box);
  return box;
}

/** A family nothing can have: a font string naming it is set in whatever
 *  the measurer falls back to, which is what a missing family gets. */
const NO_SUCH_FAMILY = '__postext_no_such_family__';
/** Letters and figures wide enough that two faces rarely set them alike. */
const FACE_PROBE = 'Hamburgefonstiv 0123';

/** Whether the measurer has a face of `font`'s own family (by family, by
 *  weight and by slant), rather than setting it in its fallback: the same
 *  probe in a family nothing has is measured and its line box read, and
 *  the face counts as present where either differs.
 *
 *  A host may hold a book's faces without having registered them where it
 *  measures — a worker has none of the page's fonts — and everything it
 *  measures is then set in the fallback. Text whose places the layout
 *  already holds is unharmed; text measured again as it is written out is
 *  not, so the writer asks this before it measures anything of its own.
 *
 *  A book set in a generic family (`serif`, `sans-serif`) reads as absent,
 *  since that is what the fallback is: the writer then keeps to what it
 *  can place from the layout, which is never wrong, only less exact. */
export function measuresOwnFace(font: string): boolean {
  const known = ownFaces.get(font);
  if (known !== undefined) return known;
  const present = probeOwnFace(font);
  ownFaces.set(font, present);
  return present;
}

const ownFaces = new Map<string, boolean>();
let readsFamilies: boolean | undefined;
onTextWidthCacheClear(() => {
  ownFaces.clear();
  readsFamilies = undefined;
});

/** Whether the measurer answers by the family it is asked for at all: one
 *  that sets two generic families alike is a stand-in (a test's, a host's
 *  own) and says nothing about which faces are there, so it is taken at
 *  its word. */
function measurerReadsFamilies(): boolean {
  if (readsFamilies === undefined) {
    readsFamilies = measureUncachedWidth(FACE_PROBE, '100px serif') !== measureUncachedWidth(FACE_PROBE, '100px monospace');
  }
  return readsFamilies;
}

function probeOwnFace(font: string): boolean {
  if (!measurerReadsFamilies()) return true;
  const missing = fontStringWithFamily(font, NO_SUCH_FAMILY);
  // A string the parser does not read: nothing to tell it from, and the
  // measurer answers for it as it always did.
  if (missing === null) return true;
  const own = measureFontBox(font);
  const none = measureFontBox(missing);
  if (own && none && (own.ascent !== none.ascent || own.descent !== none.descent)) return true;
  return measureUncachedWidth(FACE_PROBE, font) !== measureUncachedWidth(FACE_PROBE, missing);
}

/** How far the ink of a text reaches above and below the baseline at each
 *  pixel column along it (see {@link measureInkProfile}). */
export interface InkProfile {
  /** Where column 0 stands, px from the pen's origin (negative when the
   *  ink overhangs the origin). */
  start: number;
  /** The text's advance, px. */
  advance: number;
  /** Per column: px of ink above the baseline (−Infinity: no ink). */
  above: Float32Array;
  /** Per column: px of ink below the baseline (−Infinity: no ink). */
  below: Float32Array;
}

/** The contexts inks are painted on and read back from, made on first use
 *  (null: none can be made): one for each kind of string, as the measuring
 *  ones (#770), so the ink is the ink of the shape that was measured. */
const _profileCtx: { host?: Context2D | null; narrow?: Context2D | null; wide?: Context2D | null } = {};

function profileContext(kind: 'host' | 'narrow' | 'wide'): Context2D | null {
  let ctx = _profileCtx[kind];
  if (ctx === undefined) {
    ctx = null;
    try {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      const made = canvas?.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as Context2D | null | undefined;
      if (made && typeof made.fillText === 'function' && typeof made.getImageData === 'function') ctx = made;
    } catch {
      ctx = null;
    }
    _profileCtx[kind] = ctx;
  }
  return ctx;
}

/** Alpha under which a pixel is left out: a faint fringe. */
const INK_ALPHA = 32;

/**
 * The ink of `text` in `font` column by column: the text is painted from
 * its left edge, left to right as the page paints it, and each pixel
 * column records its highest and lowest inked pixel. Null when nothing can
 * be painted and read back (no canvas, or a measurer without pixels) or
 * the text has no ink. Not cached.
 */
export function measureInkProfile(text: string, font: string): InkProfile | null {
  const ctx = profileContext(_language === undefined ? 'host' : WIDE_RE.test(text) ? 'wide' : 'narrow');
  if (!ctx) return null;
  try {
    // The ink is the ink of the glyphs measured: the same language, and
    // the string handed over the same way.
    text = canvasText(text);
    applyLanguage(ctx, _language);
    ctx.font = font;
    const m = ctx.measureText(text);
    const { actualBoundingBoxLeft: left, actualBoundingBoxRight: right, actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = m;
    if (![left, right, ascent, descent].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    const pad = 2;
    const x0 = Math.floor(-left) - pad;
    const width = Math.ceil(right) + pad - x0;
    const top = Math.ceil(ascent) + pad;
    const height = top + Math.ceil(descent) + pad;
    if (width <= 0 || height <= 0 || width * height > 4_000_000) return null;
    const canvas = ctx.canvas as { width: number; height: number };
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if ('direction' in ctx) ctx.direction = 'ltr';
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(text, -x0, top);
    const data = ctx.getImageData(0, 0, width, height).data;
    const above = new Float32Array(width).fill(-Infinity);
    const below = new Float32Array(width).fill(-Infinity);
    let inked = false;
    // The outermost pixel of a column is only partly covered: its alpha
    // says how much, so the edge stands that far into it.
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a < INK_ALPHA) continue;
        above[x] = top - y - 1 + a / 255;
        inked = true;
        break;
      }
      for (let y = height - 1; y >= 0; y--) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a < INK_ALPHA) continue;
        below[x] = y - top + a / 255;
        break;
      }
    }
    return inked ? { start: x0, advance: m.width, above, below } : null;
  } catch {
    return null;
  }
}

/** Where the ink of `text` in `font` starts and ends along the line, px
 *  from the pen's origin (the start is negative when the ink overhangs
 *  it), or null when the measurer gives no ink metrics or the text has no
 *  ink. Not cached. */
export function measureInkExtent(text: string, font: string): { start: number; end: number } | null {
  const m = metricsOf(text, font) as Partial<TextMetrics>;
  const left = m.actualBoundingBoxLeft;
  const right = m.actualBoundingBoxRight;
  if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  const start = -left;
  return right > start ? { start, end: right } : null;
}

/** Measure a short glyph (e.g. a list bullet) in the given font. */
export function measureGlyphWidth(text: string, font: string): number {
  return measureTextWidth(text, font);
}

/** Compute the normal space width for a given font, used to express justified
 *  spacing as a multiplier of the natural space. */
export function normalSpaceWidthFor(font: string): number {
  return measureTextWidth(' ', font);
}

export function cleanSoftHyphens(text: string): string {
  return text.replace(/\u00AD/g, '');
}
