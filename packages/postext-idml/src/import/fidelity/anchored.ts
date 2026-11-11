// Where an anchored object stands.
//
// An object anchored at a custom position (`AnchoredPosition="Anchored"`)
// hangs beside its text: in the margin, against an edge of the frame or
// of the page, level with the line of its anchor or with the frame. IDML
// stores the rule, not the place (the item's own transform is not where
// InDesign composes it), so the place is worked out here from the rule:
// a point of the object (`AnchorPoint`) is put on a point of a reference
// box (the text frame, its column, the page's margins or the page, by
// `HorizontalAlignment` and `VerticalAlignment`), moved by the offsets.
//
// Across, the place is exact. Down, it is exact when the rule refers to
// the frame or the page; when it refers to the line of the anchor it is
// as good as the caller's estimate of where that line falls, since IDML
// does not say where lines are.

import type { IdmlPage, IdmlPageItem } from '../../model/document.js';
import { boxHeight, boxWidth, decompose, pathExtent, type Box } from '../../model/geometry.js';
import { pageSize } from '../../resolve/geometry.js';
import type { Context } from '../context.js';
import { bodyPages } from '../pagesetup.js';

export interface AnchorHost {
  /** The text frame the anchor stands in, and the column of it, in page
   *  coordinates. */
  frame: Box;
  column: Box;
  page: IdmlPage;
  /** Where the baseline of the anchor's line is taken to be (page y). */
  baseline: number;
  /** Size and leading of the anchor's line. */
  size: number;
  leading: number;
}

/** The type area of a page: mirrored margins name the inside one `left`. */
export function typeArea(page: IdmlPage): Box {
  const size = pageSize(page);
  const m = page.margins;
  const left = page.side === 'left' ? m.right : m.left;
  const right = page.side === 'left' ? size.width - m.left : size.width - m.right;
  return { left: Math.min(left, right), top: m.top, right: Math.max(left, right), bottom: size.height - m.bottom };
}

const number = (v: string | undefined): number => {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : 0;
};

/** The object's own size on the page (its frame, scaled as placed). */
export function anchoredSize(item: IdmlPageItem): { width: number; height: number } | undefined {
  const own = pathExtent(item.paths);
  if (!own) return undefined;
  const d = decompose(item.transform);
  const width = boxWidth(own) * (Number.isFinite(d.scaleX) ? Math.abs(d.scaleX) : 1);
  const height = boxHeight(own) * (Number.isFinite(d.scaleY) ? Math.abs(d.scaleY) : 1);
  return width > 0.01 && height > 0.01 && Number.isFinite(width) && Number.isFinite(height) ? { width, height } : undefined;
}

/** The side of its text a custom-anchored object hangs at: `left` or
 *  `right` of the reference it is aligned to, undefined when centred or
 *  placed from the anchor itself. `mirrored`: the rule is relative to
 *  the spine, so the side swaps from a recto to a verso. */
export function anchoredSide(item: IdmlPageItem): { side?: 'left' | 'right'; mirrored: boolean } {
  const p = item.anchored?.props ?? {};
  const mirrored = p.SpineRelative === 'true';
  if (p.HorizontalReferencePoint === 'AnchorLocation') return { mirrored };
  if (p.HorizontalAlignment === 'LeftAlign' || p.HorizontalAlignment === 'TextAlign') return { side: 'left', mirrored };
  if (p.HorizontalAlignment === 'RightAlign') return { side: 'right', mirrored };
  return { mirrored };
}

/** The box of a custom-anchored object on its host's page. `estimated`:
 *  its height on the page hangs on the host's estimate of the anchor's
 *  line (or the rule is placed from the anchor's own place across). */
export function anchoredPlace(item: IdmlPageItem, host: AnchorHost): { box: Box; estimated: boolean } | undefined {
  const p = item.anchored?.props;
  const size = anchoredSize(item);
  if (!p || !size) return undefined;
  const page = pageSize(host.page);
  const whole: Box = { left: 0, top: 0, right: page.width, bottom: page.height };
  const margins = typeArea(host.page);
  let estimated = false;
  // A rule relative to the spine is drawn for a recto and mirrored on a verso.
  const flip = p.SpineRelative === 'true' && host.page.side === 'left';

  // The point of the object that is placed: 0 its left or top, 1 its right or bottom.
  const point = p.AnchorPoint ?? 'TopLeftAnchor';
  let px = /Left/.test(point) ? 0 : /Right/.test(point) ? 1 : 0.5;
  const py = /^Top/.test(point) ? 0 : /^Bottom/.test(point) ? 1 : 0.5;
  if (flip) px = 1 - px;

  // Across.
  const hRef = p.HorizontalReferencePoint === 'PageEdge' ? whole : p.HorizontalReferencePoint === 'PageMargins' ? margins : p.HorizontalReferencePoint === 'ColumnEdge' ? host.column : host.frame;
  let align = p.HorizontalAlignment === 'RightAlign' ? 1 : p.HorizontalAlignment === 'CenterAlign' ? 0.5 : 0;
  if (flip) align = 1 - align;
  if (p.HorizontalReferencePoint === 'AnchorLocation') estimated = true;
  // A positive offset moves the object away from the edge it is aligned
  // to (out to the left of a left edge), to the right when centred.
  const dx = number(p.AnchorXoffset) * (align === 0 ? -1 : 1);
  const x = hRef.left + boxWidth(hRef) * align + dx - px * size.width;

  // Down.
  let y: number;
  const vRef = p.VerticalReferencePoint ?? 'LineBaseline';
  const dy = number(p.AnchorYoffset);
  const box = vRef === 'PageEdge' ? whole : vRef === 'PageMargins' ? margins : vRef === 'TextFrame' ? host.frame : vRef === 'ColumnEdge' ? host.column : undefined;
  if (box) {
    const valign = p.VerticalAlignment === 'BottomAlign' ? 1 : p.VerticalAlignment === 'CenterAlign' ? 0.5 : 0;
    y = box.top + boxHeight(box) * valign + dy - py * size.height;
  } else {
    estimated = true;
    // The line's own reference: its baseline, or a height above it.
    const up = vRef === 'LineXheight' ? host.size * 0.47 : /Cap/i.test(vRef) ? host.size * 0.68 : vRef === 'TopOfLeading' ? host.leading * 0.8 : 0;
    y = host.baseline - up + dy - py * size.height;
    // Kept between the top and the foot of its column.
    if (p.PinPosition !== 'false') y = Math.max(host.column.top, Math.min(y, host.column.bottom - size.height));
  }
  if (![x, y].every(Number.isFinite)) return undefined;
  // What falls off the sheet is pulled back on it.
  const left = Math.max(0, Math.min(x, page.width - size.width));
  const top = Math.max(0, Math.min(y, page.height - size.height));
  return { box: { left, top, right: left + size.width, bottom: top + size.height }, estimated };
}

/** The width of a column of the book's body pages. */
export function bodyColumnWidth(ctx: Context): number {
  const page = bodyPages(ctx)[0];
  if (!page) return 0;
  const area = typeArea(page);
  const n = Math.max(1, page.margins.columnCount);
  return Math.max(0, (boxWidth(area) - page.margins.columnGutter * (n - 1)) / n);
}

/** In a flowing book: the attributes that set a custom-anchored box at
 *  the side of the column it hangs at, the text running beside it.
 *  Undefined for an object as wide as the column, or centred. */
export function besideColumn(ctx: Context, item: IdmlPageItem): { side: 'left' | 'right'; share: number } | undefined {
  const size = anchoredSize(item);
  const column = bodyColumnWidth(ctx);
  const { side } = anchoredSide(item);
  if (!size || !side || !(column > 0)) return undefined;
  const share = Math.round((size.width / column) * 100) / 100;
  if (share >= 0.85 || share < 0.05) return undefined;
  return { side, share };
}
