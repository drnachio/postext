// A float that misses the page citing it (`layout.pullFloatsToCitation`,
// #1492): the pass records how much room that page lacked for it, which the
// driver tries to win back by setting the page's paragraphs tighter
// (`build/floatPull.ts`); and, for the pictures the driver names
// (`PassHints.pullCrop`), it crops the picture within its safe area to stay
// there. Part of the placement pass, beside floatPlace.ts.
import type { VDTPage, VDTColumn, ResolvedConfig, ResolvedResourceBlock } from '../../../../vdt.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';
import type { FloatSlotPosition } from '../../../floats/floatSlots.js';
import type { PlaceResult } from '../types.js';
import type { FloatPlaceDeps } from './floatPlace.js';

/** Places a float in a slot of a page (`placeFloatInColumns`). */
export type FloatSlotPlacer = (
  page: VDTPage,
  f: PlannedFloat,
  targetCols: readonly VDTColumn[],
  position: FloatSlotPosition,
  pageSpan: boolean,
  mode: 'fresh' | 'strict',
  anchorToCap?: boolean,
  side?: boolean,
  refY?: number,
) => PlaceResult;

/** What {@link withCitationPull} takes from the pass. */
export interface CitationPullDeps {
  resolved: ResolvedConfig;
  /** Pictures the driver lets the pass crop to stay on their citing page. */
  pullCrop: ReadonlySet<string> | undefined;
  /** Px a picture's body is set shorter (negative) by that crop; read by
   *  the float measure. */
  bodyCropDelta: Map<string, number>;
  /** Floats that missed the page citing them in this pass: that page, and
   *  how many px its best slot lacked for them. */
  pullShortfalls: Map<string, { page: number; px: number }>;
  layoutFloat: (resourceId: string, width: number) => { block: ResolvedResourceBlock } | null;
  probeFloatBand: FloatPlaceDeps['probeFloatBand'];
}

/** Shares of what the safe area lets a picture lose, tried in turn: the
 *  least crop that keeps it on its page. */
const CROP_SHARES = [0.25, 0.5, 0.75, 1];

/**
 * `place` with what `layout.pullFloatsToCitation` adds to it: a float
 * deferred from a slot of the page that cites it records how far it was
 * from fitting there, measured as that slot measures it (its width, its
 * caption, the band's gaps and grid rounding); and a picture the driver
 * allows (`pullCrop`) is cropped within its safe area, no more than it
 * needs, to take the slot. Without the option the pass places as before.
 */
export function withCitationPull(place: FloatSlotPlacer, deps: CitationPullDeps): FloatSlotPlacer {
  const { resolved, pullCrop, bodyCropDelta, pullShortfalls, layoutFloat, probeFloatBand } = deps;
  if (!resolved.layout.pullFloatsToCitation) return place;
  /** A picture's natural block at a width, laid out once per pass. */
  const naturalFloats = new Map<string, ResolvedResourceBlock | null>();
  /** Slots where a picture's crop was tried (a slot offered again after it
   *  failed has no more room). */
  const cropTried = new Set<string>();
  return (page, f, targetCols, position, pageSpan, mode, anchorToCap = false, side = false, refY) => {
    const r = place(page, f, targetCols, position, pageSpan, mode, anchorToCap, side, refY);
    if (r !== 'defer' || mode !== 'strict' || f.refPageIndex !== page.index) return r;
    if (f.callout || f.rotate || f.plate || side || bodyCropDelta.has(f.resourceId)) return r;
    const first = targetCols[0];
    const probe = first ? probeFloatBand(page, f, targetCols, position, pageSpan, anchorToCap, side, refY) : null;
    if (!first || !probe) return r;
    if (pullCrop?.has(f.resourceId)) {
      const tryKey = `${f.resourceId}:${page.index}:${first.index}:${position}`;
      if (!cropTried.has(tryKey)) {
        cropTried.add(tryKey);
        const key = `${f.resourceId}:${probe.width.toFixed(2)}`;
        let natural = naturalFloats.get(key);
        if (natural === undefined) {
          natural = layoutFloat(f.resourceId, probe.width)?.block ?? null;
          naturalFloats.set(key, natural);
        }
        const shrink = natural?.bodyFlex && !natural.rotation ? natural.bodyFlex.shrink : 0;
        if (shrink > 0.5) {
          for (const share of CROP_SHARES) {
            bodyCropDelta.set(f.resourceId, -shrink * share);
            const cropped = place(page, f, targetCols, position, pageSpan, mode, anchorToCap, side, refY);
            if (cropped !== 'defer' && cropped !== 'skip') return cropped;
            bodyCropDelta.delete(f.resourceId);
          }
        }
      }
    }
    // What this slot lacked, at the float's own width: the driver tries to
    // win that back only when it is little.
    const avail = Math.min(...targetCols.map((c) => c.availableHeight));
    const short = Math.max(1, probe.need - avail);
    const known = pullShortfalls.get(f.resourceId);
    if (!known || known.page !== page.index || short < known.px) pullShortfalls.set(f.resourceId, { page: page.index, px: short });
    return r;
  };
}
