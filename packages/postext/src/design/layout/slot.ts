// layoutDesignSlot: elements placed in dependency order, sized to one
// another, connectors drawn between them, and elements dropped on a fence
// (#1276: split out of layout.ts).
import { getMeasureWritingMode } from '../../measure/vertical.js';
import { edgeSide, sideFraction, isLogicalEdge, physicalPlacement } from '../logicalEdges.js';
import type { AnchorEdge, ElementSize, ElementSizeTo, ResolvedPlacedDesignElement, ElementPlacement, ResolvedDesignConnectorElement, ResolvedDesignElement, ResolvedDesignSlot } from '../../types.js';
import { type DesignPlaceholderContext, resolveDesignText, LEADER_MARK, resolveDesignResourceId } from '../placeholders.js';
import { type ConnectorEndBox, layoutConnector } from '../connector.js';
import { FENCE_CONDITION_CONTEXTS, fenceConditionMet } from '../fenceCondition.js';
import { repeatInstance } from '../../composed/templates.js';
import { getCjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { plainDesignText } from '../richText.js';
import { layoutVerticalTextElement, layoutLeaderTextElement, layoutRuleElement, layoutPathElement, layoutImageElement, layoutBoxElement } from './elements.js';
import { type AnchorResult, type AnchorReference, anchorTargetId, sizeTargetIds, topoSort, frameFor, ELEMENT_TO_ELEMENT_EDGES, resolveElementAnchor, resolveContainerAnchor, dimPx } from './geometry.js';
import { type ResolvedPrimitive, type DesignFrames, type LayoutIssue, type ResolvedPathPrimitive, type LayoutContext, type DesignSlotLayout, pageMatchesParity, pageMatchesRole, applyPaletteOverrides } from './primitives.js';
import { mirroredTextSeams } from './text.js';
import { layoutTextElement } from './textElement.js';

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/**
 * `anchor` (the point of `edge` on `ref`) moved along the side the edge
 * stands on to `at` (#1055): from the side's start — the left of a top or
 * bottom side, its right when the page starts on the right (`startRight`),
 * the top of a left or right side — a fraction of its length. Along the
 * side the element is centred on that point (a rule's thickness on a
 * frame's middle); across it the edge's pin stays (`below` hangs under the
 * side, `bottom` stands inside on it). `center`, and an `at` that is no
 * side position, leave the anchor as it is.
 */
function alongSide(anchor: AnchorResult, edge: AnchorEdge, at: unknown, ref: AnchorReference, startRight: boolean): AnchorResult {
  const side = edgeSide(edge);
  const f = sideFraction(at);
  if (!side || f === undefined) return anchor;
  if (side === 'left' || side === 'right') return { ...anchor, anchorY: ref.y + f * ref.height, pinY: 'middle' };
  return { ...anchor, anchorX: ref.x + (startRight ? 1 - f : f) * ref.width, pinX: 'middle' };
}

/** A size written as `{ to, edge }` (#928). */
export function isSizeTo(size: ElementSize | undefined): size is ElementSizeTo {
  return typeof size === 'object' && size !== null && 'to' in size && 'edge' in size;
}

/** `el` with each size written as `{ to, edge }` (#928) turned into the px
 *  from its anchor point (`pin`) to that edge of the box `refOf` gives:
 *  towards the side the element grows (down for a top pin, up for a foot
 *  pin, both ways from a middle one), 0 when the edge is behind it. A box
 *  that cannot be found, or an edge across the size's axis, reads as
 *  `'fill'`. */
function withSizesTo<T extends ResolvedPlacedDesignElement>(
  el: T,
  pin: AnchorResult,
  refOf: (to: ElementSizeTo['to']) => AnchorReference | undefined,
): T {
  const size = el.placement.size;
  if (!size || (!isSizeTo(size.width) && !isSizeTo(size.height) && !isSizeTo(size.maxWidth))) return el;
  const along = (s: ElementSizeTo, axis: 'x' | 'y'): ElementSize => {
    const ref = refOf(s.to);
    // `center` (#1055): the box's middle on the axis being sized.
    const edges: Record<string, number> = axis === 'x' ? { left: 0, center: 0.5, right: 1 } : { top: 0, center: 0.5, bottom: 1 };
    const side = Object.prototype.hasOwnProperty.call(edges, s.edge) ? edges[s.edge] : undefined;
    if (!ref || side === undefined) return 'fill';
    const at = axis === 'x' ? ref.x + side * ref.width : ref.y + side * ref.height;
    const from = axis === 'x' ? pin.anchorX : pin.anchorY;
    const p = axis === 'x' ? pin.pinX : pin.pinY;
    const room = p === 'start' ? at - from : p === 'end' ? from - at : 2 * Math.abs(at - from);
    return { value: Math.max(0, room), unit: 'px' };
  };
  const out: NonNullable<ElementPlacement['size']> = { ...size };
  if (isSizeTo(size.width)) out.width = along(size.width, 'x');
  if (isSizeTo(size.height)) out.height = along(size.height, 'y');
  if (isSizeTo(size.maxWidth)) out.maxWidth = along(size.maxWidth, 'x');
  return { ...el, placement: { ...el.placement, size: out } };
}

/**
 * A connector (#1056) between the boxes it names: another element of the
 * slot, else a frame or group of the page (`frames.named`, or the declared
 * boxes with `pin`). `#card[*]` in `to` is every instance of `card` the
 * page has, in item order. An end on a box the page does not show (absent
 * from `named`, or in `frames.absent`) is dropped with a
 * `connectorDropped` issue; with no `from` or no `to` left nothing is
 * drawn.
 */
function layoutConnectorElement(
  el: ResolvedDesignConnectorElement,
  resolvedGeo: ReadonlyMap<string, ResolvedPrimitive>,
  frames: DesignFrames,
  issues: LayoutIssue[],
  dpi: number,
  startRight: boolean,
): ResolvedPathPrimitive | undefined {
  const boxes = (el.pin ? frames.declared : undefined) ?? frames.named ?? {};
  const boxOf = (name: string): ConnectorEndBox['box'] | undefined => {
    const dep = resolvedGeo.get(name);
    if (dep) return { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
    if (frames.absent?.has(name)) return undefined;
    return Object.prototype.hasOwnProperty.call(boxes, name) ? boxes[name] : undefined;
  };
  const endOf = (end: unknown): ConnectorEndBox | undefined | null => {
    const to = (end as { to?: unknown } | null | undefined)?.to;
    if (typeof to !== 'string' || !to.startsWith('#')) return null;
    const name = to.slice(1);
    const box = boxOf(name);
    if (!box) {
      issues.push({ kind: 'connectorDropped', elementId: el.id, targetId: name });
      return undefined;
    }
    const anchor = (end as { anchor?: unknown }).anchor;
    if (typeof anchor === 'string' && anchor !== '' && !resolvedGeo.has(name)) {
      // An anchor of the frame's picture (#1057): the end is that point, a
      // box of no size the line arrives at.
      const at = frames.anchorPoint?.(name, anchor) ?? { known: [] };
      if ('hidden' in at) {
        // The point is cut off by its frame (a picture past the frame's
        // foot): nothing to point at on this page.
        issues.push({ kind: 'connectorDropped', elementId: el.id, targetId: name });
        return undefined;
      }
      if (!('x' in at)) {
        issues.push({ kind: 'connectorAnchorUnknown', elementId: el.id, targetId: name, anchor, ...(at.resourceId !== undefined ? { resourceId: at.resourceId } : {}), known: at.known });
        return undefined;
      }
      return { name, box: { x: at.x, y: at.y, width: 0, height: 0 }, end: end as ConnectorEndBox['end'] };
    }
    return { name, box, end: end as ConnectorEndBox['end'] };
  };
  const from = endOf(el.from);
  if (!from) return undefined;
  const written = Array.isArray(el.to) ? el.to : el.to ? [el.to] : [];
  const ends: ConnectorEndBox[] = [];
  for (const end of written) {
    const to = (end as { to?: unknown } | null | undefined)?.to;
    if (typeof to === 'string' && to.endsWith('[*]')) {
      // Every instance of the frame the page has (#1061), in item order.
      const frame = to.slice(1, -3);
      const items = Object.keys(boxes)
        .map((n) => ({ n, at: repeatInstance(n) }))
        .filter((x) => x.at?.frame === frame)
        .sort((a, b) => a.at!.item - b.at!.item);
      for (const { n } of items) {
        const e = endOf({ ...(end as object), to: `#${n}` });
        if (e) ends.push(e);
      }
      continue;
    }
    const e = endOf(end);
    if (e) ends.push(e);
  }
  return layoutConnector(el, from, ends, { dpi, startRight });
}

/** The elements a page's fence lets draw (#1087): a running head's or a
 *  composed page's decoration leaves out an element whose `when` the fence
 *  does not set or whose `unless` it does, and with it every element placed
 *  on it or sized to it (as a frame that takes no room drops what hangs
 *  from it). Other slots (heading, part and box designs) ignore the
 *  condition. The same array when nothing is left out. */
function drawnOnFence<E extends ResolvedDesignElement>(elements: readonly E[], placeholders: DesignPlaceholderContext, own?: ReadonlyMap<string, Readonly<Record<string, string>>>): readonly E[] {
  if (!FENCE_CONDITION_CONTEXTS.has(placeholders.kind)) return elements;
  const dropped = fenceDroppedIds(elements, placeholders.pageAttrs, own);
  return dropped.size === 0 ? elements : elements.filter((el) => !dropped.has(el.id));
}

/** The ids of the elements a page fence with `attrs` leaves out (#1087):
 *  those whose `when` it does not set or whose `unless` it does, and every
 *  element placed on one of them or sized to it. `own` (#1189): the
 *  attributes an element reads first (a module's fence). Empty when
 *  nothing is left out. */
export function fenceDroppedIds(
  elements: readonly ResolvedDesignElement[],
  attrs: Readonly<Record<string, string>> | undefined,
  own?: ReadonlyMap<string, Readonly<Record<string, string>>>,
): Set<string> {
  const dropped = new Set<string>();
  if (!elements.some((el) => el.when !== undefined || el.unless !== undefined)) return dropped;
  for (const el of elements) {
    const first = own?.get(el.id);
    if (!fenceConditionMet(el, first ? { ...attrs, ...first } : attrs)) dropped.add(el.id);
  }
  if (dropped.size === 0) return dropped;
  for (let changed = true; changed; ) {
    changed = false;
    for (const el of elements) {
      if (dropped.has(el.id) || el.kind === 'connector') continue;
      const target = anchorTargetId(el.placement);
      if ((target !== undefined && dropped.has(target)) || sizeTargetIds(el.placement).some((id) => dropped.has(id))) {
        dropped.add(el.id);
        changed = true;
      }
    }
  }
  return dropped;
}

/** Layout one design slot against its container. */
export function layoutDesignSlot(
  slot: ResolvedDesignSlot,
  context: LayoutContext,
  pageIndex: number,
): DesignSlotLayout {
  const issues: LayoutIssue[] = [];
  const containerRef: AnchorReference = {
    x: context.container.x,
    y: context.container.y,
    width: context.container.width,
    height: context.container.height,
  };

  // Filter by parity and page role first; then let the current part's
  // palette overrides recolour the palette-linked colours.
  const overrides = context.placeholders.partPaletteByPageIndex?.[context.placeholders.page.index];
  // A module's elements (#1189) read its fence's attributes first.
  const ownPlaceholders = new Map<string, DesignPlaceholderContext>();
  const placeholdersOf = (el: ResolvedDesignElement): DesignPlaceholderContext => {
    const own = context.elementAttrs?.get(el.id);
    if (!own) return context.placeholders;
    let ctx = ownPlaceholders.get(el.id);
    if (!ctx) {
      ctx = { ...context.placeholders, pageAttrs: { ...context.placeholders.pageAttrs, ...own } };
      ownPlaceholders.set(el.id, ctx);
    }
    return ctx;
  };
  const candidates = drawnOnFence(slot.elements, context.placeholders, context.elementAttrs)
    .filter((el) => pageMatchesParity(pageIndex, el.parity) && pageMatchesRole(el.pages, context.pageRole))
    .map((el) => (overrides && Object.keys(overrides).length > 0 ? applyPaletteOverrides(el, overrides) : el))
    // Start and end edges read as the physical ones of this page (#936).
    .map((el) => (el.kind !== 'connector' && isLogicalEdge(el.placement.anchor.edge) ? { ...el, placement: physicalPlacement(el.placement, context.startRight === true) } : el));
  // Connectors (#1056) are laid after every placed element, between the
  // boxes they join; only where there are frames to join (a composed
  // page's decoration).
  const placed = candidates.filter((el): el is ResolvedPlacedDesignElement => el.kind !== 'connector');

  // Topologically sort (dependencies first) to resolve geometry; paint
  // order is still the array order (first = back), restored below.
  const ordered = topoSort(placed, issues, context.frames?.named);

  // Precompute: resolved text contents (placeholder-expanded), with the
  // `\n` escape of the template and of attribute values turned into a
  // newline before any case transform (which would make it `\N`).
  const textContent = new Map<string, string>();
  for (const el of ordered) {
    if (el.kind === 'text') {
      const text = resolveDesignText(el.content, placeholdersOf(el), el.inlineMarks === true);
      textContent.set(el.id, el.textTransform === 'uppercase' ? text.toLocaleUpperCase() : text);
    }
  }
  // Where a number the layout wrote meets a text mirrored from the
  // document in each printed text (#724): Japanese text only, whose rule
  // for a 、 between two kanji numerals would read across the two.
  const textSeams = new Map<string, number[]>();
  if (getCjkComposition().region === 'japan') {
    for (const el of ordered) {
      if (el.kind !== 'text') continue;
      const seams = mirroredTextSeams(el, textContent.get(el.id) ?? '', placeholdersOf(el));
      if (seams.length > 0) textSeams.set(el.id, seams);
    }
  }

  const resolvedGeo = new Map<string, ResolvedPrimitive>();
  // Primitives per element, keyed by the element itself (a text element may
  // emit several: drop cap, rich runs…), emitted in `candidates` order.
  const primsByElement = new Map<ResolvedDesignElement, ResolvedPrimitive[]>();
  // The chip styles a heading title's chips are set in (#1162).
  const chipStyles = context.placeholders.heading?.chipStyles;
  const textFrame = chipStyles ? { ...context, chipStyles } : context;

  for (const given of ordered) {
    const target = anchorTargetId(given.placement);
    let refGeo: AnchorReference = containerRef;
    // Page/bleed anchors use that frame both as the anchor reference and as
    // the bounds for `size: 'fill'` / auto-width clamping, so a band can run
    // edge to edge regardless of the slot container.
    let fillRef: AnchorReference = containerRef;
    let useElementEdge = false;
    const frame = frameFor(given.placement, context.frames);
    if (frame) {
      refGeo = frame;
      fillRef = frame;
    } else if (target) {
      const dep = resolvedGeo.get(target);
      const outside = dep ? undefined : (given.pin ? context.frames?.declared?.[target] : undefined) ?? context.frames?.named?.[target];
      if (dep) {
        refGeo = { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
        useElementEdge = true;
      } else if (outside) {
        refGeo = { ...outside };
        // A nine-point edge on a frame is that point of its box; an
        // element edge (`below`, `right-of`…) reads as for an element.
        useElementEdge = ELEMENT_TO_ELEMENT_EDGES.has(given.placement.anchor.edge);
        if (!useElementEdge) fillRef = refGeo;
      }
    }
    const onEdge = useElementEdge
      ? resolveElementAnchor(given.placement.anchor.edge, refGeo)
      : resolveContainerAnchor(given.placement.anchor.edge, refGeo);
    // A point along a side of another element, a frame or a group (#1055).
    const anchor = target && !frame && refGeo !== containerRef && given.placement.anchor.at !== undefined
      ? alongSide(onEdge, given.placement.anchor.edge, given.placement.anchor.at, refGeo, context.startRight === true)
      : onEdge;

    // A text element's offset may be written in ems of its own size (a
    // running head four characters below the type area).
    const emPx = given.kind === 'text' ? dimPx(given.fontSize, context.dpi) : undefined;
    const offsetX = dimPx(given.placement.offset?.x, context.dpi, emPx);
    const offsetY = dimPx(given.placement.offset?.y, context.dpi, emPx);
    const anchorX = anchor.anchorX + offsetX;
    const anchorY = anchor.anchorY + offsetY;
    // A size that runs to an edge of another box (#928), in px from here.
    const el = withSizesTo(given, { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY }, (to) => {
      if (to === 'container') return containerRef;
      if (to === 'page' || to === 'bleed' || to === 'outer') return context.frames?.[to] ?? containerRef;
      const id = to.slice(1);
      const dep = resolvedGeo.get(id);
      if (dep) return { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
      return (given.pin ? context.frames?.declared?.[id] : undefined) ?? context.frames?.named?.[id];
    });

    if (el.kind === 'text') {
      const pin: AnchorResult = { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY };
      // A vertical element in a frame whose text is horizontal (a running
      // head on the sheet, a design of a horizontal page); in a vertical
      // flow the text already runs down.
      const content = textContent.get(el.id) ?? '';
      const turned = el.writingMode === 'vertical-rl' && getMeasureWritingMode() !== 'vertical-rl';
      // A contents part row's `{leader}` (#889), on a horizontal line.
      const leader = context.placeholders.leader;
      const leadered = content.includes(LEADER_MARK) && leader && !turned && getMeasureWritingMode() !== 'vertical-rl';
      const text = leadered ? content : content.split(LEADER_MARK).join('');
      const prims = turned
        ? layoutVerticalTextElement(el, text, pin, fillRef, context.dpi, useElementEdge, textSeams.get(el.id), chipStyles)
        : leadered
          ? layoutLeaderTextElement(el, text, leader, pin, fillRef, context.dpi, useElementEdge, context)
          : layoutTextElement(el, text, pin, fillRef, context.dpi, useElementEdge, textFrame, textSeams.get(el.id));
      resolvedGeo.set(el.id, prims[0]!);
      primsByElement.set(given, prims);
      const truncated = prims[0]!.truncated;
      if (truncated) {
        const text = content.split(LEADER_MARK).join('');
        issues.push({ kind: 'textTruncated', elementId: el.id, mode: truncated, text: el.inlineMarks ? plainDesignText(text, chipStyles !== undefined) : text });
      }
    } else if (el.kind === 'rule') {
      const prim = layoutRuleElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(given, [prim]);
    } else if (el.kind === 'path') {
      // Data that cannot be read draws nothing; the box still stands for
      // the elements anchored to it.
      const prim = layoutPathElement(el, { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      if (prim.subpaths.length > 0) primsByElement.set(given, [prim]);
    } else if (el.kind === 'image') {
      const prim = layoutImageElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi, context.resourceById, resolveDesignResourceId(el.resourceId, placeholdersOf(el)), context.frames?.upright === true);
      if (prim) {
        resolvedGeo.set(el.id, prim);
        primsByElement.set(given, [prim]);
      }
    } else {
      const prim = layoutBoxElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(given, [prim]);
    }
  }

  if (context.frames?.named) {
    for (const el of candidates) {
      if (el.kind !== 'connector') continue;
      const prim = layoutConnectorElement(el, resolvedGeo, context.frames, issues, context.dpi, context.startRight === true);
      if (prim) primsByElement.set(el, [prim]);
    }
  }

  const primitives: ResolvedPrimitive[] = [];
  const elementIds: string[] = [];
  for (const el of candidates) {
    for (const prim of primsByElement.get(el) ?? []) {
      primitives.push(prim);
      elementIds.push(el.id);
    }
  }

  return {
    container: context.container,
    primitives,
    elementIds,
    issues,
  };
}
