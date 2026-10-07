/**
 * Canvas painting of a comic page (#563): per panel, its background, then
 * its picture clipped to its outline (flipped when mirrored), then its
 * border, then its pop-out cut-out over the border; then the lettering
 * (SPEC D5): balloons and captions, each join group's outline stroked at
 * twice its width and then filled (so joined bodies, necks and the tail
 * merge into one outline), its text over it; sound effects last. Nothing
 * of the lettering is clipped: a balloon may break the border. Everything
 * is in sheet coordinates: call it outside any flow frame.
 */

import type { VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTDesignTextBlock, VDTPoint } from '../vdt';
import { drawResourceImage } from './renderResourceBlock';
import { renderTextBlock } from './headerFooter';

/** A small deterministic hash (FNV-1a) for seeding a rough border. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded pseudo-random sequence in [-1, 1] (mulberry32). */
function noise(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Trace a panel's outline as the current path: its polygon, or a rounded
 *  rectangle when it has a radius. */
export function comicPanelPath(ctx: CanvasRenderingContext2D, panel: Pick<VDTComicPanel, 'polygon' | 'bbox' | 'radius'>): void {
  ctx.beginPath();
  const r = panel.radius;
  if (r > 0) {
    const { x, y, width: w, height: h } = panel.bbox;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    return;
  }
  const pts = panel.polygon;
  if (pts.length === 0) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

/** A hand-drawn version of a closed outline: points every few px pushed
 *  off the line by a seeded amount. */
export function roughOutline(points: readonly VDTPoint[], seed: number, amplitude: number, step: number): VDTPoint[] {
  const rand = noise(seed);
  const out: VDTPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    const nx = len > 0 ? -(b.y - a.y) / len : 0;
    const ny = len > 0 ? (b.x - a.x) / len : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      // Corners stay put; the wobble grows away from them.
      const j = k === 0 ? 0 : rand() * amplitude;
      out.push({ x: a.x + t * (b.x - a.x) + nx * j, y: a.y + t * (b.y - a.y) + ny * j });
    }
  }
  return out;
}

/** The hand-drawn outline a `rough` border strokes: the panel's polygon
 *  wobbled by a seed from its id, index and source offset, so every
 *  renderer draws the same line. */
export function comicRoughBorder(panel: Pick<VDTComicPanel, 'id' | 'index' | 'sourceStart' | 'polygon' | 'border'>): VDTPoint[] {
  const w = panel.border.width;
  return roughOutline(panel.polygon, hashString(`${panel.id ?? ''}#${panel.index}#${panel.sourceStart}`), w * 0.6, Math.max(4, w * 6));
}

function drawArt(ctx: CanvasRenderingContext2D, art: VDTComicArt, inkHex: string | null): boolean {
  const { box } = art;
  if (!art.mirrored) return drawResourceImage(ctx, art.fileId, box.x, box.y, box.width, box.height, { inkHex, svg: art.kind === 'svg' }, art.resourceId);
  ctx.save();
  ctx.translate(box.x + box.width, box.y);
  ctx.scale(-1, 1);
  const drawn = drawResourceImage(ctx, art.fileId, 0, 0, box.width, box.height, { inkHex, svg: art.kind === 'svg' }, art.resourceId);
  ctx.restore();
  return drawn;
}

/** Paint one panel. */
export function renderComicPanel(ctx: CanvasRenderingContext2D, panel: VDTComicPanel, inkHex: string | null = null): void {
  ctx.save();
  comicPanelPath(ctx, panel);
  ctx.clip();
  if (panel.background) {
    ctx.fillStyle = panel.background;
    ctx.fillRect(panel.bbox.x, panel.bbox.y, panel.bbox.width, panel.bbox.height);
  }
  if (panel.art && !drawArt(ctx, panel.art, inkHex)) {
    // Nothing registered for the picture yet: a light placeholder.
    ctx.fillStyle = 'rgba(160, 160, 160, 0.15)';
    ctx.fillRect(panel.bbox.x, panel.bbox.y, panel.bbox.width, panel.bbox.height);
  }
  ctx.restore();
  const { border } = panel;
  if (border.style !== 'none' && border.width > 0) {
    ctx.save();
    ctx.strokeStyle = border.color;
    ctx.lineWidth = border.width;
    ctx.lineJoin = 'round';
    if (border.style === 'rough') {
      const pts = comicRoughBorder(panel);
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.closePath();
    } else {
      comicPanelPath(ctx, panel);
    }
    ctx.stroke();
    ctx.restore();
  }
  // The pop-out cut-out runs over the border, unclipped.
  if (panel.pop) drawArt(ctx, panel.pop, inkHex);
}

/** Paint the panels of a comic page, in reading order. */
export function renderComicPanels(ctx: CanvasRenderingContext2D, comic: VDTComicPage, inkHex: string | null = null): void {
  for (const panel of comic.panels) renderComicPanel(ctx, panel, inkHex);
}

/** Trace an SVG path made of M, L, C and Z commands (absolute, as the
 *  lettering writes them) as the current path. */
export function traceComicPath(ctx: CanvasRenderingContext2D, d: string): void {
  ctx.beginPath();
  const re = /([MLCZ])([^MLCZ]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const n = m[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (m[1]!.toUpperCase()) {
      case 'M':
        for (let i = 0; i + 1 < n.length; i += 2) (i === 0 ? ctx.moveTo(n[i]!, n[i + 1]!) : ctx.lineTo(n[i]!, n[i + 1]!));
        break;
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) ctx.lineTo(n[i]!, n[i + 1]!);
        break;
      case 'C':
        for (let i = 0; i + 5 < n.length; i += 6) ctx.bezierCurveTo(n[i]!, n[i + 1]!, n[i + 2]!, n[i + 3]!, n[i + 4]!, n[i + 5]!);
        break;
      default:
        ctx.closePath();
    }
  }
}

/** The outline of a balloon (body, necks and tail as one path), the
 *  Comicraft way: stroked at twice its width (a double outline first: the
 *  outer ring, then the fill-coloured gap), then filled over, so the inner
 *  half of every stroke and the seams between subpaths disappear. */
function paintBalloonShape(ctx: CanvasRenderingContext2D, shape: NonNullable<VDTComicBalloon['shape']>): void {
  const w = shape.strokeWidth;
  const stroke = shape.stroke && w > 0 ? shape.stroke : undefined;
  traceComicPath(ctx, shape.d);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (stroke) {
    ctx.strokeStyle = stroke;
    if (shape.double) {
      const gap = shape.double.gap;
      ctx.lineWidth = 2 * (2 * w + gap);
      ctx.stroke();
      if (shape.fill) {
        ctx.strokeStyle = shape.fill;
        ctx.lineWidth = 2 * (w + gap);
        ctx.stroke();
        ctx.strokeStyle = stroke;
      }
    }
    if (shape.dash && shape.dash.length > 0) {
      ctx.setLineDash(shape.dash.map((v) => v * 2));
      ctx.lineCap = 'butt';
    }
    ctx.lineWidth = 2 * w;
    ctx.stroke();
    if (shape.dash && shape.dash.length > 0) ctx.setLineDash([]);
  }
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill('nonzero');
  }
}

/** A text block painted as its halo: the glyphs filled and stroked at
 *  twice the halo width in the halo colour, with round joins. */
function haloOf(block: VDTDesignTextBlock, halo: NonNullable<VDTComicBalloon['halo']>): VDTDesignTextBlock {
  return { ...block, color: halo.color, stroke: { widthPx: 2 * halo.width, color: halo.color } };
}

/** Paint one balloon: its outline (when it carries its group's), then its
 *  halo and its text, turned by `rotate` degrees about its box's centre. */
export function renderComicBalloon(ctx: CanvasRenderingContext2D, balloon: VDTComicBalloon): void {
  ctx.save();
  if (balloon.rotate) {
    const cx = balloon.bbox.x + balloon.bbox.width / 2;
    const cy = balloon.bbox.y + balloon.bbox.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((balloon.rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (balloon.shape) paintBalloonShape(ctx, balloon.shape);
  if (balloon.halo && balloon.halo.width > 0) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    for (const block of balloon.text) renderTextBlock(ctx, haloOf(block, balloon.halo));
  }
  for (const block of balloon.text) renderTextBlock(ctx, block);
  ctx.restore();
}

/** Paint the lettering of a comic page: balloons, captions and notes in
 *  reading order (each join group's outline, then its text), then the
 *  sound effects over everything. */
export function renderComicBalloons(ctx: CanvasRenderingContext2D, comic: VDTComicPage): void {
  for (const b of comic.balloons) if (b.kind !== 'sfx') renderComicBalloon(ctx, b);
  for (const b of comic.balloons) if (b.kind === 'sfx') renderComicBalloon(ctx, b);
}

/** Paint a whole comic page: its panels, then its lettering. */
export function renderComicPage(ctx: CanvasRenderingContext2D, comic: VDTComicPage, inkHex: string | null = null): void {
  renderComicPanels(ctx, comic, inkHex);
  renderComicBalloons(ctx, comic);
}
