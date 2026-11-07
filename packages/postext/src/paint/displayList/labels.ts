// A figure's labels as display items (#1444), as postext-pdf's
// `paintFigureLabels` paints them over the picture: the leaders first
// (with their dots and arrowheads), then per label its plate and its
// lines, each in the label's own turned frame.
import type { ResolvedResourceBlock } from '../../vdt/resources.js';
import type { VDTPathCommand, VDTPathMarker } from '../../vdt/design.js';
import { figureLabelLeaderPaths, figureLabelMatrix, labelPlateBox } from '../../composed/labels.js';
import { compose, placeShape, placeText, type Frame } from './frame.js';
import { placeResourceLine, type LineStyle } from './lines.js';
import type { BlockContext } from './blocks.js';
import type { DisplayItem, DisplayLine } from './types.js';

type PathItem = Extract<DisplayItem, { kind: 'path' }>;

/** Bézier handle length of a quarter circle, radius 1. */
const KAPPA = 0.5523;

function circle(cx: number, cy: number, r: number): VDTPathCommand[] {
  const k = KAPPA * r;
  return [
    { op: 'M', x: cx + r, y: cy },
    { op: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { op: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { op: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { op: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { op: 'Z' },
  ];
}

/** A leader's end mark as a path: a dot or an arrowhead filled, a ring
 *  or a bar stroked. */
export function markerPath(m: VDTPathMarker): PathItem {
  const s = m.sizePx;
  const bbox = { x: m.x - s, y: m.y - s, width: 2 * s, height: 2 * s };
  const stroke = { color: m.color, widthPx: m.widthPx ?? Math.max(1, s / 6) };
  const cos = Math.cos(m.angle);
  const sin = Math.sin(m.angle);
  switch (m.kind) {
    case 'dot':
      return { kind: 'path', bbox, subpaths: [circle(m.x, m.y, s / 2)], fill: m.color };
    case 'ring':
      return { kind: 'path', bbox, subpaths: [circle(m.x, m.y, s / 2)], stroke };
    case 'bar':
      return { kind: 'path', bbox, subpaths: [[{ op: 'M', x: m.x + (sin * s) / 2, y: m.y - (cos * s) / 2 }, { op: 'L', x: m.x - (sin * s) / 2, y: m.y + (cos * s) / 2 }]], stroke };
    case 'arrow': {
      // The tip on the point, the base a size back along the line.
      const bx = m.x - cos * s;
      const by = m.y - sin * s;
      return {
        kind: 'path', bbox, fill: m.color,
        subpaths: [[{ op: 'M', x: m.x, y: m.y }, { op: 'L', x: bx - (sin * s) / 2, y: by + (cos * s) / 2 }, { op: 'L', x: bx + (sin * s) / 2, y: by - (cos * s) / 2 }, { op: 'Z' }]],
      };
    }
  }
}

/** The items of a figure's drawn labels, its body's top-left corner at
 *  (`bx`, `by`) in `frame`. A label's words are the figure's own text in
 *  the Markdown but are drawn here as furniture (generated): only the
 *  semantic export carries them back. Vertical labels are left out. */
export function figureLabelItems(rb: ResolvedResourceBlock, bx: number, by: number, frame: Frame, ctx: BlockContext): DisplayItem[] {
  const drawn = (rb.labels ?? []).filter((l) => l.layout && !l.layout.vertical);
  if (drawn.length === 0) return [];
  const items: DisplayItem[] = [];
  for (const path of figureLabelLeaderPaths(rb, bx, by)) {
    const item: PathItem = { kind: 'path', bbox: { ...path.bbox }, subpaths: path.subpaths };
    if (path.fill) item.fill = path.fill;
    if (path.stroke) item.stroke = path.stroke;
    items.push(placeShape(frame, item));
    for (const mark of path.markers ?? []) items.push(placeShape(frame, markerPath(mark)));
  }
  const key = `r${rb.resource.id}`;
  for (const label of drawn) {
    const layout = label.layout!;
    const m = compose(frame, figureLabelMatrix(layout, bx, by));
    const plate = layout.background;
    if (plate) {
      const box = labelPlateBox(plate);
      items.push(placeShape(m, {
        kind: 'rect', rect: { ...plate.rect },
        ...(plate.color ? { fill: plate.color } : {}),
        ...(plate.border ? { stroke: plate.border.color, strokeWidthPx: plate.border.widthPx } : {}),
        ...(plate.radiusPx ? { radius: plate.radiusPx } : {}),
        box,
      }));
    }
    const style: LineStyle = { fontString: layout.fontString, boldFontString: layout.boldFontString, italicFontString: layout.italicFontString, boldItalicFontString: layout.boldItalicFontString, color: layout.color };
    const lines: DisplayLine[] = layout.lines.map((l) => placeResourceLine(l, style, false, ctx.options).line);
    if (lines.length === 0) continue;
    for (const line of lines) line.map = new Array<number>(line.text.length).fill(-1);
    const text: Extract<DisplayItem, { kind: 'text' }> = {
      kind: 'text', role: 'label', blockType: 'resource',
      bbox: { x: layout.box.x, y: layout.box.y, width: layout.box.width, height: layout.box.height },
      lines,
      source: { blockKey: key, map: lines.flatMap((l) => l.map), generated: true },
    };
    items.push(placeText(m, text));
  }
  return items;
}
