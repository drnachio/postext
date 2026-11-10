// A video without a poster frame in the semantic .docx (#1444): the dark
// frame the print sets in its place, with the play mark and the QR code
// that opens the video, drawn as an SVG (over a PNG for readers without
// SVG) the size of the poster. The picture links to the video, so a click
// in Word plays it as the QR does on paper.

import type { Resource } from '../../../types.js';
import { layoutVideo, playMarkTriangle, qrModuleRuns } from '../../../pipeline/resources/videoOverlay.js';
import { VIDEO_FALLBACK_FILL } from '../../../paint/displayList/overlays.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { resourceVideoLink } from '../../../video/url.js';

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A `#rrggbb` colour and its opacity as SVG attributes. */
function paint(attr: 'fill', hex: string, opacity = 1): string {
  return `${attr}="${hex}"${opacity < 1 ? ` ${attr}-opacity="${n(Math.max(0, opacity))}"` : ''}`;
}

/** The poster of video `res` as an SVG `width` × `height` px: its frame,
 *  play mark and QR code, laid out as the engine lays them on the page. */
export function videoPosterSvg(res: Resource, resolved: ResolvedConfig, width: number, height: number): string {
  const v = layoutVideo(res, resolved, width, height);
  let body = `<rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="${VIDEO_FALLBACK_FILL}"/>`;
  const mark = v?.playMark;
  if (mark) {
    const r = mark.rect;
    const tri = playMarkTriangle(mark)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${n(r.x + x)} ${n(r.y + y)}`)
      .join(' ');
    if (mark.shape === 'circle') body += `<ellipse cx="${n(r.x + r.width / 2)}" cy="${n(r.y + r.height / 2)}" rx="${n(r.width / 2)}" ry="${n(r.height / 2)}" ${paint('fill', mark.background, mark.backgroundOpacity)}/>`;
    else if (mark.shape !== 'triangle') body += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${n(r.height * 0.24)}" ${paint('fill', mark.background, mark.backgroundOpacity)}/>`;
    body += `<path d="${tri} Z" fill="${mark.color}"/>`;
  }
  const qr = v?.qr;
  if (qr) {
    const r = qr.rect;
    body += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}"${qr.radius > 0 ? ` rx="${n(qr.radius)}"` : ''} fill="${qr.background}"/>`;
    // The code scaled to its plate (quiet zone included).
    const side = qr.moduleSize * (qr.rows.length + 2 * qr.quietZone);
    const k = side > 0 ? r.width / side : 1;
    const d = qrModuleRuns(qr)
      .map((m) => `M${n(r.x + m.x * k)} ${n(r.y + m.y * k)}h${n(m.w * k)}v${n(m.h * k)}h${n(-m.w * k)}Z`)
      .join('');
    if (d) body += `<path d="${d}" fill="${qr.color}" shape-rendering="crispEdges"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">${body}</svg>`;
}

/** The address a video's picture links to (the one its QR code holds),
 *  when it has one. */
export function videoLink(res: Resource): string | undefined {
  return resourceVideoLink(res);
}
