// A link note's QR code (#1302, `links.show: 'qr' | 'both'`): the note's
// lines are set beside the code, the note is padded to the code's height in
// whole lines, and the code rides on its first line (`VDTLine.qr`).
import type { ContentBlock } from '../../../parse/index.js';
import type { VDTLine } from '../../../vdt.js';
import type { LineInsetStep } from '../../../measure/types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { DEFAULT_LINKS_CONFIG } from '../../../defaults/structure/links.js';
import { resolveColor } from '../../../defaults/shared.js';
import { encodeQr, type QrMatrix } from '../../../video/qr.js';
import { dimensionToPx } from '../../../units.js';

/** The code never takes more of the column than this share. */
const QR_MAX_SHARE = 0.4;

export interface LinkQrSetting {
  matrix: QrMatrix;
  /** Side with the quiet zone (px). */
  side: number;
  gap: number;
  /** Which side of the measure the code takes. */
  at: 'start' | 'end';
  quietZone: number;
  color?: string;
  inset: LineInsetStep;
}

/** How the code of `block` is set at `columnWidth`, its note text
 *  `fontSizePx` high; undefined when it has none or the address does not
 *  fit a code. */
export function linkQrSetting(block: ContentBlock, resolved: ResolvedConfig, columnWidth: number, fontSizePx: number): LinkQrSetting | undefined {
  if (block.linkQr === undefined) return undefined;
  const cfg = (resolved.links ?? DEFAULT_LINKS_CONFIG).qr;
  const matrix = encodeQr(block.linkQr, cfg.errorCorrection);
  if (!matrix) return undefined;
  const dpi = resolved.page.dpi;
  const side = Math.min(dimensionToPx(cfg.size, dpi, fontSizePx), columnWidth * QR_MAX_SHARE);
  const gap = Math.max(0, dimensionToPx(cfg.gap, dpi, fontSizePx));
  const room = side + gap;
  const color = resolveColor(cfg.color, resolved.colorPalette)?.hex;
  return {
    matrix,
    side,
    gap,
    at: cfg.side,
    quietZone: cfg.quietZone,
    ...(color ? { color } : {}),
    inset: { fromLine: 0, startInsetPx: cfg.side === 'start' ? room : 0, endInsetPx: cfg.side === 'end' ? room : 0 },
  };
}

/** Hang the code on the first of `lines` (measured beside it, at
 *  `columnWidth`, `lineHeightPx` apart) and add empty lines under the last
 *  until the note is as tall as the code. */
export function hangLinkQr(lines: VDTLine[], qr: LinkQrSetting, text: string, columnWidth: number, lineHeightPx: number): void {
  const first = lines[0];
  if (!first) return;
  const x = qr.at === 'end' ? columnWidth - qr.side : 0;
  const modules = qr.matrix.size + 2 * qr.quietZone;
  first.qr = {
    dx: x - first.bbox.x,
    dy: 0,
    side: qr.side,
    text,
    size: qr.matrix.size,
    rows: qr.matrix.rows,
    quietZone: qr.quietZone,
    moduleSize: qr.side / modules,
    ...(qr.color ? { color: qr.color } : {}),
  };
  const needed = Math.ceil(qr.side / lineHeightPx - 1e-6);
  const last = lines[lines.length - 1]!;
  for (let k = 1; lines.length < needed; k++) {
    lines.push({
      text: '',
      bbox: { x: last.bbox.x, y: last.bbox.y + k * lineHeightPx, width: 0, height: last.bbox.height },
      baseline: last.baseline + k * lineHeightPx,
      hyphenated: false,
      segments: [],
      isLastLine: true,
      ...(last.plainEnd !== undefined ? { plainStart: last.plainEnd, plainEnd: last.plainEnd } : {}),
      ...(last.sourceEnd !== undefined ? { sourceStart: last.sourceEnd, sourceEnd: last.sourceEnd } : {}),
    });
  }
}
