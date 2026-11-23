/**
 * A cover's text boxes as frames of the cover's page template (#1679): a
 * box anchored to a zone or to another box, continued in another box,
 * grown up to a height and with its text shrunk, all of it the composed
 * page's own frame features (`placement.anchor`, `next`, `maxHeight`,
 * `fit`), which `layoutComposedPage` lays out. This file only writes the
 * frames, and works out where each box stands for the Sandbox's designer
 * and for a box a frame anchor cannot place (a turned one).
 */

import type { FrameConfig } from '../composed/types/frames.js';
import { anchorOn } from '../composed/geometry.js';
import type { AnchorEdge, Dimension } from '../types.js';
import type { CoverAnchorEdge, CoverTextFrame } from '../types/output/cover.js';
import type { ProductionSheet, SheetRect } from './geometry.js';
import { finite, isSafeId } from './svgSafe.js';

const mm = (value: number): Dimension => ({ value: Math.round(finite(value) * 1000) / 1000, unit: 'mm' });

/** The nine points of a zone's or a box's grid. */
export const COVER_GRID_EDGES: readonly CoverAnchorEdge[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
/** The points beside another box. */
export const COVER_BESIDE_EDGES: readonly CoverAnchorEdge[] = ['right-of', 'left-of', 'below', 'above'];
const GRID: ReadonlySet<string> = new Set(COVER_GRID_EDGES);
const BESIDE: ReadonlySet<string> = new Set(COVER_BESIDE_EDGES);

/** Something a text box asks that the cover cannot do. */
export type CoverTextBoxIssue =
  /** An anchor to nothing the sheet has, to the box itself, through a
   *  loop of boxes, or at a point the zone has not (`below` a zone): the
   *  box stands on its `rect`. */
  | { kind: 'coverTextBoxAnchor'; name: string; to: string }
  /** A continuation into no other box, into itself or back into a box of
   *  its own chain: the box's text does not go on. */
  | { kind: 'coverTextBoxNext'; name: string; next: string };

/** A box whose rotation the frame takes. */
const turnOf = (box: CoverTextFrame): 90 | -90 | undefined => (box.rotate === 90 || box.rotate === -90 ? box.rotate : undefined);

const rectOf = (box: CoverTextFrame): SheetRect => ({
  x: finite(box.rect?.x),
  y: finite(box.rect?.y),
  width: Math.max(0, finite(box.rect?.width)),
  height: Math.max(0, finite(box.rect?.height)),
});

/** `w` × `h` placed at `edge` of `ref` (another box when `beside`), moved
 *  by `x`, `y`: the composed page's own anchor rule. */
function placedAt(edge: CoverAnchorEdge, ref: SheetRect, beside: boolean, w: number, h: number, x: number, y: number): SheetRect {
  const a = anchorOn(edge as AnchorEdge, ref, beside);
  const ax = a.x + x;
  const ay = a.y + y;
  return {
    x: a.pinX === 'start' ? ax : a.pinX === 'end' ? ax - w : ax - w / 2,
    y: a.pinY === 'start' ? ay : a.pinY === 'end' ? ay - h : ay - h / 2,
    width: w,
    height: h,
  };
}

/** The text boxes the cover keeps: named as ids, once, and not as a zone
 *  (`zones`); and the names of the ones it leaves out. */
export function keptCoverTextBoxes(boxes: readonly CoverTextFrame[] | undefined, zones: Iterable<string>): { boxes: CoverTextFrame[]; dropped: string[] } {
  const names = new Set<string>(zones);
  const kept: CoverTextFrame[] = [];
  const dropped: string[] = [];
  for (const box of boxes ?? []) {
    if (!isSafeId(box?.name) || names.has(box.name)) {
      dropped.push(String(box?.name ?? ''));
      continue;
    }
    names.add(box.name);
    kept.push(box);
  }
  return { boxes: kept, dropped };
}

export interface ResolvedCoverTextBoxes {
  /** Where each box stands on the sheet, mm from its bleed's corner, at
   *  its own size (before it grows): its `rect`, or where its anchor puts
   *  it. */
  rects: Map<string, SheetRect>;
  /** The anchors kept, by box name. */
  anchors: Map<string, { to: string; zone: boolean }>;
  /** The continuations kept, by box name. */
  next: Map<string, string>;
  issues: CoverTextBoxIssue[];
}

/**
 * Where the text boxes of a sheet stand and which of their anchors and
 * continuations hold. `boxes` are the ones the cover keeps (named once,
 * as ids, no zone's name).
 */
export function resolveCoverTextBoxes(sheet: ProductionSheet, boxes: readonly CoverTextFrame[]): ResolvedCoverTextBoxes {
  const byName = new Map(boxes.map((b) => [b.name, b]));
  const zones = new Map(sheet.zones.map((z) => [z.name as string, z]));
  const rects = new Map<string, SheetRect>();
  const anchors = new Map<string, { to: string; zone: boolean }>();
  const issues: CoverTextBoxIssue[] = [];
  const visiting = new Set<string>();
  const place = (box: CoverTextFrame): SheetRect => {
    const known = rects.get(box.name);
    if (known) return known;
    const own = rectOf(box);
    const a = box.anchor;
    let out = own;
    if (a && typeof a.to === 'string') {
      const zone = zones.get(a.to);
      const other = byName.get(a.to);
      const edge = a.edge;
      const ok = zone ? GRID.has(edge) : other ? GRID.has(edge) || BESIDE.has(edge) : false;
      if (!ok || a.to === box.name || visiting.has(a.to) || (!zone && !other)) {
        issues.push({ kind: 'coverTextBoxAnchor', name: box.name, to: a.to });
      } else {
        visiting.add(box.name);
        const ref = zone ? zone.safe : place(other!);
        visiting.delete(box.name);
        out = placedAt(edge, ref, !zone, own.width, own.height, finite(a.x), finite(a.y));
        anchors.set(box.name, { to: a.to, zone: !!zone });
      }
    }
    rects.set(box.name, out);
    return out;
  };
  // In a loop, the box that closes it is reported and stands on its
  // `rect`; the others hang from it.
  for (const box of boxes) place(box);
  const next = new Map<string, string>();
  for (const box of boxes) {
    if (box.next === undefined) continue;
    const to = box.next;
    let loop = false;
    for (let at: string | undefined = to, n = 0; at !== undefined && n <= boxes.length; at = next.get(at), n++) {
      if (at === box.name) loop = true;
    }
    if (typeof to !== 'string' || to === box.name || !byName.has(to) || loop || [...next.values()].includes(to)) {
      issues.push({ kind: 'coverTextBoxNext', name: box.name, next: String(to) });
      continue;
    }
    next.set(box.name, to);
  }
  return { rects, anchors, next, issues };
}

/** The frame of a text box. A box placed by an anchor the frame can take
 *  (neither it nor the box it hangs from turned) keeps it, so it moves when
 *  that box grows; any other stands where its anchor put it. */
export function coverTextBoxFrame(box: CoverTextFrame, sheet: ProductionSheet, resolved: ResolvedCoverTextBoxes, byName: ReadonlyMap<string, CoverTextFrame>): FrameConfig {
  const r = resolved.rects.get(box.name) ?? rectOf(box);
  const rotate = turnOf(box);
  // A turned box is laid out with its sides swapped, then turned about
  // its centre into the rectangle it was given.
  const w = rotate ? r.height : r.width;
  const h = rotate ? r.width : r.height;
  const anchor = resolved.anchors.get(box.name);
  const a = box.anchor;
  const trim = { x: 0, y: 0, width: sheet.trim.width, height: sheet.trim.height };
  let placement: FrameConfig['placement'];
  if (anchor && a && !rotate && anchor.zone) {
    // A zone is no frame: the anchor is the template area's same point,
    // moved onto the zone's, so the box grows away from it as a frame
    // anchored there would.
    const zone = sheet.zones.find((z) => z.name === anchor.to)!;
    const onZone = anchorOn(a.edge as AnchorEdge, { ...zone.safe, x: zone.safe.x - sheet.trim.x, y: zone.safe.y - sheet.trim.y }, false);
    const onArea = anchorOn(a.edge as AnchorEdge, trim, false);
    placement = { anchor: { to: 'container', edge: a.edge as AnchorEdge }, offset: { x: mm(onZone.x - onArea.x + finite(a.x)), y: mm(onZone.y - onArea.y + finite(a.y)) } };
  } else if (anchor && a && !rotate && !anchor.zone && !turnOf(byName.get(anchor.to)!)) {
    placement = { anchor: { to: `#${anchor.to}`, edge: a.edge as AnchorEdge }, offset: { x: mm(finite(a.x)), y: mm(finite(a.y)) } };
  } else {
    placement = { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(r.x + r.width / 2 - w / 2 - sheet.trim.x), y: mm(r.y + r.height / 2 - h / 2 - sheet.trim.y) } };
  }
  const maxHeight = !rotate && typeof box.maxHeight === 'number' && Number.isFinite(box.maxHeight) && box.maxHeight > h ? box.maxHeight : undefined;
  const fit: NonNullable<FrameConfig['fit']> = {};
  if (box.fit?.shrinkText === false) fit.shrinkText = false;
  const minScale = box.fit?.minScale;
  if (typeof minScale === 'number' && minScale > 0 && minScale <= 1) fit.minScale = minScale;
  const next = resolved.next.get(box.name);
  return {
    name: box.name,
    width: mm(w),
    height: mm(h),
    ...(rotate ? { rotate } : {}),
    ...(box.verticalAlign === 'middle' || box.verticalAlign === 'bottom' ? { verticalAlign: box.verticalAlign } : {}),
    placement,
    ...(maxHeight !== undefined ? { maxHeight: mm(maxHeight) } : {}),
    ...(Object.keys(fit).length ? { fit } : {}),
    ...(next ? { next } : {}),
    optional: true,
  };
}

const MIRROR_EDGE: Record<string, AnchorEdge> = {
  'top-left': 'top-right', 'top-right': 'top-left', left: 'right', right: 'left', 'bottom-left': 'bottom-right', 'bottom-right': 'bottom-left',
  'right-of': 'left-of', 'left-of': 'right-of', 'align-left': 'align-right', 'align-right': 'align-left',
};

/** A frame on a right-to-left page, whose flow is painted mirrored: its
 *  anchor's sides swapped and its offset across turned round, so it lands
 *  where it was placed on the sheet. */
export function mirrorFrame(frame: FrameConfig): FrameConfig {
  const at = frame.placement;
  if (!at) return frame;
  const x = at.offset?.x as Dimension | undefined;
  return {
    ...frame,
    placement: {
      ...at,
      anchor: { ...at.anchor, edge: MIRROR_EDGE[at.anchor.edge] ?? at.anchor.edge },
      offset: { ...at.offset, ...(x ? { x: { ...x, value: -x.value || 0 } } : {}) },
    },
  };
}
