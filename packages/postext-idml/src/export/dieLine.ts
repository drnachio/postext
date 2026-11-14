// The die line (#1576): the holes and the shaped edges a die cuts, on a
// layer of their own ("Die line", locked), each path stroked with the die
// line's spot swatch (`print.dieLine.ink`, default `Die`) and set to
// overprint, as postext-pdf strokes them on the die plate. A hole of a
// rectangle or a rounded rectangle is an InDesign rectangle (its corners
// rounded by corner options), a circle or an ellipse an oval, anything
// else a polygon; rounded page corners are a rectangle the size of the
// trim with the corners that are cut rounded. Each path carries the die
// it cuts in its script label (`postext:die`), so the import gives the
// shape back by its id, with its path data and its text wrap.

import { dimensionToPx, leafSide, pathBounds, type ResolvedDieShape, type VDTDieCut, type VDTDocument, type VDTPage, type VDTPathCommand } from 'postext';
import { DIE_LABEL } from '../model/specialInks.js';
import { inkSwatch } from './colours.js';
import { boxGeometry, pathGeometry } from './geometry.js';
import { attr } from './parts.js';
import { subpathPoints } from './shapes.js';
import type { Writer } from './writer.js';

/** The `Self` of the die line's layer. */
export const DIE_LAYER_ID = 'udie';

/** Text keeps 3 mm clear of a hole unless the shape says otherwise. */
const DEFAULT_WRAP_MM = 3;

const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const;
type Corner = (typeof CORNERS)[number];

/** The die line's layer in `designmap.xml`: locked, so the paths are not
 *  moved by accident, above the pages' own, and printable unless
 *  `print.dieLine.output` is `'none'`. Text does not wrap round it. */
export const dieLayerXml = (name: string, printable: boolean): string =>
  `<Layer${attr('Self', DIE_LAYER_ID)}${attr('Name', name)} Visible="true" Locked="true" IgnoreWrap="true" ShowGuides="true" LockGuides="false" UI="true" Expendable="true"${attr('Printable', printable)}>` +
  '<Properties><LayerColor type="enumeration">Magenta</LayerColor></Properties></Layer>';

/** The script label of a die path, in its `<Properties>`. */
const labelXml = (value: object): string => `<Label><KeyValuePair${attr('Key', DIE_LABEL)}${attr('Value', JSON.stringify(value))}/></Label>`;

/** A shape's wrap, when it is not the default (3 mm round the hole). */
function wrapOf(shape: ResolvedDieShape): ResolvedDieShape['wrap'] | undefined {
  if (shape.wrap === false) return false;
  const g = shape.wrap.gap;
  return g.unit === 'mm' && Math.abs(g.value - DEFAULT_WRAP_MM) < 1e-9 ? undefined : shape.wrap;
}

/** What the label of a hole of `shape` says: everything but its place. */
function shapeLabel(id: string, shape: ResolvedDieShape | undefined): object {
  if (!shape) return { id };
  const wrap = wrapOf(shape);
  return {
    id,
    ...(shape.name ? { name: shape.name } : {}),
    shape: shape.shape,
    ...(shape.shape === 'path' && shape.d ? { d: shape.d, ...(shape.viewBox[0] !== 1 || shape.viewBox[1] !== 1 ? { viewBox: shape.viewBox } : {}) } : {}),
    ...(wrap !== undefined ? { wrap } : {}),
  };
}

/** The attributes every die path shares. */
function head(w: Writer, tag: string, transform: string, name: string): string {
  const ink = inkSwatch(w, w.die!);
  return (
    `<${tag}${attr('Self', w.next())} ContentType="Unassigned"${attr('ItemLayer', DIE_LAYER_ID)}${attr('ItemTransform', transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    ` FillColor="Swatch/None"${attr('StrokeColor', ink.self)}${attr('StrokeWeight', w.die!.widthPt)} StrokeAlignment="CenterAlignment" OverprintStroke="true"${attr('Name', name)}`
  );
}

/** A box (sheet px) as a rectangle of the die line, the corners `radii`
 *  (pt) rounds. */
function rectangleXml(w: Writer, box: { x: number; y: number; width: number; height: number }, radii: Partial<Record<Corner, number>>, name: string, label: object): string {
  const g = boxGeometry(w, box);
  const corners = CORNERS.map((c) => (radii[c] ? `${attr(`${c}CornerOption`, 'RoundedCorner')}${attr(`${c}CornerRadius`, radii[c])}` : '')).join('');
  return `${head(w, 'Rectangle', g.transform, name)}${corners}>${g.geometry.replace('<Properties>', `<Properties>${labelXml(label)}`)}</Rectangle>`;
}

/** Path commands as an oval or a polygon of the die line, one path per
 *  subpath. */
function pathXml(w: Writer, tag: 'Oval' | 'Polygon', path: readonly VDTPathCommand[], name: string, label: object): string {
  const subpaths: VDTPathCommand[][] = [];
  for (const c of path) {
    if (c.op === 'M' || !subpaths.length) subpaths.push([]);
    subpaths[subpaths.length - 1]!.push(c);
  }
  const paths = subpaths.filter((s) => s.length > 1).map((s) => subpathPoints(w, s));
  if (!paths.length) return '';
  return `${head(w, tag, '1 0 0 1 0 0', name)}>${pathGeometry(paths).replace('<Properties>', `<Properties>${labelXml(label)}`)}</${tag}>`;
}

/** One hole of a page's die-cut. */
function holeXml(w: Writer, doc: VDTDocument, path: VDTPathCommand[], id: string): string {
  const shape = doc.config.dieCuts?.shapes.find((s) => s.id === id);
  const label = shapeLabel(id, shape);
  const name = `Die: ${shape?.name ?? id}`;
  const box = pathBounds(path);
  if (!box) return '';
  if (shape?.shape === 'rect') return rectangleXml(w, box, {}, name, label);
  if (shape?.shape === 'roundRect') {
    const r = (dimensionToPx(shape.radius, doc.config.page.dpi) * 72) / doc.config.page.dpi;
    return rectangleXml(w, box, { TopLeft: r, TopRight: r, BottomRight: r, BottomLeft: r }, name, label);
  }
  return pathXml(w, shape?.shape === 'circle' || shape?.shape === 'ellipse' ? 'Oval' : 'Polygon', path, name, label);
}

/** The leaf's outline on a page: the trim with the corners
 *  `dieCuts.corners` rounds, or the book's shape (`dieCuts.outline`). */
function outlineXml(w: Writer, doc: VDTDocument, page: VDTPage, index: number, outline: VDTPathCommand[][]): string {
  const cuts = doc.config.dieCuts;
  if (!cuts?.outline && cuts?.corners) {
    const t = doc.trimOffset;
    const trim = { x: t, y: t, width: page.width - 2 * t, height: page.height - 2 * t };
    const r = (dimensionToPx(cuts.corners.radius, doc.config.page.dpi) * 72) / doc.config.page.dpi;
    // The fore edge: right on a recto of a book bound on the left.
    const foreRight = (leafSide(doc, index) === 'recto') === (doc.binding !== 'right');
    const radii: Partial<Record<Corner, number>> =
      cuts.corners.edges === 'all' ? { TopLeft: r, TopRight: r, BottomRight: r, BottomLeft: r } : foreRight ? { TopRight: r, BottomRight: r } : { TopLeft: r, BottomLeft: r };
    return rectangleXml(w, trim, radii, 'Die: corners', { id: '#corners' });
  }
  const label = cuts?.outline ? { id: '#outline', d: cuts.outline.d, viewBox: cuts.outline.viewBox } : { id: '#outline' };
  return outline.map((p) => pathXml(w, 'Polygon', p, 'Die: outline', label)).join('');
}

/** The die line of page `index` of `doc`, written in the frame of the page
 *  being written; empty for a page no die cuts. */
export function dieLineXml(w: Writer, doc: VDTDocument, index: number): string {
  const page = doc.pages[index];
  const cut: VDTDieCut | undefined = page?.dieCut;
  if (!page || !cut || !w.die) return '';
  const holes = cut.holes.map((path, i) => holeXml(w, doc, path, cut.sources[i] ?? `die-${i + 1}`));
  return holes.join('') + (cut.outline?.length ? outlineXml(w, doc, page, index, cut.outline) : '');
}
