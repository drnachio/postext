// Where a running head's element sits in Word (#1444). The engine places
// each text of a header or footer design anywhere on the sheet; a Word
// header is a paragraph across the text area. Each element goes to the
// header or the footer by the edge of the page it hangs from, and within
// that paragraph to one of three places, the start, the middle or the end
// (a centre tab and an end tab), by where its text stands across the page.

import type { ResolvedDesignElement } from '../../../types.js';
import { px, type Units } from '../wml.js';

/** Where on the page a part of the furniture goes. */
export type Target = 'header' | 'footer';
export type Zone = 'left' | 'center' | 'right';

/** The page an element is placed on: its size and margins, px. */
export interface PageBox {
  width: number;
  margins: { left: number; right: number };
  /** The page is set right to left (its start is on the right). */
  rtl: boolean;
  /** The page is a recto: the outer margin is on its right (left-bound). */
  recto: boolean;
  /** The book is bound on the right (the outer margins swap sides). */
  rightBound: boolean;
}

export interface Placed {
  zone: Zone;
  /** Where the text stands across the page, px: orders the texts of one
   *  zone. */
  x: number;
  /** The header or footer, by the page edge the element hangs from;
   *  undefined when it says nothing (the slot's own then). */
  target?: Target;
}

const vertical = (edge: string): Target | undefined => (edge.startsWith('top') || edge === 'above' || edge === 'align-top' ? 'header' : edge.startsWith('bottom') || edge === 'below' || edge === 'align-bottom' ? 'footer' : undefined);

/** The anchor point across the page, px, of an anchor edge on a frame
 *  that runs from `from` to `to`. */
function across(edge: string, from: number, to: number, rtl: boolean): number {
  const side = edge.replace(/^(top|bottom)-/, '');
  const start = rtl ? to : from;
  const end = rtl ? from : to;
  if (side === 'left' || side === 'align-left') return from;
  if (side === 'right' || side === 'align-right') return to;
  if (side === 'start' || side === 'align-start') return start;
  if (side === 'end' || side === 'align-end') return end;
  return (from + to) / 2;
}

/**
 * Where element `el` of a slot goes: its zone, its point across the page
 * and the page edge it hangs from. `all` are the slot's elements, for an
 * element anchored to another (it goes beside that one).
 */
export function placeElement(el: ResolvedDesignElement, all: readonly ResolvedDesignElement[], page: PageBox, u: Units, seen = new Set<string>()): Placed {
  const placement = 'placement' in el ? el.placement : undefined;
  const anchor = placement?.anchor;
  const edge = anchor?.edge ?? 'top';
  if (anchor?.to.startsWith('#')) {
    const ref = all.find((e) => e.id === anchor.to.slice(1));
    if (ref && !seen.has(ref.id)) {
      seen.add(el.id);
      const at = placeElement(ref, all, page, u, seen);
      // Beside the other element: just after or before it in its zone.
      const step = edge === 'left-of' ? -1 : 1;
      return { ...at, x: at.x + step, target: at.target };
    }
  }
  const W = page.width;
  const { left, right } = page.margins;
  // The frame the anchor names: the trim, the outer margin or the text area.
  let from = 0;
  let to = W;
  if (anchor?.to === 'container') {
    from = left;
    to = W - right;
  } else if (anchor?.to === 'outer') {
    const outerRight = page.recto !== page.rightBound;
    from = outerRight ? W - right : 0;
    to = outerRight ? W : left;
  }
  // An offset along a start or end edge runs from the start side.
  const side = edge.replace(/^(top|bottom)-/, '');
  const flip = page.rtl && (side === 'start' || side === 'end') ? -1 : 1;
  const point = across(edge, from, to, page.rtl) + flip * px(u, placement?.offset?.x);
  const size = placement?.size?.width;
  const width = size === 'fill' ? to - from : size && typeof size === 'object' && 'unit' in size ? px(u, size) : 0;
  const align = 'align' in el ? el.align : 'left';
  const startsRight = page.rtl ? align === 'start' || align === 'left' : align === 'end' || align === 'right';
  // The element's box hangs from the anchor point by its own matching
  // point (its right side from a right edge, its middle from a middle);
  // the text is set from the box's start, end or middle.
  let x = point;
  if (width > 0) {
    const s = side.replace(/^align-/, '');
    const hang = s === 'left' || s === 'right' ? s : s === 'start' ? (page.rtl ? 'right' : 'left') : s === 'end' ? (page.rtl ? 'left' : 'right') : 'middle';
    const boxLeft = hang === 'right' ? point - width : hang === 'left' ? point : point - width / 2;
    x = boxLeft + (align === 'center' || align === 'justify' ? width / 2 : startsRight ? width : 0);
  }
  let zone: Zone;
  const middle = W / 2;
  if ((align === 'center' || align === 'justify') && Math.abs(x - middle) < W * 0.2) zone = 'center';
  else if (x < W * 0.4) zone = 'left';
  else if (x > W * 0.6) zone = 'right';
  else zone = 'center';
  const target = anchor?.to === 'container' ? undefined : vertical(edge);
  return { zone, x, ...(target ? { target } : {}) };
}
