/**
 * The marks of the labels of a page in Design mode (#866, #931): the box
 * of every drawn label (red when it still overflows its width), the
 * anchor point it can be moved by, and a tag on the label in hand. They are
 * computed once, as plain shapes in sheet px, and painted three ways: in
 * the canvas page's marks layer, in the overlay of an HTML page and into
 * the texture of a Folio page. The label editor (`labelAnchorEditor.ts`)
 * drags them on the first two and, since #970, on the Folio's too.
 */

import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { cornersBounds, isMovable, sheetToPicture, type PageLabel } from './labelAnchorGeometry.js';

export const MARK_COLORS = {
  box: 'rgba(15, 118, 110, 0.75)',
  boxActive: '#0f766e',
  overflow: '#dc2626',
  point: '#0f766e',
  ghost: 'rgba(15, 118, 110, 0.14)',
  tag: 'rgba(17, 24, 39, 0.85)',
};

export type MarkShape =
  | { kind: 'polygon'; points: Array<{ x: number; y: number }>; stroke: string; width: number; dash?: [number, number]; fill?: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; width: number }
  | { kind: 'tag'; text: string; x: number; y: number; size: number; color: string };

/** What a mark shows beyond the label itself. */
export interface MarkState {
  hover?: string | null;
  active?: string | null;
  /** The label being dragged and how far (sheet px); `away`: the drag sets
   *  the label away from its point (`labelAt`, #1064) instead of moving it. */
  drag?: { key: string; dx: number; dy: number; away?: boolean } | null;
}

/** The words a mark's tag uses (the Sandbox labels). */
export interface MarkWords {
  placedByPercent: string;
  overflow: string;
}

/** The label's stable id, else its block and position. */
export const labelKey = (pl: PageLabel): string => pl.label.id ?? `${pl.block.id}:${pl.label.sourceStart}`;

/** Whether the label can be moved on the page: it stands at an anchor, or
 *  at percentages written in the text. */
export const labelMovable = isMovable;

const percent = (v: number) => `${Math.round(v * 1000) / 10}`;

/** The shapes of `labels`' marks; `k` is the sheet px of one CSS px. */
export function labelMarkShapes(labels: readonly PageLabel[], k: number, state: MarkState = {}, words?: MarkWords): MarkShape[] {
  const out: MarkShape[] = [];
  for (const pl of labels) {
    const key = labelKey(pl);
    const dragged = state.drag && state.drag.key === key ? state.drag : null;
    const on = dragged !== null || key === state.hover || key === state.active;
    const color = pl.overflow ? MARK_COLORS.overflow : on ? MARK_COLORS.boxActive : MARK_COLORS.box;
    out.push({
      kind: 'polygon',
      points: pl.corners,
      stroke: color,
      width: (on ? 1.6 : 1) * k,
      ...(on || pl.overflow ? {} : { dash: [3 * k, 2 * k] as [number, number] }),
    });
    if (dragged) {
      out.push({ kind: 'polygon', points: pl.corners.map((c) => ({ x: c.x + dragged.dx, y: c.y + dragged.dy })), stroke: MARK_COLORS.boxActive, width: 1.4 * k, fill: MARK_COLORS.ghost });
    }
    // A label away from its point (#1064): the line to the anchor's point,
    // as its leader runs, and the point itself; an Alt-drag shows the line
    // to the point it leaves.
    const home = pl.anchorPoint ?? (dragged?.away ? pl.point : undefined);
    if (home) {
      const lx = pl.point.x + (dragged?.dx ?? 0);
      const ly = pl.point.y + (dragged?.dy ?? 0);
      out.push({ kind: 'line', x1: lx, y1: ly, x2: home.x, y2: home.y, stroke: '#ffffff', width: 2.4 * k });
      out.push({ kind: 'line', x1: lx, y1: ly, x2: home.x, y2: home.y, stroke: MARK_COLORS.point, width: 1.2 * k });
      out.push({ kind: 'circle', cx: home.x, cy: home.y, r: 2.5 * k, fill: MARK_COLORS.point, stroke: '#ffffff', width: k });
    }
    if (labelMovable(pl)) {
      const px = pl.point.x + (dragged?.dx ?? 0);
      const py = pl.point.y + (dragged?.dy ?? 0);
      const r = (on ? 6 : 4.5) * k;
      out.push({ kind: 'line', x1: px - 2 * r, y1: py, x2: px + 2 * r, y2: py, stroke: '#ffffff', width: 2.4 * k });
      out.push({ kind: 'line', x1: px, y1: py - 2 * r, x2: px, y2: py + 2 * r, stroke: '#ffffff', width: 2.4 * k });
      out.push({ kind: 'line', x1: px - 2 * r, y1: py, x2: px + 2 * r, y2: py, stroke: MARK_COLORS.point, width: k });
      out.push({ kind: 'line', x1: px, y1: py - 2 * r, x2: px, y2: py + 2 * r, stroke: MARK_COLORS.point, width: k });
      out.push({ kind: 'circle', cx: px, cy: py, r, fill: '#ffffff', stroke: pl.overflow ? MARK_COLORS.overflow : MARK_COLORS.point, width: 1.5 * k });
    }
    if (on || pl.overflow) {
      const box = cornersBounds(pl.corners);
      const parts = [pl.anchorId ?? (words?.placedByPercent ?? '%')];
      if (dragged) {
        const p = sheetToPicture(pl, pl.point.x + dragged.dx, pl.point.y + dragged.dy);
        if (p) parts.push(`${percent(p.x)} % · ${percent(p.y)} %`);
      } else {
        if (pl.scale !== undefined) parts.push(`${Math.round(pl.scale * 100)} %`);
        if (pl.overflow) parts.push(words?.overflow ?? 'overflow');
      }
      out.push({ kind: 'tag', text: parts.join(' · '), x: box.x + (dragged?.dx ?? 0), y: box.y + (dragged?.dy ?? 0), size: 10 * k, color });
    }
  }
  return out;
}

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

/** Append `shapes` to `parent` (an SVG element). */
export function paintShapesSvg(parent: SVGElement, shapes: readonly MarkShape[]): void {
  for (const s of shapes) {
    if (s.kind === 'polygon') {
      parent.appendChild(svgEl('polygon', {
        points: s.points.map((p) => `${p.x},${p.y}`).join(' '),
        fill: s.fill ?? 'none',
        stroke: s.stroke,
        'stroke-width': s.width,
        ...(s.dash ? { 'stroke-dasharray': `${s.dash[0]} ${s.dash[1]}` } : {}),
      }));
    } else if (s.kind === 'line') {
      parent.appendChild(svgEl('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: s.stroke, 'stroke-width': s.width }));
    } else if (s.kind === 'circle') {
      parent.appendChild(svgEl('circle', { cx: s.cx, cy: s.cy, r: s.r, fill: s.fill, stroke: s.stroke, 'stroke-width': s.width }));
    } else {
      const width = (s.text.length * 0.6 + 0.8) * s.size;
      parent.appendChild(svgEl('rect', { x: s.x, y: s.y - s.size * 1.25, width, height: s.size * 1.4, rx: s.size * 0.2, fill: MARK_COLORS.tag }));
      const t = svgEl('text', { x: s.x + 0.4 * s.size, y: s.y - s.size * 0.25, fill: s.color === MARK_COLORS.overflow ? '#fecaca' : '#ffffff', 'font-size': s.size, 'font-family': 'system-ui, sans-serif' });
      t.textContent = s.text;
      parent.appendChild(t);
    }
  }
}

/** Paint `shapes` on a 2D context whose units are sheet px. */
export function paintShapesCanvas(ctx: CanvasRenderingContext2D, shapes: readonly MarkShape[]): void {
  for (const s of shapes) {
    ctx.save();
    if (s.kind === 'polygon') {
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.setLineDash(s.dash ?? []);
      ctx.stroke();
    } else if (s.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.stroke();
    } else if (s.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.stroke();
    } else {
      const width = (s.text.length * 0.6 + 0.8) * s.size;
      ctx.fillStyle = MARK_COLORS.tag;
      ctx.fillRect(s.x, s.y - s.size * 1.25, width, s.size * 1.4);
      ctx.fillStyle = s.color === MARK_COLORS.overflow ? '#fecaca' : '#ffffff';
      ctx.font = `${s.size}px system-ui, sans-serif`;
      ctx.fillText(s.text, s.x + 0.4 * s.size, s.y - s.size * 0.25);
    }
    ctx.restore();
  }
}
