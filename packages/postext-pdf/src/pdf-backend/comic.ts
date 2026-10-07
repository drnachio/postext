/**
 * PDF painting of a comic page (`VDTPage.comic`, #564), in the order the
 * canvas paints it (`canvas-backend/comic.ts`, SPEC D5):
 *
 *   1. per panel, in reading order: its background, then its picture
 *      clipped to its outline (the whole picture drawn at `art.box`,
 *      flipped inside it when mirrored), then its border (solid, rough or
 *      none), then its pop-out cut-out over the border, unclipped;
 *   2. the balloons, group by group: every outline of the group stroked
 *      (at twice the stroke width, so that the fill drawn next covers the
 *      inner half and overlapping bodies and tails merge into one line;
 *      a double outline adds two wider strokes under it), then every
 *      outline filled, then the lettering (each text's halo first, then
 *      its glyphs); sound effects last.
 *
 * Everything is in sheet coordinates: call it outside any flow frame.
 *
 * An accessible render tags the page as a `Div` holding, in reading order,
 * a `Figure` per panel with a picture (its alternative text and bounding
 * box) followed by a `P` per balloon of that panel; a sound effect is a
 * `Span` (inside a `P`) whose `/ActualText` is its text. Backgrounds,
 * borders and balloon outlines are artifacts.
 */

import {
  LineJoinStyle,
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingColor,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type Color,
  type PDFOperator,
} from 'pdf-lib';
import { comicBalloonText as sharedBalloonText, comicPanelContinues, comicRoughBorder } from 'postext';
import type { VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTDesignTextBlock, VDTPoint } from 'postext';
import type { FontCache } from '../fontCache';
import { renderTextBlock, type SlotMark } from './headerFooter';
import {
  type PageCtx,
  type PdfMatrix,
  alphaOf,
  alphaStateOp,
  colorFromHex,
  fillRectPx,
  opt,
  popFrame,
  popTransform,
  pushFrame,
  pushTransform,
} from './primitives';
import { drawEmbeddedResource, figureLayout, type ResourceImageMap } from './renderResourceBlock';
import type { StructureFlow } from './structureFlow';
import { parsePathData, type PathSeg } from './svgVector';
import { tagArtifact, tagContent, type StructElem } from './tagging';

/** Bézier handle length of a quarter circle, as a fraction of its radius. */
const KAPPA = 0.5522847498;

/** The light fill a panel shows where its picture has no bytes (the
 *  canvas's placeholder). */
const PLACEHOLDER = 'rgba(160, 160, 160, 0.15)';

// ------------------------------------------------------------ paths

/** A closed polygon as path segments (px). */
function polygonSegs(points: readonly VDTPoint[]): PathSeg[] {
  if (points.length === 0) return [];
  const segs: PathSeg[] = [['M', points[0]!.x, points[0]!.y]];
  for (let i = 1; i < points.length; i++) segs.push(['L', points[i]!.x, points[i]!.y]);
  segs.push(['Z']);
  return segs;
}

/** A rounded rectangle as path segments (px), clockwise on the sheet. */
function roundedRectSegs(x: number, y: number, w: number, h: number, radius: number): PathSeg[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const k = r * KAPPA;
  return [
    ['M', x + r, y],
    ['L', x + w - r, y],
    ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ['L', x + w, y + h - r],
    ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ['L', x + r, y + h],
    ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ['L', x, y + r],
    ['C', x, y + r - k, x + r - k, y, x + r, y],
    ['Z'],
  ];
}

/** A panel's outline: its polygon, or a rounded rectangle when it has a
 *  radius (as `comicPanelPath` traces it on the canvas). */
export function comicPanelSegs(panel: Pick<VDTComicPanel, 'polygon' | 'bbox' | 'radius'>): PathSeg[] {
  if (panel.radius > 0) {
    const { x, y, width, height } = panel.bbox;
    return roundedRectSegs(x, y, width, height, panel.radius);
  }
  return polygonSegs(panel.polygon);
}

/** Path operators of segments in px (top-down), in the points of the
 *  current frame. */
function segOps(ctx: PageCtx, segs: readonly PathSeg[]): PDFOperator[] {
  const { scale, pageHeightPt } = ctx;
  const X = (px: number) => px * scale;
  const Y = (py: number) => pageHeightPt - py * scale;
  const ops: PDFOperator[] = [];
  for (const s of segs) {
    if (s[0] === 'M') ops.push(moveTo(X(s[1]), Y(s[2])));
    else if (s[0] === 'L') ops.push(lineTo(X(s[1]), Y(s[2])));
    else if (s[0] === 'C') ops.push(appendBezierCurve(X(s[1]), Y(s[2]), X(s[3]), Y(s[4]), X(s[5]), Y(s[6])));
    else ops.push(closePath());
  }
  return ops;
}

/** Push a graphics state clipped to `segs` (nonzero rule); undo with
 *  `popTransform`. */
function pushClipSegs(ctx: PageCtx, segs: readonly PathSeg[]): void {
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), ...segOps(ctx, segs), clip(), endPath());
}

function fillSegs(ctx: PageCtx, segs: readonly PathSeg[], color: Color): void {
  if (segs.length === 0) return;
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, alphaOf(color))),
    setFillingColor(color),
    ...segOps(ctx, segs),
    fill(),
    popGraphicsState(),
  );
}

/** Stroke `segs` `widthPx` wide, centred on them, with round joins (and a
 *  dash pattern in px when given). */
function strokeSegs(ctx: PageCtx, segs: readonly PathSeg[], color: Color, widthPx: number, dashPx?: readonly number[]): void {
  if (segs.length === 0 || widthPx <= 0) return;
  const s = ctx.scale;
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
    setStrokingColor(color),
    setLineWidth(Math.max(0.01, widthPx * s)),
    setLineJoin(LineJoinStyle.Round),
    ...(dashPx && dashPx.length > 0 ? [setDashPattern(dashPx.map((d) => d * s), 0)] : []),
    ...segOps(ctx, segs),
    stroke(),
    popGraphicsState(),
  );
}

/** The segments of a balloon outline's path data; none when it does not
 *  parse (the lettering is still painted). */
function balloonSegs(d: string): PathSeg[] {
  try {
    return parsePathData(d);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------ frames

/** The matrix of a turn of `deg` degrees clockwise on the sheet about the
 *  point (cx, cy) px, in the backend's points (y up). */
export function rotationMatrix(deg: number, cxPx: number, cyPx: number, scale: number, pageHeightPt: number): PdfMatrix {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = cxPx * scale;
  const cy = pageHeightPt - cyPx * scale;
  // PDF user space has y growing upwards: a clockwise turn on the sheet
  // is a turn by −deg there.
  return [cos, -sin, sin, cos, cx - cos * cx - sin * cy, cy + sin * cx - cos * cy];
}

/** Run `paint` turned by the balloon's rotation about the centre of its
 *  box (sound effects); straight through when it has none. */
function withRotation(ctx: PageCtx, balloon: VDTComicBalloon, paint: () => void): void {
  const deg = balloon.rotate ?? 0;
  if (!deg) {
    paint();
    return;
  }
  const { x, y, width, height } = balloon.bbox;
  pushFrame(ctx, rotationMatrix(deg, x + width / 2, y + height / 2, ctx.scale, ctx.pageHeightPt));
  try {
    paint();
  } finally {
    popFrame(ctx);
  }
}

// ------------------------------------------------------------ structure

/** A sound effect: a balloon of kind `sfx` (the script line's `sfx`
 *  key, whatever style it names). A VDT from before balloons had a kind
 *  falls back on the `sfx` style id. */
export function isComicSoundEffect(balloon: Pick<VDTComicBalloon, 'style'> & { kind?: VDTComicBalloon['kind'] }): boolean {
  return balloon.kind !== undefined ? balloon.kind === 'sfx' : balloon.style === 'sfx';
}

/** Plain text of a balloon's lettering (the engine's `comicBalloonText`:
 *  lines joined with a space, none between two CJK characters). */
export const comicBalloonText: (balloon: Pick<VDTComicBalloon, 'text'>) => string = sharedBalloonText;

/** The elements a comic page's content goes to. */
interface ComicTags {
  figures: Array<StructElem | undefined>;
  balloons: Map<VDTComicBalloon, StructElem>;
}

/** Alternative text of a panel's picture: its own, else a plain label. */
function panelAlt(panel: VDTComicPanel): string {
  return panel.altText?.trim() || `Panel ${panel.index + 1}`;
}

/** Build the page's structure in reading order before anything is
 *  painted: the pictures are painted before the lettering, but each
 *  panel's balloons are read right after its picture. */
function comicStructure(ctx: PageCtx, structure: StructureFlow, comic: VDTComicPage, own?: StructElem): ComicTags {
  const div = own ?? structure.comicPage();
  const figures: ComicTags['figures'] = [];
  const balloons = new Map<VDTComicBalloon, StructElem>();
  const addBalloon = (b: VDTComicBalloon) => {
    const text = comicBalloonText(b);
    if (!text) return;
    balloons.set(b, isComicSoundEffect(b) ? div.child('P').child('Span', { actualText: text }) : div.child('P'));
  };
  const known = new Set<number>();
  for (const panel of comic.panels) {
    known.add(panel.index);
    const { x, y, width, height } = panel.bbox;
    // The second half of a panel across a spread's spine is read with its
    // first half, on the other page: painted as an artifact here.
    figures[panel.index] = (panel.art || panel.pop) && !comicPanelContinues(comic, panel)
      ? div.child('Figure', { alt: panelAlt(panel), attributes: figureLayout(ctx, x, y, width, height) })
      : undefined;
    for (const b of comic.balloons) if (b.panelIndex === panel.index) addBalloon(b);
  }
  // Lettering of no panel (none expected): read after the panels.
  for (const b of comic.balloons) if (!known.has(b.panelIndex)) addBalloon(b);
  return { figures, balloons };
}

// ------------------------------------------------------------ panels

/** Draw a panel's picture (or cut-out) at its box, flipped left to right
 *  inside it when mirrored; false when it has no bytes. `tag` routes the
 *  picture in an accessible render: it runs where the picture is painted,
 *  inside the flip, since a new graphics state ends the open marked
 *  content. */
function drawArt(ctx: PageCtx, art: VDTComicArt, images: ResourceImageMap | undefined, tag: () => void): boolean {
  const embedded = images?.get(art.fileId);
  if (!embedded) {
    ctx.onMissingImage?.(art.fileId, art.resourceId);
    return false;
  }
  const { x, y, width, height } = art.box;
  if (!art.mirrored) {
    tag();
    drawEmbeddedResource(ctx, embedded, x, y, width, height);
    return true;
  }
  pushTransform(ctx, [-1, 0, 0, 1, (2 * x + width) * ctx.scale, 0]);
  tag();
  drawEmbeddedResource(ctx, embedded, x, y, width, height);
  popTransform(ctx);
  return true;
}

/** Paint one panel: background, clipped picture, border, pop-out. */
export function renderComicPanelPdf(
  ctx: PageCtx,
  panel: VDTComicPanel,
  images: ResourceImageMap | undefined,
  figure?: StructElem,
): void {
  const outline = comicPanelSegs(panel);
  const { x, y, width, height } = panel.bbox;
  pushClipSegs(ctx, outline);
  if (panel.background) {
    tagArtifact(ctx, { type: 'Background' });
    fillRectPx(ctx, x, y, width, height, colorFromHex(panel.background, ctx.colorSpace));
  }
  // The picture is the figure's content; a missing one's placeholder
  // stands in for it.
  const tag = () => (figure ? tagContent(ctx, figure) : tagArtifact(ctx, { type: 'Layout' }));
  if (panel.art && !drawArt(ctx, panel.art, images, tag)) {
    tag();
    fillRectPx(ctx, x, y, width, height, colorFromHex(PLACEHOLDER, ctx.colorSpace));
  }
  popTransform(ctx);
  const { border } = panel;
  if (border.style !== 'none' && border.width > 0) {
    tagArtifact(ctx, { type: 'Layout' });
    const segs = border.style === 'rough' ? polygonSegs(comicRoughBorder(panel)) : outline;
    strokeSegs(ctx, segs, colorFromHex(border.color, ctx.colorSpace), border.width);
  }
  // The pop-out cut-out runs over the border, unclipped.
  if (panel.pop) drawArt(ctx, panel.pop, images, tag);
}

// ------------------------------------------------------------ balloons

/** Stroke a balloon's outline the way its shape asks: a double outline
 *  first (a wide stroke in the outline colour, then a narrower one in the
 *  fill colour), then the outline itself at twice its width (the fill
 *  drawn next covers its inner half), dashed for a whisper. */
function strokeBalloon(ctx: PageCtx, shape: NonNullable<VDTComicBalloon['shape']>, segs: readonly PathSeg[]): void {
  if (!shape.stroke || shape.strokeWidth <= 0) return;
  const ink = colorFromHex(shape.stroke, ctx.colorSpace);
  const sw = shape.strokeWidth;
  if (shape.double) {
    const gap = shape.double.gap;
    strokeSegs(ctx, segs, ink, 2 * (2 * sw + gap));
    if (shape.fill) strokeSegs(ctx, segs, colorFromHex(shape.fill, ctx.colorSpace), 2 * (sw + gap));
  }
  strokeSegs(ctx, segs, ink, 2 * sw, shape.dash?.map((d) => d * 2));
}

/** A text block's halo: its glyphs stroked hollow, `2 × width` wide with
 *  round joins, under the glyphs painted next. */
function paintHalo(ctx: PageCtx, block: VDTDesignTextBlock, halo: NonNullable<VDTComicBalloon['halo']>, fontCache: FontCache, mark: SlotMark | undefined): void {
  if (halo.width <= 0) return;
  const { box: _box, ...rest } = block;
  const haloBlock: VDTDesignTextBlock = { ...rest, stroke: { color: halo.color, widthPx: 2 * halo.width, hollow: true } };
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
  renderTextBlock(ctx, haloBlock, fontCache, mark ? { artifact: { type: 'Layout' } } : undefined);
  ctx.tags?.close();
  ctx.page.pushOperators(popGraphicsState());
}

/** Paint one join group: every outline stroked, every outline filled,
 *  then the lettering of each balloon. */
function renderBalloonGroup(
  ctx: PageCtx,
  group: readonly VDTComicBalloon[],
  fontCache: FontCache,
  tags: ComicTags | undefined,
): void {
  const shaped = group
    .filter((b) => b.shape)
    .map((b) => ({ balloon: b, shape: b.shape!, segs: balloonSegs(b.shape!.d) }));
  for (const { balloon, shape, segs } of shaped) {
    withRotation(ctx, balloon, () => {
      tagArtifact(ctx, { type: 'Layout' });
      strokeBalloon(ctx, shape, segs);
    });
  }
  for (const { balloon, shape, segs } of shaped) {
    if (!shape.fill) continue;
    withRotation(ctx, balloon, () => {
      tagArtifact(ctx, { type: 'Layout' });
      fillSegs(ctx, segs, colorFromHex(shape.fill!, ctx.colorSpace));
    });
  }
  for (const balloon of group) {
    const elem = tags?.balloons.get(balloon);
    const mark: SlotMark | undefined = tags
      ? { artifact: { type: 'Layout' }, ...(elem ? { text: () => elem } : {}) }
      : undefined;
    withRotation(ctx, balloon, () => {
      for (const block of balloon.text) {
        if (balloon.halo) paintHalo(ctx, block, balloon.halo, fontCache, mark);
        renderTextBlock(ctx, block, fontCache, mark);
      }
    });
  }
}

/** The balloons of a page as join groups in paint order: groups in the
 *  order their first balloon comes, sound effects after the rest. */
export function comicBalloonGroups(balloons: readonly VDTComicBalloon[]): VDTComicBalloon[][] {
  const groups = new Map<string, VDTComicBalloon[]>();
  for (const b of balloons) {
    const key = `${b.panelIndex}:${b.group}`;
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  const all = [...groups.values()];
  const sfx = (g: VDTComicBalloon[]) => g.every(isComicSoundEffect);
  return [...all.filter((g) => !sfx(g)), ...all.filter(sfx)];
}

/** Paint a comic (a comic page, a half of a spread, a strip on the
 *  sheet): panels, then lettering. Tagged in `div` when given (a strip's,
 *  placed where the strip is read), else in a `Div` of its own at the end
 *  of the document read so far (a comic page). */
export function renderComicPage(
  ctx: PageCtx,
  comic: VDTComicPage,
  fontCache: FontCache,
  images: ResourceImageMap | undefined,
  structure?: StructureFlow,
  div?: StructElem,
): void {
  const tags = structure ? comicStructure(ctx, structure, comic, div) : undefined;
  for (const panel of comic.panels) renderComicPanelPdf(ctx, panel, images, tags?.figures[panel.index]);
  for (const group of comicBalloonGroups(comic.balloons)) renderBalloonGroup(ctx, group, fontCache, tags);
}
