/**
 * The picture of a box style in the frame-style library (#873): a small
 * document holding one `:::callout` of the style, with a sample paragraph
 * and, when the style has a tab, a sample label, laid out by the engine
 * with the book's settings on an 80 mm measure and painted by its canvas
 * renderer, then cut to what was drawn. The style is drawn as a frame dresses it: in the flow,
 * across the measure, without the place a callout style may give its box
 * (DESIGN §2.4).
 */

import { buildDocument, inheritCalloutStyles, renderPageToCanvas, type CalloutStyleConfig, type PostextConfig, type Resource } from 'postext';
import { hasWindow } from '../env/window.js';

export interface PreviewSample {
  text: string;
  label: string;
}

/** Room above the box for a label tab, and around it. */
const TOP_MM = 14;
const SIDE_MM = 6;

/** The style as a frame wears it: in the flow, filling the measure. */
export function frameDress(style: CalloutStyleConfig): CalloutStyleConfig {
  const out: CalloutStyleConfig = { ...style, placement: 'here', span: 'column', width: 'fill', marginTop: { value: 0, unit: 'mm' }, marginBottom: { value: 0, unit: 'mm' }, floatBarrier: false };
  delete out.fixed;
  delete out.columns;
  delete out.sideAtColumnEnd;
  return out;
}

const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 };

/** The style for the sample: dressed as a frame, its tab kept on the
 *  sample box (a tab set far along a wide frame would fall off it). */
export function previewDress(style: CalloutStyleConfig): CalloutStyleConfig {
  const out = frameDress(style);
  const inset = out.label?.inset;
  const per = inset ? MM_PER[inset.unit] : undefined;
  if (out.label && inset && per !== undefined && inset.value * per > PREVIEW_MEASURE_MM * 0.4) {
    out.label = { ...out.label, inset: { value: 4, unit: 'mm' } };
  }
  return out;
}

/** Width of the sample box: a frame of a textbook page, wide enough for
 *  a few words a line at the book's size, narrow enough to read in the
 *  panel. */
export const PREVIEW_MEASURE_MM = 80;

/** Width of the sample box: 80 mm, or wider when the style's padding
 *  leaves less than 40 mm of measure (a port that sets the measure with
 *  the padding of a page-wide box). */
export function previewMeasureMm(style: CalloutStyleConfig): number {
  const side = (d: { value: number; unit: string } | undefined) => (d && MM_PER[d.unit] !== undefined ? d.value * MM_PER[d.unit]! : 0);
  const padding = side(style.padding?.left) + side(style.padding?.right);
  return Math.max(PREVIEW_MEASURE_MM, Math.ceil(padding + 40));
}

/** `style` with what it inherits through `extends` (#905) written in and
 *  `extends` left out, read against the book's own styles (`style` taking
 *  the place of the one of its id, or standing last when the book has none
 *  of it). The sample holds only this one style, so its parent has to be
 *  folded in before it is drawn. */
export function inheritedStyle(config: Pick<PostextConfig, 'calloutStyles'>, style: CalloutStyleConfig): CalloutStyleConfig {
  if (style.extends === undefined) return style;
  const book = config.calloutStyles ?? [];
  const at = book.findIndex((s) => s.id === style.id);
  const list = at >= 0 ? book.map((s, i) => (i === at ? style : s)) : [...book, style];
  return inheritCalloutStyles(list)[at >= 0 ? at : list.length - 1] ?? style;
}

/** The book's settings for a page holding only the sample box (see
 *  {@link previewMeasureMm}): one column, no running heads, templates, line numbers, print
 *  marks or debug drawing. */
export function previewConfig(config: PostextConfig, style: CalloutStyleConfig): PostextConfig {
  const page = config.page ?? {};
  const margins = page.margins ?? {};
  const side = { value: SIDE_MM, unit: 'mm' as const };
  return {
    ...config,
    page: {
      ...page,
      width: { value: previewMeasureMm(style) + 2 * SIDE_MM, unit: 'mm' },
      height: { value: 200, unit: 'mm' },
      margins: { ...margins, top: { value: TOP_MM, unit: 'mm' }, bottom: side, left: side, right: side, mirror: false },
      cutLines: undefined,
    },
    layout: { ...config.layout, layoutType: 'single' },
    calloutStyles: [previewDress(inheritedStyle(config, style))],
    pageTemplates: undefined,
    header: { elements: [] },
    footer: { elements: [] },
    lineNumbers: undefined,
    print: undefined,
    debug: undefined,
    footnotes: undefined,
  };
}

/** A fence attribute value: no quote or brace can close it early. */
function attrValue(text: string): string {
  return text.replace(/["{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** The sample box: the label only when the style draws a tab. */
export function previewMarkdown(style: CalloutStyleConfig, sample: PreviewSample): string {
  const attr = (key: string, value: string) => ` ${key}="${attrValue(value)}"`;
  const tab = style.label ? attr('label', sample.label) : '';
  return `:::callout{${attr('type', style.id).trim()}${tab}}\n${sample.text}\n:::\n`;
}

/** What makes two previews the same picture. */
export function previewKey(config: PostextConfig, style: CalloutStyleConfig, sample: PreviewSample, resourcesVersion: string): string {
  const { calloutStyles: _styles, pageTemplates: _templates, ...rest } = config;
  void _styles;
  void _templates;
  return JSON.stringify([rest, style, sample, resourcesVersion]);
}

/** The drawn area of a painted page: every pixel that is not paper white,
 *  padded; null when nothing was drawn. */
function inkBounds(ctx: CanvasRenderingContext2D, w: number, h: number, pad: number): { x: number; y: number; w: number; h: number } | null {
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      if (data[i]! > 248 && data[i + 1]! > 248 && data[i + 2]! > 248) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(w, x1 + pad + 1) - x, h: Math.min(h, y1 + pad + 1) - y };
}

export interface PaintedPreview {
  canvas: HTMLCanvasElement;
  /** A picture of the page was not decoded yet: paint again later. */
  missing: boolean;
}

/** Lay out and paint the sample box of `style`, `pixelWidth` pixels wide
 *  at most. */
export function paintStylePreview(
  config: PostextConfig,
  style: CalloutStyleConfig,
  resources: readonly Resource[],
  sample: PreviewSample,
  pixelWidth: number,
): PaintedPreview | null {
  if (typeof document === 'undefined') return null;
  const doc = buildDocument({ markdown: previewMarkdown(style, sample), resources: [...resources] }, previewConfig(config, style));
  const page = doc.pages[0];
  if (!page || page.width <= 0) return null;
  // Painted so the measure is about `pixelWidth` wide, then cut.
  const measure = Math.max(page.contentArea.width, 1);
  const scale = Math.min(4, (pixelWidth * 1.15) / measure);
  const big = document.createElement('canvas');
  let missing = false;
  renderPageToCanvas(page, doc, big, { scale, onWarning: (w) => { if (w.kind === 'missingImage') missing = true; } });
  const ctx = big.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const sidePx = (SIDE_MM / 25.4) * doc.config.page.dpi * scale;
  const bounds = inkBounds(ctx, big.width, big.height, Math.round(sidePx * 0.35));
  const out = document.createElement('canvas');
  if (!bounds) {
    out.width = 1;
    out.height = 1;
    return { canvas: out, missing };
  }
  const fit = Math.min(1, pixelWidth / bounds.w);
  out.width = Math.max(1, Math.round(bounds.w * fit));
  out.height = Math.max(1, Math.round(bounds.h * fit));
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, out.width, out.height);
  big.width = 1;
  big.height = 1;
  return { canvas: out, missing };
}

// --- Paint queue: one preview per idle slice, newest requests first. ---

const cache = new Map<string, PaintedPreview>();
const CACHE_MAX = 300;
interface Job {
  key: string;
  run: () => PaintedPreview | null;
  done: (p: PaintedPreview | null) => void;
  cancelled: boolean;
}
const queue: Job[] = [];
let scheduled = false;

type IdleWindow = Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };

function pump(): void {
  scheduled = false;
  const started = performance.now();
  while (queue.length > 0 && performance.now() - started < 24) {
    const job = queue.pop()!;
    if (job.cancelled) continue;
    let painted: PaintedPreview | null = null;
    try {
      painted = job.run();
    } catch {
      painted = null;
    }
    if (painted && !painted.missing) {
      cache.set(job.key, painted);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    }
    job.done(painted);
  }
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (scheduled || !hasWindow()) return;
  scheduled = true;
  const w = window as IdleWindow;
  if (w.requestIdleCallback) w.requestIdleCallback(() => pump(), { timeout: 600 });
  else setTimeout(pump, 16);
}

/** The painted preview for `key`, at once when it is cached, else after
 *  an idle slice; the returned function cancels a request not run yet. */
export function requestStylePreview(key: string, run: () => PaintedPreview | null, done: (p: PaintedPreview | null) => void): () => void {
  const hit = cache.get(key);
  if (hit) {
    done(hit);
    return () => undefined;
  }
  const job: Job = { key, run, done, cancelled: false };
  queue.push(job);
  schedule();
  return () => {
    job.cancelled = true;
  };
}
