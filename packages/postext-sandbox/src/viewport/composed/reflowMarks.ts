/**
 * What the layout moved on a composed page, drawn in the canvas overlay
 * while the Reflow panel is open (#868), never on the page itself (so
 * never in a PDF, a print or an export):
 *
 * - the box the template declares for each frame that changed
 *   (`VDTFrame.declaredRect`), dashed;
 * - arrows from the declared box to the box as laid: one from its top for
 *   a move, one at its foot (or its end edge) for a change of size;
 * - a numbered badge on each frame the log names, with its changes in
 *   short («+8.2 mm», «↓ 8.2 mm», «92 %»): the number is the one the
 *   panel lists the frame's sentences under.
 */

import type { VDTDocument, VDTFrame, VDTPage } from 'postext';
import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { markFontPx } from './frameOverlay.js';
import { frameTurnMatrix } from './fitMarks.js';
import { reflowEntries, reflowShort } from './reflowText.js';

type Box = VDTFrame['rect'];
type Point = { x: number; y: number };

export interface ReflowArrow {
  kind: 'move' | 'size';
  from: Point;
  to: Point;
}

export interface ReflowMark {
  number: number;
  frame: VDTFrame;
  /** The box the template declares, when the frame is not in it. */
  declared: Box | null;
  arrows: ReflowArrow[];
  /** The badge's text after the number. */
  short: string;
}

const MIN_ARROW_PX = 2;

/** `p`, a point of `rect` drawn upright, where it is on the sheet once the
 *  box is turned `rotate` degrees about its centre (as the backends paint
 *  a turned frame, and as `frameTurnMatrix` draws its marks). */
export function turnAbout(rect: Box, rotate: number, p: Point): Point {
  if (!rotate) return p;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const a = (rotate * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** The marks of one page, in the panel's order (frames on the facing
 *  page of a spread are marked where they are read). */
export function reflowMarksFor(page: Pick<VDTPage, 'composed'>, locale?: string): ReflowMark[] {
  const c = page.composed;
  if (!c) return [];
  const out: ReflowMark[] = [];
  for (const entry of reflowEntries(page)) {
    const frame = c.frames.find((f) => f.id === entry.frameId);
    if (!frame || (frame.facingBlocks && frame.blockIds.length === 0)) continue;
    const final = frame.rect;
    const declared = frame.declaredRect ?? null;
    const arrows: ReflowArrow[] = [];
    if (declared) {
      // A move: from the declared box's top (a quarter in) to the laid one's.
      // A turned frame: each end on its own box as turned.
      const turn = frame.rotate;
      const from = turnAbout(declared, turn, { x: declared.x + declared.width * 0.25, y: declared.y });
      const to = turnAbout(final, turn, { x: final.x + final.width * 0.25, y: final.y });
      if (Math.hypot(to.x - from.x, to.y - from.y) >= MIN_ARROW_PX) arrows.push({ kind: 'move', from, to });
      // A change of height: at the foot, three quarters in, from where the
      // declared height ends to where the laid one does.
      if (Math.abs(final.height - declared.height) >= MIN_ARROW_PX) {
        const x = final.x + final.width * 0.75;
        arrows.push({ kind: 'size', from: turnAbout(final, turn, { x, y: final.y + declared.height }), to: turnAbout(final, turn, { x, y: final.y + final.height }) });
      }
      // A change of width: at mid height, on the end edge.
      if (Math.abs(final.width - declared.width) >= MIN_ARROW_PX) {
        const y = final.y + final.height * 0.5;
        arrows.push({ kind: 'size', from: turnAbout(final, turn, { x: final.x + declared.width, y }), to: turnAbout(final, turn, { x: final.x + final.width, y }) });
      }
    }
    const short = entry.events.map((e) => reflowShort(e, locale)).filter(Boolean).join(' ');
    out.push({ number: entry.number, frame, declared, arrows, short });
  }
  return out;
}

const INK = '#6741d9';

function groupOf(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>('g[data-role="reflow"]');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.dataset.role = 'reflow';
    // Over the fit and frame marks, under the selection and the caret.
    const selection = svg.querySelector('g[data-role="selection"]');
    svg.insertBefore(g, selection);
  }
  return g;
}

export function clearReflowMarks(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('g[data-role="reflow"]');
  if (g) while (g.firstChild) g.removeChild(g.firstChild);
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function arrow(item: SVGGElement, a: ReflowArrow, unit: number, strong: boolean): void {
  const w = unit * (strong ? 2.6 : 1.8);
  item.appendChild(el('line', { x1: a.from.x, y1: a.from.y, x2: a.to.x, y2: a.to.y, stroke: INK, 'stroke-width': w, 'stroke-linecap': 'round' }));
  const angle = Math.atan2(a.to.y - a.from.y, a.to.x - a.from.x);
  const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
  const head = Math.min(unit * 7, len * 0.6);
  const p = (d: number) => `${a.to.x - head * Math.cos(angle + d)},${a.to.y - head * Math.sin(angle + d)}`;
  item.appendChild(el('polygon', { points: `${a.to.x},${a.to.y} ${p(0.45)} ${p(-0.45)}`, fill: INK }));
  // The start: a small dot on the declared box.
  item.appendChild(el('circle', { cx: a.from.x, cy: a.from.y, r: unit * 2, fill: INK }));
}

/** Draw the reflow marks of `pageIndex` into its overlay (or clear them
 *  when `shown` is false). `focusFrame`: the frame the panel points at. */
export function drawReflowMarks(
  svg: SVGSVGElement,
  doc: VDTDocument,
  pageIndex: number,
  options: { shown: boolean; focusFrame?: string | null; locale?: string },
): void {
  const page = doc.pages[pageIndex];
  if (!options.shown || !page?.composed || page.composed.log.length === 0) {
    clearReflowMarks(svg);
    return;
  }
  const g = groupOf(svg);
  clearReflowMarks(svg);
  const unit = page.width / 600;
  const fs = markFontPx(page);
  // Badges of frames that start at the same spot (a frame of photos set
  // over its box's corner) go one under the other.
  const placed: { x: number; y: number }[] = [];
  for (const mark of reflowMarksFor(page, options.locale)) {
    const strong = options.focusFrame === mark.frame.name;
    const item = document.createElementNS(SVG_NS, 'g');
    item.dataset.frameId = mark.frame.id;
    item.dataset.reflow = String(mark.number);
    // In the overlay first, so its text can be measured.
    g.appendChild(item);
    if (mark.declared) {
      const outline = el('rect', {
        x: mark.declared.x,
        y: mark.declared.y,
        width: Math.max(1, mark.declared.width),
        height: Math.max(1, mark.declared.height),
        fill: strong ? 'rgba(103, 65, 217, 0.08)' : 'none',
        stroke: INK,
        'stroke-width': unit * (strong ? 2 : 1.3),
        'stroke-dasharray': `${unit * 4} ${unit * 3}`,
      });
      outline.dataset.part = 'declared';
      const turn = frameTurnMatrix(mark.declared, mark.frame.rotate);
      if (turn) outline.setAttribute('transform', turn);
      item.appendChild(outline);
    }
    if (strong) {
      const laid = el('rect', { x: mark.frame.rect.x, y: mark.frame.rect.y, width: Math.max(1, mark.frame.rect.width), height: Math.max(1, mark.frame.rect.height), fill: 'none', stroke: INK, 'stroke-width': unit * 2.4 });
      const turn = frameTurnMatrix(mark.frame.rect, mark.frame.rotate);
      if (turn) laid.setAttribute('transform', turn);
      item.appendChild(laid);
    }
    for (const a of mark.arrows) arrow(item, a, unit, strong);
    // The badge sits in the frame's corner, turned with it.
    const badge = document.createElementNS(SVG_NS, 'g');
    const badgeTurn = frameTurnMatrix(mark.frame.rect, mark.frame.rotate);
    if (badgeTurn) badge.setAttribute('transform', badgeTurn);
    item.appendChild(badge);
    // The badge: the number in a disc, the changes beside it.
    const r = fs * 0.8;
    const cx = mark.frame.rect.x + r + unit * 2;
    let cy = mark.frame.rect.y + r + unit * 2;
    while (placed.some((p) => Math.abs(p.x - cx) < fs * 8 && Math.abs(p.y - cy) < fs * 1.8)) cy += fs * 1.9;
    placed.push({ x: cx, y: cy });
    if (mark.short) {
      const t = el('text', { x: cx + r + fs * 0.35, y: cy + fs * 0.35, 'font-size': fs, 'font-family': 'system-ui, sans-serif', 'font-weight': 600, fill: INK });
      t.textContent = mark.short;
      badge.appendChild(t);
      // The pill fits the text as drawn (an estimate where it cannot be
      // measured yet).
      let textW = fs * 0.62 * mark.short.length;
      try {
        const measured = t.getComputedTextLength();
        if (measured > 0) textW = measured;
      } catch {
        // Not laid out: keep the estimate.
      }
      const w = r + fs * 0.35 + textW + fs * 0.5;
      badge.insertBefore(el('rect', { x: cx, y: cy - fs * 0.75, width: w, height: fs * 1.5, rx: fs * 0.3, fill: '#ffffff', stroke: INK, 'stroke-width': unit }), t);
    }
    badge.appendChild(el('circle', { cx, cy, r, fill: INK }));
    const n = el('text', { x: cx, y: cy + fs * 0.36, 'font-size': fs, 'font-family': 'system-ui, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: '#ffffff' });
    n.textContent = String(mark.number);
    badge.appendChild(n);
  }
}
