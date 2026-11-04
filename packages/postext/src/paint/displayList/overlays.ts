// Vector overlays as display items (#1406): a video's poster frame, play
// mark and QR plate (postext-pdf `renderResourceBlock/overlays.ts`), and a
// link note's QR code (`VDTLine.qr`, #1302). A code is drawn upright on the
// sheet whatever the frame (the painters turn it back on a mirrored page):
// it must never read mirrored.
import type { VDTLine, VDTLineQr } from '../../vdt/lines.js';
import type { ResolvedResourceBlock, VDTResourceVideo, VDTVideoPlayMark } from '../../vdt/resources.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import { playMarkTriangle, qrModuleRuns } from '../../pipeline/resources/videoOverlay.js';
import { lineQrBox } from '../lineQr.js';
import { mapRect, placeShape, type Frame } from './frame.js';
import type { DisplayItem, DisplayRect } from './types.js';

type PathItem = Extract<DisplayItem, { kind: 'path' }>;

/** Poster frame of a video without a picture (the painters' fallback). */
export const VIDEO_FALLBACK_FILL = '#1f1f1f';

/** Bézier factor of a quarter circle. */
const KAPPA = 0.5522847498;

/** `#rrggbb` with an alpha below 1 as `#rrggbbaa`. */
function withAlpha(hex: string, alpha: number): string {
  if (!(alpha < 1) || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return hex + Math.round(Math.max(0, alpha) * 255).toString(16).padStart(2, '0');
}

/** A rect as one closed subpath. */
function rectPath(x: number, y: number, w: number, h: number): VDTPathCommand[] {
  return [{ op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' }];
}

/** An ellipse inscribed in a box, as four cubic arcs. */
function ellipsePath(r: DisplayRect): VDTPathCommand[] {
  const rx = r.width / 2, ry = r.height / 2;
  const cx = r.x + rx, cy = r.y + ry;
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return [
    { op: 'M', x: cx + rx, y: cy },
    { op: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { op: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { op: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { op: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { op: 'Z' },
  ];
}

/** The dark modules of a code whose box (quiet zone included) is `box`
 *  on the sheet, as one path (no seams between modules). */
export function qrModulesItem(qr: Pick<VDTLineQr, 'rows' | 'moduleSize' | 'quietZone'>, box: DisplayRect, color: string): PathItem | null {
  // The code is scaled to the box it stands in on the sheet.
  const side = qr.moduleSize * (qr.rows.length + 2 * qr.quietZone);
  const k = side > 0 ? box.width / side : 1;
  const subpaths = qrModuleRuns(qr).map((r) => rectPath(box.x + r.x * k, box.y + r.y * k, r.w * k, r.h * k));
  if (subpaths.length === 0) return null;
  return { kind: 'path', bbox: { ...box }, subpaths, fill: color };
}

/** A line's link-note code (`VDTLine.qr`) in the line's colour or its own. */
export function lineQrItems(line: VDTLine, frame: Frame, color: string): DisplayItem[] {
  if (!line.qr) return [];
  const { x, y, side } = lineQrBox(line as VDTLine & { qr: VDTLineQr });
  const item = qrModulesItem(line.qr, mapRect(frame, { x, y, width: side, height: side }), line.qr.color ?? color);
  return item ? [item] : [];
}

/** The play mark in a body at `body` on the sheet. */
function playMarkItems(mark: VDTVideoPlayMark, body: DisplayRect): DisplayItem[] {
  const r: DisplayRect = { x: body.x + mark.rect.x, y: body.y + mark.rect.y, width: mark.rect.width, height: mark.rect.height };
  const tri: VDTPathCommand[] = [
    ...playMarkTriangle(mark).map(([px, py], i): VDTPathCommand => ({ op: i === 0 ? 'M' : 'L', x: r.x + px, y: r.y + py })),
    { op: 'Z' },
  ];
  const background = withAlpha(mark.background, mark.backgroundOpacity);
  if (mark.shape === 'triangle') {
    return [{ kind: 'path', bbox: r, subpaths: [tri], fill: mark.color, stroke: { color: background, widthPx: r.height * 0.08, join: 'round' } }];
  }
  const disc: DisplayItem = mark.shape === 'circle'
    ? { kind: 'path', bbox: { ...r }, subpaths: [ellipsePath(r)], fill: background }
    : { kind: 'rect', rect: { ...r }, fill: background, radius: r.height * 0.24 };
  return [disc, { kind: 'path', bbox: { ...r }, subpaths: [tri], fill: mark.color }];
}

/** A video's overlays over its body at `body` on the sheet. */
function videoOverlayItems(video: VDTResourceVideo, body: DisplayRect): DisplayItem[] {
  const items: DisplayItem[] = [];
  if (video.playMark) items.push(...playMarkItems(video.playMark, body));
  const qr = video.qr;
  if (qr) {
    const plate: DisplayRect = { x: body.x + qr.rect.x, y: body.y + qr.rect.y, width: qr.rect.width, height: qr.rect.height };
    items.push({ kind: 'rect', rect: plate, fill: qr.background, ...(qr.radius > 0 ? { radius: qr.radius } : {}) });
    const modules = qrModulesItem(qr, plate, qr.color);
    if (modules) items.push(modules);
  }
  return items;
}

/**
 * A video body's items, laid out at `body` in `frame`: the dark frame when
 * it has no poster (`poster` false), then its play mark and QR code, which
 * stand on the body as it lands on the sheet.
 */
export function videoItems(rb: ResolvedResourceBlock, body: DisplayRect, frame: Frame, poster: boolean): DisplayItem[] {
  const items: DisplayItem[] = [];
  if (!poster) items.push(placeShape(frame, { kind: 'rect', rect: { ...body }, fill: VIDEO_FALLBACK_FILL }));
  if (rb.video) items.push(...videoOverlayItems(rb.video, mapRect(frame, body)));
  return items;
}
