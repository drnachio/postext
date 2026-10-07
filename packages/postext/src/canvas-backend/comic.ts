/**
 * Canvas painting of a comic page's panels (#563): per panel, its
 * background, then its picture clipped to its outline (flipped when
 * mirrored), then its border, then its pop-out cut-out over the border.
 * Balloons are painted on top by the lettering painter. Everything is in
 * sheet coordinates: call it outside any flow frame.
 */

import type { VDTComicArt, VDTComicPage, VDTComicPanel, VDTPoint } from '../vdt';
import { drawResourceImage } from './renderResourceBlock';

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
