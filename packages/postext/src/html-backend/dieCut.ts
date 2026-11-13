// Die-cuts in the HTML viewer (#1567): a page's holes and its leaf's
// outline as the page's `clip-path`, merged with the bleed clip. What is
// behind the page shows through a hole: on the print leaf (composed pages)
// that is the viewer's background, as on the screen relayout, whose pages
// are not the print pages.

import type { VDTPage, VDTPathCommand } from '../vdt.js';

const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
};

/** `paths` as SVG path data in page px. */
export function svgPathData(paths: readonly (readonly VDTPathCommand[])[]): string {
  const out: string[] = [];
  for (const path of paths) {
    for (const c of path) {
      switch (c.op) {
        case 'M':
        case 'L':
          out.push(`${c.op}${n(c.x)} ${n(c.y)}`);
          break;
        case 'C':
          out.push(`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`);
          break;
        case 'Q':
          out.push(`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`);
          break;
        case 'Z':
          out.push('Z');
          break;
      }
    }
  }
  return out.join('');
}

/**
 * The `clip-path` declaration of a page with a die-cut: what is kept is the
 * leaf's outline (else the bleed box, `bleedInset` inside the sheet, or the
 * whole sheet), less every hole, as one even-odd path. `undefined` for a
 * page nothing cuts. The path data holds only numbers and command letters.
 */
export function dieCutClipDecl(page: Pick<VDTPage, 'dieCut' | 'width' | 'height'>, bleedInset = 0): string | undefined {
  const cut = page.dieCut;
  if (!cut || (cut.holes.length === 0 && !cut.outline)) return undefined;
  const b = Math.max(0, bleedInset);
  const keep: VDTPathCommand[][] = cut.outline ?? [[
    { op: 'M', x: b, y: b }, { op: 'L', x: page.width - b, y: b }, { op: 'L', x: page.width - b, y: page.height - b },
    { op: 'L', x: b, y: page.height - b }, { op: 'Z' },
  ]];
  return `clip-path:path(evenodd,'${svgPathData([...keep, ...cut.holes])}');`;
}
