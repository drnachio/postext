/**
 * Float planning (issue #49 §7 — Placement, revised model).
 *
 * In the revised model a resource is *incorporated by reference*: the first
 * time it is mentioned (an inline `:ref` or a `::resource` directive, whichever
 * comes first in reading order) the engine floats it to the first free slot
 * after that reference — the bottom of the referencing column, the top or
 * bottom of the next empty column, or a band of the next page. The author
 * never places it twice and the running text flows past the reference
 * uninterrupted.
 *
 * This module is the pure planning half: it resolves each resource's placement
 * and produces the ordered list of floats with the content-block index of their
 * first reference. The geometry (reserving page bands, positioning the float
 * blocks, deferring overflow to the next page) lives in the build pipeline,
 * which owns the VDT and measurement context.
 */

import type { ContentBlock } from '../parse';
import type {
  Resource,
  ResourceType,
  ResourceFloatPosition,
  ResourceFloatSpan,
  ResourceRotation,
} from '../types';

/** Resolved placement for a resource: never `undefined` fields (but
 *  `rotate`, absent for an upright resource). */
export interface ResolvedPlacement {
  position: ResourceFloatPosition;
  span: ResourceFloatSpan;
  rotate?: ResourceRotation;
  /** Fraction of the slot width the float takes (`1` = the whole width). */
  widthFraction: number;
  align: 'left' | 'center' | 'right';
  captionSide: boolean;
}

/** A planned float: the resource, its resolved placement, and the index of the
 *  content block where it is first referenced (its anchor). `'auto'` takes
 *  the first free slot after the reference (top or bottom); `'top'` /
 *  `'bottom'` restrict the search to that kind of slot. */
export interface PlannedFloat {
  /** Where the flow stood when the float's first reference was reached
   *  (the top of the citing block, on that page): a `span: 'side'` float
   *  stacks no higher than this on that page — beside the text that cites
   *  it. Stamped by the build when the float is enqueued. */
  refPageIndex?: number;
  refY?: number;
  resourceId: string;
  firstBlockIdx: number;
  position: 'auto' | 'top' | 'bottom';
  span: ResourceFloatSpan;
  /** Set turned a quarter turn on the page (always page-span; takes a
   *  whole page). */
  rotate?: ResourceRotation;
  /** Width fraction, alignment and side caption of the placement (see
   *  `ResourcePlacement`). */
  widthFraction?: number;
  align?: 'left' | 'center' | 'right';
  captionSide?: boolean;
  /** For the rest of a table split across pages: the first model row still
   *  to place (the header rows are repeated above it). Absent (or `0`) for
   *  a whole resource. */
  startRow?: number;
  /** For the rest of a split table: where its previous slice went. The
   *  rest never lands before it in reading order — on that page only a
   *  later column's slot will do (a page-span rest waits for the next
   *  page). */
  notBefore?: { pageIndex: number; columnIndex: number };
  /** A floated `:::callout` (`placement: 'top' | 'bottom'`): the content
   *  index of its opening fence. `resourceId` is then the synthetic
   *  `callout:<startIdx>`; the build keeps the box's layouter by index. */
  callout?: { startIdx: number };
}

/** Resolve a resource's placement: own `placement` → its type's
 *  `defaultPlacement` → the built-in default (`auto` / `column`). A rotated
 *  resource is always a page-span float; an inline (`here`) embed is never
 *  rotated. */
export function resolveResourcePlacement(
  resource: Resource,
  type: ResourceType | undefined,
): ResolvedPlacement {
  const position =
    resource.placement?.position ?? type?.defaultPlacement?.position ?? 'auto';
  const rotate = position === 'here'
    ? undefined
    : (resource.placement?.rotate ?? type?.defaultPlacement?.rotate);
  const span = rotate ? 'page' : (resource.placement?.span ?? type?.defaultPlacement?.span ?? 'column');
  const rawWidth = resource.placement?.width ?? type?.defaultPlacement?.width;
  const widthFraction = typeof rawWidth === 'number' && rawWidth > 0 && rawWidth < 1 ? rawWidth : 1;
  const align = resource.placement?.align ?? type?.defaultPlacement?.align ?? 'left';
  const captionSide = resource.placement?.captionSide ?? type?.defaultPlacement?.captionSide ?? false;
  return { position, span, widthFraction, align, captionSide, ...(rotate ? { rotate } : {}) };
}

/**
 * Walk the parsed blocks in reading order and produce the floats to place, in
 * first-reference order. A resource is floated when its resolved position is
 * `'top'` or `'bottom'`; `'here'` resources are left for inline `::resource`
 * placement and are not returned here. Resources with an unknown id or type are
 * skipped (the warnings phase surfaces those).
 */
export function computeFloatPlan(
  blocks: ContentBlock[],
  resources: Resource[],
  resourceTypes: ResourceType[],
): PlannedFloat[] {
  const resourceById = new Map<string, Resource>();
  for (const r of resources) resourceById.set(r.id, r);
  const typeById = new Map<string, ResourceType>();
  for (const t of resourceTypes) typeById.set(t.id, t);

  const plan: PlannedFloat[] = [];
  const seen = new Set<string>();

  const record = (resourceId: string, blockIdx: number) => {
    if (seen.has(resourceId)) return;
    seen.add(resourceId);
    const resource = resourceById.get(resourceId);
    if (!resource) return;
    const type = typeById.get(resource.typeId);
    const { position, span, rotate, widthFraction, align, captionSide } = resolveResourcePlacement(resource, type);
    if (position === 'here') return;
    plan.push({
      resourceId, firstBlockIdx: blockIdx, position, span,
      ...(rotate ? { rotate } : {}),
      ...(widthFraction < 1 && !rotate ? { widthFraction, align } : {}),
      ...(captionSide && span === 'column' ? { captionSide } : {}),
    });
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'resourceBlock' && b.resourceId) record(b.resourceId, i);
    for (const span of b.spans) {
      if (span.ref?.resourceId) record(span.ref.resourceId, i);
    }
  }

  return plan;
}

/** The set of resource ids that float (so the build loop can skip their inline
 *  `::resource` placement). Derived from a {@link computeFloatPlan} result. */
export function floatedResourceIds(plan: PlannedFloat[]): Set<string> {
  return new Set(plan.map((f) => f.resourceId));
}
