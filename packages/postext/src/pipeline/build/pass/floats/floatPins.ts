// Floats set by hand in the canvas (`placement.pin`): the page and slot
// each goes to, and what becomes of one whose page went by without it.
import type { VDTColumn, VDTDocument, VDTPage } from '../../../../vdt.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';

export function createFloatPins(pendingFloats: PlannedFloat[], doc: VDTDocument) {
  /** The page a float set by hand goes to, once its citation is placed:
   *  that many pages after the citing one. */
  const pinPageOf = (f: PlannedFloat): number | undefined =>
    f.pin && f.refPageIndex !== undefined ? f.refPageIndex + f.pin.page : undefined;
  /** The pin of `f` when `pageIndex` is its page. */
  const pinOn = (f: PlannedFloat, pageIndex: number): PlannedFloat['pin'] =>
    pinPageOf(f) === pageIndex ? f.pin : undefined;
  /** Floats whose page went by without their slot: placed as usual from
   *  now on, and reported (`floatPinMissed`). */
  const dropMissedPins = (pageIndex: number): void => {
    for (let i = 0; i < pendingFloats.length; i++) {
      const f = pendingFloats[i]!;
      const target = pinPageOf(f);
      if (target === undefined || pageIndex <= target) continue;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pin: _pin, ...rest } = f;
      pendingFloats[i] = rest;
      (doc.warnings ??= []).push({ kind: 'floatPinMissed', pageIndex: target, resourceId: f.resourceId });
    }
  };
  /** The text column a pin names on `page`, if any. */
  const pinnedColumn = (page: VDTPage, pin: NonNullable<PlannedFloat['pin']>): VDTColumn | undefined =>
    pin.column === undefined ? undefined : page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side')[pin.column];
  return { pinPageOf, pinOn, dropMissedPins, pinnedColumn };
}
