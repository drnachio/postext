// What the page layout (`pages.ts`) and the pages a flowing book sets
// whole (`fidelity/flowUnits.ts`, #1556) read alike from a frame.

import type { FrameConfig } from 'postext';
import { apply, boxCentre, boxHeight, boxWidth, decompose, pathExtent, type Box } from '../model/geometry.js';
import type { Leaf } from './scan.js';

/** The room under a plain text frame, in leadings: InDesign sets a line
 *  whose baseline and descenders are inside the frame, Postext needs the
 *  whole line box, a fifth of the leading under the baseline. */
export const FOOT_ROOM = 0.2;

/** InDesign's vertical justification as a frame's `verticalAlign`. */
export const VERTICAL: Record<string, FrameConfig['verticalAlign']> = { CenterAlign: 'middle', BottomAlign: 'bottom', JustifyAlign: 'justify' };

/** A frame's own rectangle on the page and its turn: the bounding box of
 *  a turned frame is larger than the frame. */
export function frameBox(leaf: Leaf): { box: Box; rotation: number; flipped: boolean } | undefined {
  const own = pathExtent(leaf.at.item.paths);
  if (!own) return undefined;
  const d = decompose(leaf.g.toPage);
  const w = boxWidth(own) * d.scaleX;
  const h = boxHeight(own) * d.scaleY;
  const c = apply(leaf.g.toPage, boxCentre(own));
  if (![w, h, c.x, c.y].every(Number.isFinite)) return undefined;
  return { box: { left: c.x - w / 2, top: c.y - h / 2, right: c.x + w / 2, bottom: c.y + h / 2 }, rotation: Math.abs(d.rotation) < 0.01 ? 0 : d.rotation, flipped: d.flipped };
}
