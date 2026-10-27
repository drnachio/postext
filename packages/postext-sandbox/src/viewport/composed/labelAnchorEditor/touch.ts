// The grab and drag sizes of the label editor for a mouse and a finger,
// and the touch pads of its points (#1276: split out of
// labelAnchorEditor.ts).
import type { MarkShape } from '../labelMarks.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';
/** CSS px a pointer may travel before a press becomes a drag. */
const DRAG_START_CSS_PX = 3;
/** CSS px round an anchor point that grab it. */
const POINT_CSS_PX = 9;
/** The same for a finger or a pen (#992): a fingertip lands on a spot about
 *  as wide as the 44 px target the interface sets everywhere else, and
 *  wanders a few px between the press and the lift. */
const POINT_TOUCH_CSS_PX = 22;
const DRAG_START_TOUCH_CSS_PX = 8;

/** Whether a pointer is a finger or a pen rather than a mouse. */
const isFinger = (pointerType: string | undefined): boolean => pointerType === 'touch' || pointerType === 'pen';
/** CSS px round a point that a pointer of this kind grabs. */
export const pointGrabCssPx = (pointerType?: string): number => (isFinger(pointerType) ? POINT_TOUCH_CSS_PX : POINT_CSS_PX);
/** CSS px a pointer of this kind travels before a press is a drag. */
export const dragStartCssPx = (pointerType?: string): number => (isFinger(pointerType) ? DRAG_START_TOUCH_CSS_PX : DRAG_START_CSS_PX);

/** A box laid over a mark for a touch screen (#992), as fractions of the
 *  page: the browser decides at the first touch whether a finger scrolls the
 *  page or is the page's own, from the `touch-action` of what is under it,
 *  and the marks are drawn in an SVG that takes no pointer. A pad is that
 *  something: `touch-action: none` under every label's box and point, so a
 *  finger that lands on a label drags it and one that lands on bare paper
 *  scrolls the canvas. `minCssPx` is the least a side measures on screen. */
export interface TouchPad {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  minCssPx: number;
}

/** The pads of a page's `shapes` (sheet px, a page `pageWidthPx` by
 *  `pageHeightPx`): a box for each label's outline and a finger's width
 *  round each point. The ghost of a drag has none, the finger is down. */
export function touchPads(shapes: readonly MarkShape[], pageWidthPx: number, pageHeightPx: number): TouchPad[] {
  const pads: TouchPad[] = [];
  for (const s of shapes) {
    if (s.kind === 'circle') {
      pads.push({ centerX: s.cx / pageWidthPx, centerY: s.cy / pageHeightPx, width: 0, height: 0, minCssPx: 2 * POINT_TOUCH_CSS_PX });
    } else if (s.kind === 'polygon' && !s.fill && s.points.length > 0) {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      pads.push({ centerX: (x0 + Math.max(...xs)) / 2 / pageWidthPx, centerY: (y0 + Math.max(...ys)) / 2 / pageHeightPx, width: (Math.max(...xs) - x0) / pageWidthPx, height: (Math.max(...ys) - y0) / pageHeightPx, minCssPx: 0 });
    }
  }
  return pads;
}
