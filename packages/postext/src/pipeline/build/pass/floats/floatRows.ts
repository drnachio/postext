// A float's body cropped within its safe area (`Resource.safeArea`) to
// suit where it goes: as tall as its neighbour in a row at the foot of the
// columns (`layout.footFloatRow`), or short enough to stay on the page that
// cites it (`layout.pullFloatsToCitation`). And a foot row's captions set
// level, their first lines on one line.
import type { ResolvedConfig, ResolvedResourceBlock, VDTBlock, VDTColumn, VDTPage } from '../../../../vdt.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';
import type { FloatMeasure, FloatSlotPosition } from '../../../floats/floatSlots.js';
import { offsetBlock } from '../../../callouts/calloutLayout/geometry.js';
import type { PlaceResult } from '../types.js';

type Place = (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean,
  mode: 'fresh' | 'strict', anchorToCap?: boolean, side?: boolean, refY?: number) => PlaceResult;

export interface FloatRowsDeps {
  resolved: ResolvedConfig;
  floatGapPx: number;
  minTextPx: number;
  measureFloat: (resourceId: string, width: number) => FloatMeasure | null;
  layoutFloat: (resourceId: string, width: number) => { block: ResolvedResourceBlock } | null;
  bodyCropDelta: Map<string, number>;
  naturalFloats: Map<string, ResolvedResourceBlock | null>;
  citeCropTried: Set<string>;
  pullShortfalls: Map<string, { page: number; px: number }>;
  floatReserved: Map<VDTColumn, { top: number; bottom: number }>;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number };
  uncappedBottoms: Map<VDTColumn, number>;
}

export function createFloatRows(deps: FloatRowsDeps) {
  const {
    resolved, floatGapPx, minTextPx, measureFloat, layoutFloat, bodyCropDelta, naturalFloats, citeCropTried,
    pullShortfalls, floatReserved, reservedOf, uncappedBottoms,
  } = deps;
  /** The float last set alone at the foot of each column. */
  const feet = new Map<VDTColumn, VDTBlock>();

  /** Whether `col` already holds a float at its foot. */
  const hasFoot = (col: VDTColumn): boolean => feet.has(col);
  /** Record a float set at the foot of `cols`. */
  const noteFoot = (cols: readonly VDTColumn[], block: VDTBlock): void => {
    if (cols.length === 1) feet.set(cols[0]!, block);
    else for (const c of cols) feet.delete(c);
  };

  /** The float a foot row lines a new one in `col` up with: the picture at
   *  the foot of the column before it, on the same page and band. */
  const rowLeaderOf = (page: VDTPage, col: VDTColumn): VDTBlock | undefined => {
    if (!resolved.layout.footFloatRow) return undefined;
    const prev = page.columns.find((c) => c.index === col.index - 1 && c.kind !== 'side' && c.kind !== 'span' && (c.band ?? 0) === (col.band ?? 0));
    const leader = prev ? feet.get(prev) : undefined;
    return leader?.resourceBlock && !leader.resourceBlock.rotation ? leader : undefined;
  };

  /** Where a float alone at the foot of `first` goes so that the first
   *  lines of its caption and its neighbour's stand level (`y` as it is
   *  when there is no row): it rises to its neighbour's, or the neighbour
   *  comes down to it while its column has the room. */
  const levelInRow = (page: VDTPage, first: VDTColumn, block: VDTBlock, y: number): number => {
    if (hasFoot(first)) return y;
    const leader = rowLeaderOf(page, first);
    const capNew = block.resourceBlock?.captionLines[0];
    const bodyNew = block.resourceBlock?.bodyRect;
    const capLead = leader?.resourceBlock!.captionLines[0];
    if (!leader || !capNew || !bodyNew || !capLead || capNew.bbox.y <= bodyNew.y
      || capLead.bbox.y - leader.bbox.y <= leader.resourceBlock!.bodyRect.y) return y;
    const target = capLead.bbox.y - capNew.bbox.y;
    const lift = (col: VDTColumn, d: number) => {
      col.bbox.height = Math.max(0, col.bbox.height - d);
      col.availableHeight = Math.max(0, col.availableHeight - d);
      const r = reservedOf(col);
      floatReserved.set(col, { ...r, bottom: r.bottom + d });
    };
    if (target < y - 0.01 && first.availableHeight >= y - target) {
      lift(first, y - target);
      return target;
    }
    const leadCol = page.columns.find((c) => feet.get(c) === leader);
    if (target > y + 0.01 && leadCol && !uncappedBottoms.has(leadCol) && leadCol.availableHeight >= target - y + minTextPx) {
      offsetBlock(leader, 0, -(target - y));
      lift(leadCol, target - y);
    }
    return y;
  };

  /** `placeAt` with the body of a picture cropped within its safe area:
   *  toward its neighbour's height in a foot row, or, on the page citing it
   *  when it misses that page, no more than it needs (its shortfall
   *  recorded for the driver, `pullShortfalls`). */
  const cropping = (placeAt: Place): Place => (page, f, targetCols, position, pageSpan, mode, anchorToCap = false, side = false, refY) => {
    const place = () => placeAt(page, f, targetCols, position, pageSpan, mode, anchorToCap, side, refY);
    const first = targetCols[0];
    if (!first || f.callout || f.rotate || f.plate || side || bodyCropDelta.has(f.resourceId)) return place();
    const natural = () => {
      const key = `${f.resourceId}:${first.bbox.width.toFixed(2)}`;
      let b = naturalFloats.get(key);
      if (b === undefined) {
        b = layoutFloat(f.resourceId, first.bbox.width)?.block ?? null;
        naturalFloats.set(key, b);
      }
      return b?.bodyFlex && !b.rotation ? b : undefined;
    };
    /** Placed with the body `delta` px taller (shorter, negative); the
     *  delta stays only if the float is placed. */
    const placeWith = (delta: number): PlaceResult => {
      bodyCropDelta.set(f.resourceId, delta);
      const r = place();
      if (r === 'defer' || r === 'skip') bodyCropDelta.delete(f.resourceId);
      return r;
    };
    // A foot row: as tall as the neighbour.
    const leader = position === 'bottom' && !pageSpan && targetCols.length === 1 && !hasFoot(first) ? rowLeaderOf(page, first) : undefined;
    const own = leader ? natural() : undefined;
    if (leader && own) {
      const want = leader.resourceBlock!.bodyRect.height - own.bodyRect.height;
      const delta = Math.max(-own.bodyFlex!.shrink, Math.min(own.bodyFlex!.grow, want));
      if (Math.abs(delta) >= 0.5) {
        const r = placeWith(delta);
        if (r !== 'defer' && r !== 'skip') return r;
      }
    }
    if (!resolved.layout.pullFloatsToCitation) return place();
    const r = place();
    if (r !== 'defer' || mode !== 'strict' || f.refPageIndex !== page.index) return r;
    // The page that cites it, a little short: cropped to stay there (a
    // quarter of what the safe area allows at a time), once per slot (the
    // next slot offered has less room still).
    const tryKey = `${f.resourceId}:${page.index}:${first.index}:${position}`;
    if (!citeCropTried.has(tryKey)) {
      citeCropTried.add(tryKey);
      const shrink = natural()?.bodyFlex?.shrink ?? 0;
      if (shrink > 0.5) {
        for (const share of [0.25, 0.5, 0.75, 1]) {
          const cropped = placeWith(-shrink * share);
          if (cropped !== 'defer' && cropped !== 'skip') return cropped;
        }
      }
    }
    // What the citing page lacked for it, at its best slot: the driver
    // tries to win that back only when it is little. (The band takes its
    // gaps and grid rounding on top of the float's height: a float that
    // seems to fit and was refused lacked less than a line.)
    const m = measureFloat(f.resourceId, first.bbox.width);
    if (m) {
      const short = Math.max(1, m.height + floatGapPx - first.availableHeight);
      const known = pullShortfalls.get(f.resourceId);
      if (!known || known.page !== page.index || short < known.px) pullShortfalls.set(f.resourceId, { page: page.index, px: short });
    }
    return r;
  };

  return { hasFoot, noteFoot, levelInRow, cropping };
}
