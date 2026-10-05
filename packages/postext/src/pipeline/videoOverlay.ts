/**
 * A video resource's playback and poster overlays (#454): the play mark and
 * the QR code, placed on the body the layout gave the poster, plus what the
 * interactive outputs need to play it.
 */
import type { Resource, VideoOverlayPosition } from '../types';
import type { ResolvedConfig, VDTResourceVideo, VDTVideoPlayMark, VDTVideoQr } from '../vdt';
import { createBoundingBox } from '../vdt';
import { dimensionToPx } from '../units';
import { resolveVideoPlayerOptions } from '../defaults/videoStyle';
import { encodeQr } from '../video/qr';
import { parseVideoUrl, resourceVideoFormat, resourceVideoLink, videoEmbedUrl, videoMimeType } from '../video/url';

/** The play mark's share of the poster's shorter side, at most. */
const PLAY_MARK_MAX_SHARE = 0.4;
/** The QR code's share of the poster's shorter side, at most. */
const QR_MAX_SHARE = 0.45;
/** Width of the `'rounded'` play mark over its height. */
const ROUNDED_RATIO = 1.45;

/** Top-left corner of a `w` × `h` box at `position` in a `bw` × `bh` body,
 *  `inset` from its edges. */
function placeAt(position: VideoOverlayPosition, bw: number, bh: number, w: number, h: number, inset: number): { x: number; y: number } {
  const xs = { left: inset, center: (bw - w) / 2, right: bw - w - inset };
  const ys = { top: inset, middle: (bh - h) / 2, bottom: bh - h - inset };
  switch (position) {
    case 'top-left': return { x: xs.left, y: ys.top };
    case 'top': return { x: xs.center, y: ys.top };
    case 'top-right': return { x: xs.right, y: ys.top };
    case 'left': return { x: xs.left, y: ys.middle };
    case 'right': return { x: xs.right, y: ys.middle };
    case 'bottom-left': return { x: xs.left, y: ys.bottom };
    case 'bottom': return { x: xs.center, y: ys.bottom };
    case 'bottom-right': return { x: xs.right, y: ys.bottom };
    default: return { x: xs.center, y: ys.middle };
  }
}

/** Playback and overlays of a video resource whose body is `bodyWidth` ×
 *  `bodyHeight` px; `undefined` for any other resource. */
export function layoutVideo(
  resource: Resource,
  resolved: ResolvedConfig,
  bodyWidth: number,
  bodyHeight: number,
): VDTResourceVideo | undefined {
  if (resource.kind !== 'video') return undefined;
  const v = resource.video;
  const style = resolved.videoStyle;
  const dpi = resolved.page.dpi;
  const source = v?.source ?? 'file';
  const player = resolveVideoPlayerOptions(v?.player, style.player);
  const link = resourceVideoLink(resource);
  const parsed = source === 'file' ? undefined : parseVideoUrl(v?.url);
  const range = {
    ...(v?.start ? { start: v.start } : {}),
    ...(v?.end ? { end: v.end } : {}),
  };
  const out: VDTResourceVideo = {
    source,
    ...(link ? { link } : {}),
    ...(parsed && parsed.source === source ? { embedUrl: videoEmbedUrl(parsed, player, range) } : {}),
    // A self-hosted video's media type: of its file, or of its address
    // alone (an MP4 on a server, an HLS stream).
    ...(source === 'file' && v?.fileId ? { fileId: v.fileId } : {}),
    ...(source === 'file' && (v?.fileId || link) ? { mimeType: videoMimeType(resourceVideoFormat(v)) } : {}),
    ...range,
    player,
    linkPoster: style.linkPoster && !!link,
    html: style.html,
  };
  const shorter = Math.min(bodyWidth, bodyHeight);
  if (!(shorter > 0)) return out;

  const pm = style.playMark;
  if (pm.enabled) {
    const h = Math.min(dimensionToPx(pm.size, dpi), shorter * PLAY_MARK_MAX_SHARE);
    const w = pm.shape === 'rounded' ? Math.min(h * ROUNDED_RATIO, bodyWidth) : h;
    const at = placeAt(pm.position, bodyWidth, bodyHeight, w, h, dimensionToPx(pm.inset, dpi));
    const mark: VDTVideoPlayMark = {
      rect: createBoundingBox(at.x, at.y, w, h),
      shape: pm.shape,
      color: pm.color.hex,
      background: pm.background.hex,
      backgroundOpacity: pm.backgroundOpacity,
    };
    out.playMark = mark;
  }

  const qs = style.qr;
  if (qs.enabled && link) {
    const matrix = encodeQr(link, qs.errorCorrection);
    if (matrix) {
      const side = Math.min(dimensionToPx(qs.size, dpi), shorter * QR_MAX_SHARE);
      const modules = matrix.size + 2 * qs.quietZone;
      const moduleSize = side / modules;
      const at = placeAt(qs.position, bodyWidth, bodyHeight, side, side, dimensionToPx(qs.inset, dpi));
      const qr: VDTVideoQr = {
        rect: createBoundingBox(at.x, at.y, side, side),
        text: link,
        size: matrix.size,
        rows: matrix.rows,
        quietZone: qs.quietZone,
        moduleSize,
        color: qs.color.hex,
        background: qs.background.hex,
        radius: Math.min(dimensionToPx(qs.radius, dpi), side / 2),
      };
      out.qr = qr;
    }
  }
  return out;
}

/** The play mark's triangle, pointing right, inside its rect: vertices in
 *  px relative to the rect's top-left corner. Optically centred (the
 *  triangle's centroid sits a little right of the box's centre). */
export function playMarkTriangle(mark: VDTVideoPlayMark): Array<[number, number]> {
  const { width: w, height: h } = mark.rect;
  const s = mark.shape === 'triangle' ? h * 0.9 : h * 0.42;
  const triW = s * 0.866;
  const cx = w / 2 + triW * (mark.shape === 'triangle' ? 0.05 : 0.12);
  const cy = h / 2;
  return [
    [cx - triW / 2, cy - s / 2],
    [cx + triW / 2, cy],
    [cx - triW / 2, cy + s / 2],
  ];
}

/** The dark modules of a QR code as horizontal runs, one rect per run, in
 *  px relative to the plate's top-left corner: what a renderer fills
 *  (fewer, abutting shapes than one square per module). */
export function qrModuleRuns(qr: VDTVideoQr): Array<{ x: number; y: number; w: number; h: number }> {
  const runs: Array<{ x: number; y: number; w: number; h: number }> = [];
  const m = qr.moduleSize;
  const off = qr.quietZone * m;
  qr.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '1') {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === '1') end++;
      runs.push({ x: off + x * m, y: off + y * m, w: (end - x) * m, h: m });
      x = end;
    }
  });
  return runs;
}
