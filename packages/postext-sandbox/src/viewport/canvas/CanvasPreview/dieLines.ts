// The die lines over the Canvas pages (#1570): each page's die-cut holes
// and its leaf's outline (`VDTPage.dieCut`, page px, this side of the leaf
// already mirrored) stroked in the overlay, the way a proof shows the die
// plate. Drawn in the overlay, not the bitmap: the switch costs no repaint.

import type { VDTPage, VDTPathCommand } from 'postext';
import { SVG_NS } from './dom.js';

/** The magenta proofs show a die line in. */
const DIE_COLOR = '#e6007e';
const ROLE = 'dieLines';

/** SVG path data of closed outlines in page px. */
export function dieCutPathData(subpaths: readonly (readonly VDTPathCommand[])[]): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  const parts: string[] = [];
  for (const cmds of subpaths) {
    for (const c of cmds) {
      switch (c.op) {
        case 'M':
        case 'L':
          parts.push(`${c.op}${r(c.x)} ${r(c.y)}`);
          break;
        case 'C':
          parts.push(`C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`);
          break;
        case 'Q':
          parts.push(`Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`);
          break;
        case 'Z':
          parts.push('Z');
          break;
      }
    }
  }
  return parts.join(' ');
}

/** Draw (or clear) the die lines of `page` in its overlay `svg`. */
export function syncDieLines(svg: SVGSVGElement, page: VDTPage | undefined, on: boolean): void {
  let group = svg.querySelector<SVGGElement>(`g[data-role="${ROLE}"]`);
  const cut = on ? page?.dieCut : undefined;
  if (!cut || (cut.holes.length === 0 && !cut.outline)) {
    group?.remove();
    return;
  }
  if (!group) {
    group = document.createElementNS(SVG_NS, 'g');
    group.dataset.role = ROLE;
    svg.appendChild(group);
  }
  while (group.firstChild) group.removeChild(group.firstChild);
  const shapes = [...cut.holes.map((h) => [h]), ...(cut.outline ? [cut.outline] : [])];
  for (const subpaths of shapes) {
    const d = dieCutPathData(subpaths);
    if (!d) continue;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', DIE_COLOR);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-dasharray', '6 3');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(path);
  }
}
