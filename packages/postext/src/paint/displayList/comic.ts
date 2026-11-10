// A comic page as display items (#1394), in the order postext-pdf's
// `page/comic.ts` paints it: per panel its background, its picture (the
// part inside the panel's box: page-faithful writers have no polygon
// clip) and its border; the pop-out cut-outs over every panel; then the
// balloons group by group — every outline stroked, every outline filled,
// then the lettering — sound effects last. Sheet coordinates throughout.
import type { VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel } from '../../vdt/pages/comic.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import { comicBalloonGroups, comicBalloonMatrix, comicBorderPathData, comicPanelPathData } from '../../comics/paint.js';
import { parseSvgPathCached } from '../../design/svgPath.js';
import { IDENTITY, placeShape, type Frame } from './frame.js';
import { slotItems } from './design.js';
import type { DisplayItem, DisplayRect } from './types.js';

type PathItem = Extract<DisplayItem, { kind: 'path' }>;
type ImageItem = Extract<DisplayItem, { kind: 'image' }>;

/** The outline of SVG path data as subpaths and their box; none when the
 *  data does not parse. */
function outline(d: string): { subpaths: VDTPathCommand[][]; bbox: DisplayRect } | undefined {
  const parsed = parseSvgPathCached(d);
  if (!parsed.ok || parsed.subpaths.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sp of parsed.subpaths) {
    for (const c of sp) {
      if (c.op === 'Z') continue;
      x0 = Math.min(x0, c.x);
      y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x);
      y1 = Math.max(y1, c.y);
    }
  }
  if (!Number.isFinite(x0)) return undefined;
  return { subpaths: parsed.subpaths, bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}

/** A picture drawn whole at `art.box`, cut to `within` (the panel's box)
 *  as a crop of the stored picture: a mirrored one is cropped on the
 *  side the flip brings into view. */
function artItem(art: VDTComicArt, within: DisplayRect | undefined, alt: string | undefined): ImageItem | undefined {
  const box = art.box;
  if (box.width <= 0 || box.height <= 0) return undefined;
  const x0 = within ? Math.max(box.x, within.x) : box.x;
  const y0 = within ? Math.max(box.y, within.y) : box.y;
  const x1 = within ? Math.min(box.x + box.width, within.x + within.width) : box.x + box.width;
  const y1 = within ? Math.min(box.y + box.height, within.y + within.height) : box.y + box.height;
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return undefined;
  const item: ImageItem = { kind: 'image', rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, fileId: art.fileId, imageKind: art.kind };
  if (art.pdfFileId) item.pdfFileId = art.pdfFileId;
  let cx = (x0 - box.x) / box.width;
  const cw = (x1 - x0) / box.width;
  const cy = (y0 - box.y) / box.height;
  const ch = (y1 - y0) / box.height;
  if (art.mirrored) {
    item.flipH = true;
    cx = 1 - cx - cw;
  }
  if (cx > 1e-6 || cy > 1e-6 || cw < 1 - 1e-6 || ch < 1 - 1e-6) item.crop = { x: cx, y: cy, width: cw, height: ch };
  if (alt) item.alt = alt;
  return item;
}

function panelItems(panel: VDTComicPanel): DisplayItem[] {
  const items: DisplayItem[] = [];
  const shape = outline(comicPanelPathData(panel));
  if (panel.background && shape) items.push({ kind: 'path', ...shape, fill: panel.background });
  if (panel.art) {
    const art = artItem(panel.art, panel.bbox, panel.altText?.trim() || `Panel ${panel.index + 1}`);
    if (art) items.push(art);
  }
  const { border } = panel;
  if (border.style !== 'none' && border.width > 0) {
    const line = outline(comicBorderPathData(panel));
    if (line) items.push({ kind: 'path', ...line, stroke: { color: border.color, widthPx: border.width, join: 'round' } });
  }
  return items;
}

/** A comic's panels and their pop-outs (`renderComicPanelsPdf`). */
export function comicPanelItems(comic: VDTComicPage): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const panel of comic.panels) items.push(...panelItems(panel));
  // The pop-outs over every panel, unclipped.
  for (const panel of comic.panels) {
    if (!panel.pop) continue;
    const pop = artItem(panel.pop, undefined, undefined);
    if (pop) items.push(pop);
  }
  return items;
}

/** The strokes of a balloon outline (`strokeBalloon`): a double outline's
 *  two wide strokes, a whisper's band in the fill colour, then the
 *  outline at twice its width — the fill drawn next covers its inner
 *  half, so overlapping balloons of a group read as one. */
function balloonStrokes(shape: NonNullable<VDTComicBalloon['shape']>, base: Omit<PathItem, 'kind'>, frame: Frame): PathItem[] {
  if (!shape.stroke || shape.strokeWidth <= 0) return [];
  const sw = shape.strokeWidth;
  const out: PathItem[] = [];
  const stroke = (color: string, widthPx: number, dash?: number[]) =>
    out.push(placeShape(frame, { kind: 'path', ...base, stroke: { color, widthPx, join: 'round', ...(dash && dash.length ? { dash } : {}) } }));
  if (shape.double) {
    stroke(shape.stroke, 2 * (2 * sw + shape.double.gap));
    if (shape.fill) stroke(shape.fill, 2 * (sw + shape.double.gap));
  }
  if (shape.dash && shape.dash.length > 0 && shape.fill) stroke(shape.fill, 3 * sw);
  stroke(shape.stroke, 2 * sw, shape.dash?.map((d) => d * 2));
  return out;
}

/** A comic's lettering (`renderComicLetteringPdf`). `key` names the
 *  comic, for the balloons' block keys. */
export function comicLetteringItems(comic: VDTComicPage, key: string): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const group of comicBalloonGroups(comic.balloons)) {
    const shaped = group.flatMap((b) => {
      const o = b.shape ? outline(b.shape.d) : undefined;
      return o ? [{ balloon: b, shape: b.shape!, o, frame: (comicBalloonMatrix(b) as Frame | undefined) ?? IDENTITY }] : [];
    });
    for (const s of shaped) items.push(...balloonStrokes(s.shape, s.o, s.frame));
    for (const s of shaped) if (s.shape.fill) items.push(placeShape(s.frame, { kind: 'path', ...s.o, fill: s.shape.fill }));
    for (const balloon of group) {
      // Lettering turns with a sound effect; its lean has no Word or
      // display-list form (the outline keeps it).
      const frame = (comicBalloonMatrix({ bbox: balloon.bbox, ...(balloon.rotate ? { rotate: balloon.rotate } : {}) }) as Frame | undefined) ?? IDENTITY;
      const halo = balloon.halo && balloon.halo.width > 0 ? { color: balloon.halo.color, widthPx: balloon.halo.width } : undefined;
      items.push(...(slotItems({ bbox: balloon.bbox, blocks: balloon.text }, {
        frame,
        uprightPictures: false,
        role: 'balloon',
        generated: false,
        blockKey: `${key}:${balloon.elementId ?? balloon.id}`,
        blockType: balloon.kind,
      })).map((it) => (halo && it.kind === 'text' ? { ...it, halo } : it)));
    }
  }
  return items;
}
