/**
 * The overlap check the reader selected (#1066), drawn in the canvas
 * overlay (never on the page itself, so never in a PDF, a print or an
 * export):
 *
 * - `frameCovered`: the covered frame's box (blue, dashed), the covering
 *   frame's (red) and the rectangle where the two meet, filled red;
 * - `frameOutsideArea`: the frame's box (red), the box it runs past (the
 *   trim, the bleed, or the frame or group it is anchored inside, dashed)
 *   and a red band on each side it runs past, as deep as the overrun.
 *
 * The boxes are the frames as laid on the page (a turned frame by the
 * upright box holding it), the overrun the check's own figures. Pure
 * geometry in {@link overlapMarksFor}; the canvas calls
 * {@link drawOverlapMarks}.
 */

import { dimensionToPx, type VDTDocument, type VDTFrame, type VDTPage } from 'postext';
import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { overlapFocusNow, type OverlapFocusOf } from '../../editions/overlapFocus.js';
import { turnAbout } from './reflowMarks.js';

type Box = VDTFrame['rect'];

export interface OverlapMarks {
  /** The frame the check is about (the covered one, or the one that runs
   *  past). */
  frame: Box;
  /** The covering frame (`frameCovered`). */
  covering?: Box;
  /** The box the frame runs past (`frameOutsideArea`), when it is known
   *  on this page. */
  limit?: Box;
  /** Where the two frames meet, or the overrun bands. */
  hits: Box[];
}

/** The upright box holding a frame as laid (turned about its centre). */
export function frameBox(f: Pick<VDTFrame, 'rect' | 'rotate'>): Box {
  if (!f.rotate) return { ...f.rect };
  const r = f.rect;
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height },
  ].map((p) => turnAbout(r, f.rotate, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function intersectBoxes(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x && y1 > y ? { x, y, width: x1 - x, height: y1 - y } : null;
}

function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: x1 - x, height: y1 - y };
}

/** A frame of the page by its name, where it is read (not a facing copy). */
function frameNamed(page: Pick<VDTPage, 'composed'>, name: string): VDTFrame | undefined {
  const frames = page.composed?.frames ?? [];
  return frames.find((f) => f.name === name && !(f.facingBlocks && f.blockIds.length === 0)) ?? frames.find((f) => f.name === name);
}

/** The box a `frameOutsideArea` measures against, on this page. */
function limitBox(doc: Pick<VDTDocument, 'config' | 'trimOffset'>, page: Pick<VDTPage, 'composed' | 'width' | 'height'>, focus: Extract<OverlapFocusOf, { kind: 'outside' }>): Box | undefined {
  const c = page.composed!;
  if (focus.past === 'frame') {
    const host = focus.target !== undefined ? frameNamed(page, focus.target) : undefined;
    return host ? frameBox(host) : undefined;
  }
  if (focus.past === 'group') {
    // The group's frames as laid (a grid's cells are instances of them).
    const templates = (doc.config as unknown as { pageTemplates?: { id?: string; groups?: { name?: string; frames?: string[]; repeat?: { frames?: string[] } }[] }[] }).pageTemplates;
    const group = templates?.find((t) => t.id === c.template)?.groups?.find((g) => g.name === focus.target);
    const names = new Set([...(group?.frames ?? []), ...(group?.repeat?.frames ?? [])]);
    const boxes = c.frames.filter((f) => names.has(f.repeat?.frame ?? f.name) && !(f.facingBlocks && f.blockIds.length === 0)).map(frameBox);
    return unionBoxes(boxes) ?? undefined;
  }
  // The trim and the bleed of a single page (a spread's sheet is cut at the
  // spine: its frames are read on two pages).
  if (c.spread) return undefined;
  const t = doc.trimOffset ?? 0;
  const trim = { x: t, y: t, width: page.width - 2 * t, height: page.height - 2 * t };
  if (focus.past === 'trim') return trim;
  const cut = doc.config.page.cutLines;
  const bleed = cut?.enabled ? dimensionToPx(cut.bleed, doc.config.page.dpi) : 0;
  return { x: trim.x - bleed, y: trim.y - bleed, width: trim.width + 2 * bleed, height: trim.height + 2 * bleed };
}

/** What to draw for `focus` on `page`, or null when its frames are not on
 *  it (the page changed, or the check was fixed). */
export function overlapMarksFor(
  doc: Pick<VDTDocument, 'config' | 'trimOffset'>,
  page: Pick<VDTPage, 'composed' | 'width' | 'height'>,
  focus: OverlapFocusOf,
): OverlapMarks | null {
  if (!page.composed) return null;
  const f = frameNamed(page, focus.frame);
  if (!f) return null;
  const frame = frameBox(f);
  if (focus.kind === 'covered') {
    const over = frameNamed(page, focus.coveredBy);
    if (!over) return null;
    const covering = frameBox(over);
    const meet = intersectBoxes(frame, covering);
    return { frame, covering, hits: meet ? [meet] : [] };
  }
  const limit = limitBox(doc, page, focus);
  if (!limit) return { frame, hits: [] };
  const px = doc.config.page.dpi / 25.4;
  const s = focus.sides;
  const hits: Box[] = [];
  // A band past each side the check names, as deep as its overrun, along
  // the frame's extent on that side.
  if (s.top) hits.push({ x: frame.x, y: limit.y - s.top * px, width: frame.width, height: s.top * px });
  if (s.bottom) hits.push({ x: frame.x, y: limit.y + limit.height, width: frame.width, height: s.bottom * px });
  if (s.left) hits.push({ x: limit.x - s.left * px, y: frame.y, width: s.left * px, height: frame.height });
  if (s.right) hits.push({ x: limit.x + limit.width, y: frame.y, width: s.right * px, height: frame.height });
  return { frame, limit, hits };
}

const RED = '#d0021b';
const BLUE = '#1d6fd6';

function groupOf(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>('g[data-role="overlap"]');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.dataset.role = 'overlap';
    // Over the fit marks, under the selection and the caret.
    const selection = svg.querySelector('g[data-role="selection"]');
    svg.insertBefore(g, selection);
  }
  return g;
}

export function clearOverlapMarks(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('g[data-role="overlap"]');
  if (g) while (g.firstChild) g.removeChild(g.firstChild);
}

function rect(g: SVGGElement, b: Box, attrs: Record<string, string | number>): void {
  const node = document.createElementNS(SVG_NS, 'rect');
  node.setAttribute('x', String(b.x));
  node.setAttribute('y', String(b.y));
  node.setAttribute('width', String(Math.max(1, b.width)));
  node.setAttribute('height', String(Math.max(1, b.height)));
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  g.appendChild(node);
}

/** Draw the selected overlap check on page `pageIndex` (or clear it). */
export function drawOverlapMarks(svg: SVGSVGElement, doc: VDTDocument, pageIndex: number): void {
  clearOverlapMarks(svg);
  const focus = overlapFocusNow();
  const page = doc.pages[pageIndex];
  if (!focus || focus.pageIndex !== pageIndex || !page) return;
  const marks = overlapMarksFor(doc, page, focus);
  if (!marks) return;
  const g = groupOf(svg);
  const unit = page.width / 600;
  g.dataset.overlap = focus.kind;
  if (marks.limit) rect(g, marks.limit, { fill: 'none', stroke: RED, 'stroke-width': unit * 1.4, 'stroke-dasharray': `${unit * 4} ${unit * 3}`, 'data-mark': 'limit' });
  rect(g, marks.frame, { fill: 'none', stroke: focus.kind === 'covered' ? BLUE : RED, 'stroke-width': unit * 2.2, ...(focus.kind === 'covered' ? { 'stroke-dasharray': `${unit * 3} ${unit * 2}` } : {}), 'data-mark': 'frame' });
  if (marks.covering) rect(g, marks.covering, { fill: 'none', stroke: RED, 'stroke-width': unit * 2.2, 'data-mark': 'covering' });
  for (const hit of marks.hits) rect(g, hit, { fill: RED, 'fill-opacity': 0.3, stroke: RED, 'stroke-width': unit, 'data-mark': 'hit' });
}
