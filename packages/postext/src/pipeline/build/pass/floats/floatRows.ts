// A row at the foot of the columns (`layout.footFloatRow`): a float that
// takes the foot of a column next to one holding a float at its foot sets
// the first line of its caption level with its neighbour's, and a picture
// with a safe area (`Resource.safeArea`) is cropped within it toward its
// neighbour's height. The floats at each column's foot are the foot stacks'
// (footStack.ts): the row reads its neighbour from them and moves it
// through them. Part of the placement pass, beside floatPlace.ts.
import type { ResolvedConfig, ResolvedResourceBlock, VDTBlock, VDTColumn, VDTPage } from '../../../../vdt.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';
import type { FloatSlotPosition } from '../../../floats/floatSlots.js';
import type { PlaceResult } from '../types.js';
import type { FootStacks } from './footStack.js';

type Place = (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean,
  mode: 'fresh' | 'strict', anchorToCap?: boolean, side?: boolean, refY?: number) => PlaceResult;

export interface FloatRowsDeps {
  resolved: ResolvedConfig;
  minTextPx: number;
  layoutFloat: (resourceId: string, width: number) => { block: ResolvedResourceBlock } | null;
  /** Px a picture's body is set taller (shorter, negative) by a crop;
   *  read by the float measure. */
  bodyCropDelta: Map<string, number>;
  footStacks: FootStacks;
  floatReserved: Map<VDTColumn, { top: number; bottom: number }>;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number };
  uncappedBottoms: Map<VDTColumn, number>;
}

export function createFloatRows(deps: FloatRowsDeps) {
  const {
    resolved, minTextPx, layoutFloat, bodyCropDelta, footStacks, floatReserved, reservedOf, uncappedBottoms,
  } = deps;
  const on = resolved.layout.footFloatRow;
  /** A picture's natural block at a width, laid out once per pass. */
  const naturalFloats = new Map<string, ResolvedResourceBlock | null>();

  /** The float a foot row lines a new one in `col` up with: the only float
   *  at the foot of the column before it, on the same page and band, set
   *  in that column alone, an upright picture or table. */
  const rowLeaderOf = (page: VDTPage, col: VDTColumn): { block: VDTBlock; col: VDTColumn } | undefined => {
    if (!on || footStacks.hasFoot(col)) return undefined;
    const prev = page.columns.find((c) => c.index === col.index - 1 && c.kind !== 'side' && c.kind !== 'span' && (c.band ?? 0) === (col.band ?? 0));
    const block = prev ? footStacks.onlyFoot(prev)?.find((b) => b.resourceBlock) : undefined;
    return prev && block && !block.resourceBlock!.rotation ? { block, col: prev } : undefined;
  };

  /** Take `d` px from the foot of `col`: the room a float set higher in it
   *  leaves under itself. */
  const lift = (col: VDTColumn, d: number) => {
    col.bbox.height = Math.max(0, col.bbox.height - d);
    col.availableHeight = Math.max(0, col.availableHeight - d);
    const r = reservedOf(col);
    floatReserved.set(col, { ...r, bottom: r.bottom + d });
  };

  /**
   * Where a float alone at the foot of `first` goes so that the first lines
   * of its caption and its neighbour's stand level (`y` as it is when
   * there is no row): it rises to its neighbour's while its column has the
   * room, or the neighbour rises to it while its own column has the room
   * (through the foot stacks, which then end that column's stack: a float
   * joining its foot later goes above it). Returns the `y` to set it at,
   * and whether it stands in a row: then it joins no stack either, so no
   * later float is laid under it and takes it out of line.
   */
  const levelInRow = (page: VDTPage, first: VDTColumn, block: VDTBlock, y: number): { y: number; row: boolean } => {
    const leader = rowLeaderOf(page, first);
    const capNew = block.resourceBlock?.captionLines[0];
    const bodyNew = block.resourceBlock?.bodyRect;
    const lead = leader?.block;
    const capLead = lead?.resourceBlock!.captionLines[0];
    if (!leader || !lead || !capNew || !bodyNew || !capLead || capNew.bbox.y <= bodyNew.y
      || capLead.bbox.y - lead.bbox.y <= lead.resourceBlock!.bodyRect.y) return { y, row: false };
    const target = capLead.bbox.y - capNew.bbox.y;
    if (target < y - 0.01) {
      if (first.availableHeight < y - target) return { y, row: false };
      lift(first, y - target);
      return { y: target, row: true };
    }
    if (target > y + 0.01) {
      if (uncappedBottoms.has(leader.col) || leader.col.availableHeight < target - y + minTextPx) return { y, row: false };
      footStacks.raise(leader.col, target - y);
      lift(leader.col, target - y);
    }
    // Level already, or the neighbour raised: its stack ends too.
    footStacks.raise(leader.col, 0);
    return { y, row: true };
  };

  /** `placeAt` with the body of a picture cropped within its safe area
   *  toward its neighbour's height in a foot row. The crop stays only if
   *  the float is placed there; the block is marked (`bodyFlex.by`) so the
   *  checks report it. */
  const cropping = (placeAt: Place): Place => {
    if (!on) return placeAt;
    return (page, f, targetCols, position, pageSpan, mode, anchorToCap = false, side = false, refY) => {
      const place = () => placeAt(page, f, targetCols, position, pageSpan, mode, anchorToCap, side, refY);
      const first = targetCols[0];
      if (!first || f.callout || f.rotate || f.plate || side || pageSpan || position !== 'bottom' || targetCols.length !== 1
        || bodyCropDelta.has(f.resourceId)) return place();
      const leader = rowLeaderOf(page, first);
      if (!leader) return place();
      const key = `${f.resourceId}:${first.bbox.width.toFixed(2)}`;
      let natural = naturalFloats.get(key);
      if (natural === undefined) {
        natural = layoutFloat(f.resourceId, first.bbox.width)?.block ?? null;
        naturalFloats.set(key, natural);
      }
      const own = natural?.bodyFlex && !natural.rotation ? natural : undefined;
      if (!own) return place();
      const want = leader.block.resourceBlock!.bodyRect.height - own.bodyRect.height;
      const delta = Math.max(-own.bodyFlex!.shrink, Math.min(own.bodyFlex!.grow, want));
      if (Math.abs(delta) < 0.5) return place();
      bodyCropDelta.set(f.resourceId, delta);
      const r = place();
      if (r === 'defer' || r === 'skip') {
        bodyCropDelta.delete(f.resourceId);
        return place();
      }
      const flex = page.floats?.find((b) => b.resourceBlock?.resource.id === f.resourceId)?.resourceBlock?.bodyFlex;
      if (flex) flex.by = 'row';
      return r;
    };
  };

  return { levelInRow, cropping };
}
