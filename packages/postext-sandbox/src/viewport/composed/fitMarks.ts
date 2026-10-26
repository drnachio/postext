/**
 * How the frames of a composed page fit (#867), drawn in the canvas
 * overlay (never on the page itself, so never in a PDF, a print or an
 * export):
 *
 * - a frame whose content does not fit (`overflowPx > 0`, what the engine
 *   reports as `frameOverflow`): a red outline, a red band along its foot
 *   and the shortfall in millimetres;
 * - a frame whose text the reflow ladder shrank (`scale < 1`): the scale
 *   it was set at, and its pictures' when they were scaled too;
 * - a frame whose `:::frame` piece names a look `frameLooks` does not have
 *   (`VDTFrame.lookUnknown`, #1095): a violet dashed outline and the name;
 * - the frame a check of the Checks panel just took the reader to,
 *   outlined for a moment.
 *
 * Which of them are drawn (#1160): every one (`all`), the problems only
 * (`problems`: frames that do not fit, unknown looks) or none; the scale
 * badges of frames set at `minScale` or larger are left out. The frame a
 * check just reached is outlined in every mode, as it answers a click.
 */

import type { FitMarksMode, VDTDocument, VDTFrame, VDTPage } from 'postext';
import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { markFontPx } from './frameOverlay.js';
import { jumpFlashNow } from '../../editions/frameJump.js';
import { drawOverlapMarks } from './overlapMarks.js';

export interface FitMark {
  frame: VDTFrame;
  kind: 'overflow' | 'scaled' | 'look' | 'target';
  /** What the mark writes (`+3.4 mm`, `87.5 %`). */
  text: string;
}

export interface FitMarkLabels {
  /** «__mm__ mm short» */
  overflow: string;
  /** «Text at __percent__ %» */
  scaled: string;
  /** «Pictures at __percent__ %» */
  imageScaled: string;
  /** «Unknown look: __look__» (#1095) */
  lookUnknown?: string;
}

/** A percentage with at most one decimal, in the reader's numerals. */
function percent(scale: number, locale?: string): string {
  const v = Math.round(scale * 1000) / 10;
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(v);
  }
}

function millimetres(px: number, dpi: number, locale?: string): string {
  const v = Math.round((px * 25.4 * 10) / dpi) / 10;
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(v);
  }
}

/** Which marks are drawn (#1160): the mode, and the scale at which a
 *  scale badge is no longer drawn (1 draws every scaled frame). */
export interface FitMarksFilter {
  mode?: FitMarksMode;
  minScale?: number;
}

export interface FitMarksOptions extends FitMarksFilter {
  targetFrameId?: string | null;
  locale?: string;
}

/** The marks of one page: the frame just reached, then the frames that
 *  do not fit and the scaled ones, in template order. Frames read on the facing page of a spread
 *  are marked where they are read. */
export function fitMarksFor(
  doc: Pick<VDTDocument, 'config'>,
  page: Pick<VDTPage, 'composed'>,
  labels: FitMarkLabels,
  options: FitMarksOptions = {},
): FitMark[] {
  const composed = page.composed;
  if (!composed) return [];
  const dpi = doc.config.page?.dpi ?? 300;
  const mode = options.mode ?? 'all';
  const minScale = options.minScale ?? 1;
  const out: FitMark[] = [];
  for (const frame of mode === 'none' ? [] : composed.frames) {
    if (frame.facingBlocks && frame.blockIds.length === 0) continue;
    // A look the config does not have (#1095): drawn with its style alone.
    if (frame.lookUnknown !== undefined && labels.lookUnknown) out.push({ frame, kind: 'look', text: labels.lookUnknown.replace('__look__', frame.lookUnknown) });
    if (frame.overflowPx > 0) {
      out.push({ frame, kind: 'overflow', text: labels.overflow.replace('__mm__', millimetres(frame.overflowPx, dpi, options.locale)) });
      continue;
    }
    // A scaled frame is information, not a problem: the ladder set it
    // within what the template allows.
    if (mode === 'problems') continue;
    const lines: string[] = [];
    if (frame.scale < Math.min(1, minScale)) lines.push(labels.scaled.replace('__percent__', percent(frame.scale, options.locale)));
    if (frame.imageScale !== undefined && frame.imageScale < Math.min(1, minScale)) lines.push(labels.imageScaled.replace('__percent__', percent(frame.imageScale, options.locale)));
    if (lines.length > 0) out.push({ frame, kind: 'scaled', text: lines.join(' · ') });
  }
  // The frame just reached goes under the others' marks (its overflow
  // badge stays readable).
  const target = options.targetFrameId ? composed.frames.find((f) => f.id === options.targetFrameId) : undefined;
  return target ? [{ frame: target, kind: 'target', text: '' }, ...out] : out;
}

/** A turned frame's turn about its centre, as the page selection's mark
 *  writes it (`selection/pickedOverlay.ts`, a `matrix()` the Folio reads
 *  too), so both marks sit on the same box. The box is the frame's
 *  `rect`, the box as drawn: a frame whose text the ladder scaled keeps
 *  its drawn size (only its content, `frameContentRect`, is laid out
 *  larger), and its `overflowPx` is already in sheet px. Null upright. */
export function frameTurnMatrix(rect: { x: number; y: number; width: number; height: number }, rotate: number): string | null {
  if (!rotate) return null;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const a = (rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return `matrix(${[cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy].join(' ')})`;
}

const RED = '#d0021b';
const AMBER = '#9a5b00';
const TARGET = '#1d6fd6';
/** White on it: 8.6 : 1. */
const LOOK = '#6a2c91';

function groupOf(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>('g[data-role="fit"]');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.dataset.role = 'fit';
    // Under the selection and the caret, over the frame marks.
    const selection = svg.querySelector('g[data-role="selection"]');
    svg.insertBefore(g, selection);
  }
  return g;
}

export function clearFitMarks(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('g[data-role="fit"]');
  if (g) while (g.firstChild) g.removeChild(g.firstChild);
}

function badge(item: SVGGElement, x: number, y: number, text: string, fs: number, color: string, anchorEnd: boolean): void {
  const w = fs * (0.58 * text.length + 0.9);
  const h = fs * 1.5;
  const left = anchorEnd ? x - w : x;
  const ground = document.createElementNS(SVG_NS, 'rect');
  ground.setAttribute('x', String(left));
  ground.setAttribute('y', String(y));
  ground.setAttribute('width', String(w));
  ground.setAttribute('height', String(h));
  ground.setAttribute('rx', String(fs * 0.3));
  ground.setAttribute('fill', color);
  item.appendChild(ground);
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(left + w / 2));
  t.setAttribute('y', String(y + h * 0.7));
  t.setAttribute('font-size', String(fs));
  t.setAttribute('font-family', 'system-ui, sans-serif');
  t.setAttribute('font-weight', '600');
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('fill', '#ffffff');
  t.textContent = text;
  item.appendChild(t);
}

/** Draw the fit marks of `pageIndex` into its overlay. */
export function drawFitMarks(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  labels: FitMarkLabels,
  options: FitMarksOptions = {},
): void {
  const page = doc.pages[pageIndex];
  if (!page?.composed) {
    clearFitMarks(svg);
    return;
  }
  const g = groupOf(svg);
  clearFitMarks(svg);
  const unit = page.width / 600;
  const fs = markFontPx(page);
  const pxPerMm = (doc.config.page?.dpi ?? 300) / 25.4;
  for (const mark of fitMarksFor(doc, page, labels, options)) {
    const { rect, rotate } = mark.frame;
    const item = document.createElementNS(SVG_NS, 'g');
    item.dataset.frameId = mark.frame.id;
    item.dataset.fit = mark.kind;
    const turn = frameTurnMatrix(rect, rotate);
    if (turn) item.setAttribute('transform', turn);
    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('x', String(rect.x));
    box.setAttribute('y', String(rect.y));
    box.setAttribute('width', String(Math.max(1, rect.width)));
    box.setAttribute('height', String(Math.max(1, rect.height)));
    box.setAttribute('fill', 'none');
    if (mark.kind === 'overflow') {
      box.setAttribute('stroke', RED);
      box.setAttribute('stroke-width', String(unit * 2.4));
      item.appendChild(box);
      // What does not fit, under the frame's foot: a band as tall as the
      // shortfall (40 mm at most), where the clipped content would go.
      const short = Math.max(unit * 3, Math.min(mark.frame.overflowPx, pxPerMm * 40));
      const band = document.createElementNS(SVG_NS, 'rect');
      band.setAttribute('x', String(rect.x));
      band.setAttribute('y', String(rect.y + rect.height));
      band.setAttribute('width', String(Math.max(1, rect.width)));
      band.setAttribute('height', String(short));
      band.setAttribute('fill', RED);
      band.setAttribute('fill-opacity', '0.14');
      band.setAttribute('stroke', RED);
      band.setAttribute('stroke-width', String(unit));
      band.setAttribute('stroke-dasharray', `${unit * 3} ${unit * 2}`);
      item.appendChild(band);
      badge(item, rect.x + rect.width - unit * 2, rect.y + rect.height - fs * 0.75, mark.text, fs, RED, true);
    } else if (mark.kind === 'look') {
      box.setAttribute('stroke', LOOK);
      box.setAttribute('stroke-width', String(unit * 1.6));
      box.setAttribute('stroke-dasharray', `${unit * 4} ${unit * 2}`);
      item.appendChild(box);
      badge(item, rect.x + unit * 2, rect.y + unit * 2, mark.text, fs, LOOK, false);
    } else if (mark.kind === 'scaled') {
      box.setAttribute('stroke', AMBER);
      box.setAttribute('stroke-width', String(unit * 1.2));
      box.setAttribute('stroke-dasharray', `${unit * 2} ${unit * 3}`);
      item.appendChild(box);
      badge(item, rect.x + rect.width - unit * 2, rect.y + unit * 2, mark.text, fs, AMBER, true);
    } else {
      box.setAttribute('stroke', TARGET);
      box.setAttribute('stroke-width', String(unit * 3));
      box.setAttribute('fill', TARGET);
      box.setAttribute('fill-opacity', '0.08');
      item.appendChild(box);
    }
    g.appendChild(item);
  }
}

/** The canvas's call: the page's fit marks, with the frame a jump just
 *  reached (see `editions/frameJump.ts`), filtered as the viewer or the
 *  book asks (`viewport/composed/fitMarksView.ts`). */
export function drawPageFitMarks(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  labels: { composedFitOverflow: string; composedFitScaled: string; composedFitImageScaled: string; composedFitLookUnknown?: string },
  locale?: string,
  filter: FitMarksFilter = {},
): void {
  const flash = jumpFlashNow();
  drawFitMarks(svg, doc, pageIndex, {
    overflow: labels.composedFitOverflow,
    scaled: labels.composedFitScaled,
    imageScaled: labels.composedFitImageScaled,
    ...(labels.composedFitLookUnknown ? { lookUnknown: labels.composedFitLookUnknown } : {}),
  }, { ...filter, targetFrameId: flash && flash.pageIndex === pageIndex ? flash.frameId : null, ...(locale ? { locale } : {}) });
  // The overlap check the reader selected (#1066), over the fit marks.
  drawOverlapMarks(svg, doc, pageIndex);
}
