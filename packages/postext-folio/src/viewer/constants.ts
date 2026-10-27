// The folio viewer's default labels, sizes and thresholds, and the helpers
// that read a page's source, alternative text, paper and colour (#1276: split
// out of viewer.ts).
import type { FolioPaperConfig } from 'postext';
import type { PageSource } from '../pageFlip.js';
import type { FolioLabels, FolioPage } from './types.js';

export const DEFAULT_LABELS: FolioLabels = {
  region: "Book",
  prev: "Previous pages",
  next: "Next pages",
  count: (pages, total) =>
    pages.length > 1 ? `Pages ${pages[0] + 1}–${pages[pages.length - 1] + 1} of ${total}` : `Page ${(pages[0] ?? 0) + 1} of ${total}`,
};

/** A press on a page that moves less than this (px) is a click: it turns
 *  the page (the recto forward, the verso back). */
export const CLICK_SLOP = 6;
/** A horizontal swipe longer than this (px) turns the spread. */
export const SWIPE = 40;
/** Below this width (px) `mode: 'auto'` shows one page at a time. */
export const SINGLE_BELOW = 560;
/** Space kept round the book (CSS px): beside it for the ‹ › buttons, and
 *  above and below it for the page count (and a lifted leaf's corner). */
export const GAP = 12;
export const MIN_MARGIN_Y = 20;
/** The magnifying glass's range, and the default's aim: the page shown at
 *  this many CSS px a millimetre. */
export const ZOOM_MIN = 1.5;
export const ZOOM_MAX = 10;
export const LENS_PX_PER_MM = 5.5;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const CHEVRON = (dir: "left" | "right") =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}"/></svg>`;

export const sourceOf = (page: FolioPage | undefined): PageSource => (page && typeof page === "object" && "src" in page ? page.src : (page ?? null));
export const altOf = (page: FolioPage | undefined) => (page && typeof page === "object" && "src" in page ? page.alt : undefined);
export const paperOf = (page: FolioPage | undefined) =>
  page && typeof page === "object" && "src" in page ? (page as { paper?: FolioPaperConfig }).paper : undefined;

/** The natural width / height of a page source, when it is known. */
export function aspectOf(src: PageSource): number | null {
  if (!src || typeof src === "string") return null;
  const w = src instanceof HTMLCanvasElement ? src.width : src.naturalWidth;
  const h = src instanceof HTMLCanvasElement ? src.height : src.naturalHeight;
  return w > 0 && h > 0 ? w / h : null;
}

/** A CSS colour as 0 … 1 channels. */
export function rgbOf(color: string): [number, number, number] | null {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  // Over white: a transparent page is white paper.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
