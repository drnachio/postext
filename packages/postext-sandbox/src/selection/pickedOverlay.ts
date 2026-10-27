/**
 * The mark of the element picked on a page (#865), drawn in the page's
 * overlay (never on the page itself): a tinted box with an outline round
 * the paragraph, the box, the frame, the design element… picked. A glyph
 * picked shows as the editor's caret instead.
 */

import { resolvePageTemplate, type PageTemplateSource, type VDTDocument } from 'postext';
import { SVG_NS } from '../viewport/canvas/CanvasPreview/dom.js';
import { idName, selectedElement, type PageSelection } from './pageSelection.js';
import { frameDragNow, type FrameDrag } from './frameDrag.js';

export interface PickedMark {
  rect: { x: number; y: number; width: number; height: number };
  /** The SVG transform that sets the box on the sheet: a turned frame's
   *  turn, a vertical page's flow frame; always a `matrix()`. */
  transform: string | null;
}

/** The mark of `sel` on page `pageIndex`, null when it has none there. */
export function pickedMarkFor(doc: VDTDocument, sel: PageSelection | null, pageIndex: number, drag: FrameDrag | null = null): PickedMark | null {
  if (!sel || sel.pageIndex !== pageIndex) return null;
  const el = selectedElement(sel);
  const page = doc.pages[pageIndex];
  if (!page || el.level === 'text') return null;
  let rect = el.rect;
  // A frame the template editor is dragging: where the pointer has it.
  if (el.level === 'frame' && drag && drag.pageIndex === pageIndex && el.id.endsWith(`:${drag.frame}`)) rect = drag.rect;
  if (!rect && el.level === 'template') rect = { x: 0, y: 0, width: page.width, height: page.height };
  if (!rect && el.level === 'group' && page.composed) {
    // A group's box: the union of its frames on the page.
    const name = idName(el.id);
    const template = resolvePageTemplate(doc.config as unknown as PageTemplateSource, page.composed.template, page.composed.modules ? { modules: page.composed.modules } : {});
    const members = new Set(template?.groups.find((g) => g.name === name)?.frames ?? []);
    const own = page.composed.frames.filter((f) => members.has(f.name));
    const all = own.length > 0 ? own : page.composed.frames;
    if (all.length > 0) {
      const x0 = Math.min(...all.map((f) => f.rect.x));
      const y0 = Math.min(...all.map((f) => f.rect.y));
      const x1 = Math.max(...all.map((f) => f.rect.x + f.rect.width));
      const y1 = Math.max(...all.map((f) => f.rect.y + f.rect.height));
      rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
  }
  if (!rect) return null;
  type M = [number, number, number, number, number, number];
  let turn: M | null = null;
  if (el.rotate) {
    // Turned about its frame's centre.
    const frame = el.level === 'frame' ? el : sel.chain.find((e) => e.level === 'frame');
    const r = frame?.rect ?? rect;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const a = (el.rotate * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    turn = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
  }
  // A box in the flow frame of a vertical or right-to-left page: the flow
  // text, and a composed page's frames and their contents (#929); a group
  // is the union of its frames there.
  const inFlow = !!page.flow && (el.flow === true || (el.level === 'group' && !!page.composed));
  let flowM: M | null = null;
  if (inFlow && page.flow) {
    const flow = page.flow;
    flowM = flow.writingMode === 'vertical-rl'
      ? [0, 1, -1, 0, flow.rotation.originX, flow.rotation.originY]
      : [-1, 0, 0, 1, flow.mirror.originX, 0];
  }
  // The flow frame's matrix after the frame's turn, as the backends paint.
  const m: M | null = flowM && turn
    ? [
        flowM[0] * turn[0] + flowM[2] * turn[1],
        flowM[1] * turn[0] + flowM[3] * turn[1],
        flowM[0] * turn[2] + flowM[2] * turn[3],
        flowM[1] * turn[2] + flowM[3] * turn[3],
        flowM[0] * turn[4] + flowM[2] * turn[5] + flowM[4],
        flowM[1] * turn[4] + flowM[3] * turn[5] + flowM[5],
      ]
    : flowM ?? turn;
  // As `matrix()`, which the Folio's marks read too.
  const transform = m ? `matrix(${m.join(' ')})` : null;
  return { rect: { ...rect }, transform };
}

const FILL = 'rgba(217, 72, 15, 0.08)';
const STROKE = '#d9480f';

function groupOf(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>('g[data-role="picked"]');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.dataset.role = 'picked';
    // Under the caret, over the frame marks.
    svg.insertBefore(g, svg.querySelector('g[data-role="cursor"]'));
  }
  return g;
}

/** Draw (or take off) the picked element's mark in a page overlay. */
export function drawPickedMark(svg: SVGSVGElement, doc: VDTDocument, pageIndex: number, sel: PageSelection | null): void {
  const mark = pickedMarkFor(doc, sel, pageIndex, frameDragNow());
  const existing = svg.querySelector<SVGGElement>('g[data-role="picked"]');
  if (!mark) {
    if (existing) while (existing.firstChild) existing.removeChild(existing.firstChild);
    return;
  }
  const g = groupOf(svg);
  while (g.firstChild) g.removeChild(g.firstChild);
  const page = doc.pages[pageIndex]!;
  const unit = page.width / 600;
  const box = document.createElementNS(SVG_NS, 'rect');
  const pad = unit * 1.5;
  box.setAttribute('x', String(mark.rect.x - pad));
  box.setAttribute('y', String(mark.rect.y - pad));
  box.setAttribute('width', String(Math.max(1, mark.rect.width + 2 * pad)));
  box.setAttribute('height', String(Math.max(1, mark.rect.height + 2 * pad)));
  box.setAttribute('fill', FILL);
  box.setAttribute('stroke', STROKE);
  box.setAttribute('stroke-width', String(unit * 1.6));
  if (mark.transform) box.setAttribute('transform', mark.transform);
  box.dataset.picked = selectedElement(sel!).id;
  g.appendChild(box);
}
