// Text halos (#1444): a figure label's halo on a busy picture, a comic
// sound effect's outline. The canvas and the PDF stroke the glyphs in the
// halo colour under the text. Word's own text effects do not serve:
// `w14:textOutline` strokes over the glyphs (a white outline eats into
// dark letters), `w14:glow` is soft, and LibreOffice draws neither. The
// halo is drawn instead as a shape under the text box: the glyph outlines
// of the embedded face, set where the engine set each run, stroked twice
// the halo's width with round joins. It is a drawing, not text, so it
// adds nothing to what a reader or the importer reads.

import type { DisplayItem, DisplayLine, DisplayRect, DisplayRun } from '../../paint/displayList/types.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import { contourCommands } from '../svg/glyphs.js';
import { outlineFaceOf, SLANT } from '../svg/text.js';
import { fontSizePx } from './metrics.js';
import { resolveFont } from './runs.js';
import { pathRun } from './shapes.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** The glyph outlines of a run, laid from `x` on `baseline` and spread to
 *  the run's width as Word's fitted spacing spreads its letters. */
function runOutlines(ctx: WriterContext, run: DisplayRun, baseline: number, map: (x: number, y: number) => [number, number]): VDTPathCommand[][] {
  if (!ctx.plan || run.blank || run.inline || run.rtl || !run.text.trim()) return [];
  const f = resolveFont(ctx, run.fontString);
  const of = outlineFaceOf(ctx.plan, f.family, f.bold, f.italic);
  if (!of) return [];
  const { face, slant } = of;
  const k = fontSizePx(run.fontString) / face.unitsPerEm;
  const chars = [...run.text];
  const gids = chars.map((ch) => face.glyph(ch.codePointAt(0)!));
  const natural = gids.reduce<number>((w, g) => w + (g === undefined ? 0 : face.advance(g) * k), 0);
  const room = run.width - (run.padStart ?? 0) - (run.padEnd ?? 0);
  const extra = chars.length ? (room - natural) / chars.length : 0;
  const y0 = baseline - (run.baselineShift ?? 0);
  const skew = slant ? SLANT : 0;
  let pen = run.x + (run.padStart ?? 0);
  const out: VDTPathCommand[][] = [];
  for (const g of gids) {
    const at = pen;
    if (g !== undefined) {
      out.push(...contourCommands(face.contours(g), (gx, gy) => map(at + gx * k + gy * k * skew, y0 - gy * k)));
      pen += face.advance(g) * k;
    }
    pen += extra;
  }
  return out;
}

/** Where a turned item's halo is drawn: the text box of the lines it
 *  rings, turned as that box turns. */
export interface HaloFrame {
  /** The box in the item's unturned frame, where its lines are laid. */
  box: DisplayRect;
  /** The same box where it stands on the sheet, before its turn. */
  rect: DisplayRect;
  /** Degrees clockwise about the box's centre. */
  rotate: number;
}

/** The halo of a text item as a shape ('' when it has none or its face
 *  has no outlines to draw: vertical lines, a face not embedded).
 *
 *  An unturned item's halo is laid on the sheet as its glyphs are. A
 *  turned item's halo is drawn per text box (`frame`, with that box's
 *  `lines`): the outlines in the box's own frame, in a shape the size and
 *  place of the box, turned the same, so it goes where Word draws the
 *  box's text. LibreOffice (26.8) does not turn the text of a turned text
 *  box at all: it sets it level in the box's bounding rectangle, so there
 *  the halo, which it does turn, lies off the letters (#1444). */
export function haloRun(ctx: WriterContext, item: TextItem, frame?: HaloFrame, lines: readonly DisplayLine[] = item.lines): string {
  const halo = item.halo;
  if (!halo || halo.widthPx <= 0) return '';
  let map: (x: number, y: number) => [number, number];
  if (frame) {
    // Box-relative points, moved onto the box where it stands.
    const dx = frame.rect.x - frame.box.x;
    const dy = frame.rect.y - frame.box.y;
    map = (x, y) => [x + dx, y + dy];
  } else {
    const b = item.bbox;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const turn = ((item.rotate ?? 0) * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    // Clockwise about the item's centre, as the item turns.
    map = (x, y) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
  }
  const subpaths: VDTPathCommand[][] = [];
  for (const line of lines) {
    if (line.vertical) continue;
    for (const run of line.runs) subpaths.push(...runOutlines(ctx, run, line.baseline, map));
  }
  if (!subpaths.length) return '';
  const stroke = { color: halo.color, widthPx: 2 * halo.widthPx, join: 'round', cap: 'round' } as const;
  if (frame) return pathRun(ctx, { kind: 'path', bbox: frame.rect, subpaths, stroke }, frame.rotate);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sp of subpaths) {
    for (const c of sp) {
      if (c.op === 'Z') continue;
      const xs = c.op === 'Q' ? [c.x1, c.x] : c.op === 'C' ? [c.x1, c.x2, c.x] : [c.x];
      const ys = c.op === 'Q' ? [c.y1, c.y] : c.op === 'C' ? [c.y1, c.y2, c.y] : [c.y];
      x0 = Math.min(x0, ...xs);
      x1 = Math.max(x1, ...xs);
      y0 = Math.min(y0, ...ys);
      y1 = Math.max(y1, ...ys);
    }
  }
  const bbox = { x: x0, y: y0, width: Math.max(0.01, x1 - x0), height: Math.max(0.01, y1 - y0) };
  return pathRun(ctx, { kind: 'path', bbox, subpaths, stroke });
}
