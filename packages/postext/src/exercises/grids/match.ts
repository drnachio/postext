// Two columns with dots to join.
import type { DesignElement } from '../../types.js';
import { textElement, pathElement, drawnBox } from '../designs.js';
import { dimPt } from '../expand.js';
import type { GridBoxInput, GridBox } from '../grids.js';
import { r } from './common.js';

/** A circle path (two arcs) of radius `rad` at (x, y). */
const circle = (x: number, y: number, rad: number): string => `M${r(x - rad)} ${r(y)}A${r(rad)} ${r(rad)} 0 1 0 ${r(x + rad)} ${r(y)}A${r(rad)} ${r(rad)} 0 1 0 ${r(x - rad)} ${r(y)}Z`;

// --- Match ---------------------------------------------------------------------

export function matchBox(input: GridBoxInput): GridBox {
  const { style } = input;
  const left = input.left ?? [];
  const right = input.right ?? [];
  const size = input.bodySizePt;
  const w = input.measurePt;
  const gap = Math.min(w * 0.3, dimPt(style.match.gap, size));
  const colW = (w - gap) / 2;
  const dot = dimPt(style.match.dotSize, size) / 2;
  const rows = Math.max(left.length, right.length);
  // Lines a text takes in its column, estimated from its length.
  const perLine = Math.max(8, Math.floor(colW / (size * 0.5)));
  const linesOf = (t: string | undefined): number => Math.max(1, Math.ceil((t?.length ?? 0) / perLine));
  const rowLines = Array.from({ length: rows }, (_, i) => Math.min(3, Math.max(linesOf(left[i]), linesOf(right[i]))));
  const pad = size * 0.45;
  const rowH = rowLines.map((n) => n * input.lineHeightPt + pad);
  const tops: number[] = [];
  let y = 0;
  for (const h of rowH) { tops.push(y); y += h; }
  const height = y;
  const els: DesignElement[] = [];
  const lx = colW - dot * 1.5;
  const rx = colW + gap + dot * 1.5;
  let dots = '';
  for (let i = 0; i < rows; i++) {
    const cy = tops[i]! + rowH[i]! / 2;
    if (left[i] !== undefined) {
      els.push(textElement(`l${i}`, left[i]!, 0, tops[i]!, colW - dot * 4, rowH[i]!, size, { align: 'end', overflow: 'wrap', lineHeight: { value: input.lineHeightPt, unit: 'pt' }, ...(input.font ? { fontFamily: input.font } : {}) }));
      dots += circle(lx, cy, dot);
    }
    if (right[i] !== undefined) {
      const label = input.labels?.[i] && style.match.look === 'letters' ? `${input.labels[i]} ` : '';
      els.push(textElement(`r${i}`, label + right[i]!, colW + gap + dot * 4, tops[i]!, colW - dot * 4, rowH[i]!, size, { align: 'start', overflow: 'wrap', lineHeight: { value: input.lineHeightPt, unit: 'pt' }, ...(input.font ? { fontFamily: input.font } : {}) }));
      dots += circle(rx, tops[i]! + rowH[i]! / 2, dot);
    }
  }
  els.push(pathElement('dots', dots, w, height, style.match.color, 0.1, { fill: style.match.color }));
  if (input.links) {
    let d = '';
    input.links.forEach((pos, i) => {
      d += `M${r(lx)} ${r(tops[i]! + rowH[i]! / 2)}L${r(rx)} ${r(tops[pos]! + rowH[pos]! / 2)}`;
    });
    els.push(pathElement('links', d, w, height, style.answers.color, 1.1));
  }
  const box = drawnBox(input.id, els, height) as GridBox;
  box.info = { kind: 'match', rows, cols: 2, cellPt: 0, xPt: lx, yPt: 0, rowsPt: tops.map((t, i) => t + rowH[i]! / 2), dotsPt: [lx, rx], ...(input.rtl ? { rtl: true as const } : {}) };
  return box;
}
