// Floats set by hand (`placement.pin`): the page each waits for, the slot
// it is offered first there, and what becomes of one whose page went by or
// whose chapter ended before it. A pin is a preference: on its page the
// float takes its slot when it can, else the usual slots of that page, else
// it goes on as any float. Never placed worse than without the pin, past the
// page it asked to wait for. Part of the placement pass, beside floatPlace.ts.
import type { VDTColumn, VDTPage } from '../../../../vdt.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';
import type { FloatSlot, FloatSlotPosition } from '../../../floats/floatSlots.js';

type Pin = NonNullable<PlannedFloat['pin']>;

/** A pending float without its pin: placed as usual from now on. */
const unpinned = (f: PlannedFloat): PlannedFloat => {
  const { pin, ...rest } = f;
  void pin;
  return rest;
};

/** The text columns of `page` a pin counts, in reading order, every band
 *  of the page included. */
const pinColumnsOf = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');

/** The text column a pin names on `page`; `undefined` when it names none
 *  or the page has no such column (the float then takes any column). */
export function pinnedColumn(page: VDTPage, pin: Pin): VDTColumn | undefined {
  return pin.column === undefined ? undefined : pinColumnsOf(page)[pin.column];
}

/** `positions` with the pin's slot first. */
export function pinFirstPositions(pin: Pin | undefined, positions: FloatSlotPosition[]): FloatSlotPosition[] {
  return pin ? [pin.slot, ...positions.filter((p) => p !== pin.slot)] : positions;
}

/** Whether `slot` is the one `pin` names on `page`. */
export function isPinnedSlot(page: VDTPage, pin: Pin, slot: Pick<FloatSlot, 'position' | 'pageSpan' | 'cols' | 'side'>): boolean {
  if (slot.side || slot.position !== pin.slot) return false;
  const col = pinnedColumn(page, pin);
  return slot.pageSpan || !col || slot.cols[0] === col;
}

/** `slots` with the ones the pin names first, the rest in their order. */
export function pinFirstSlots<S extends Pick<FloatSlot, 'position' | 'pageSpan' | 'cols' | 'side'>>(page: VDTPage, pin: Pin | undefined, slots: S[]): S[] {
  if (!pin) return slots;
  const first = slots.filter((s) => isPinnedSlot(page, pin, s));
  return [...first, ...slots.filter((s) => !first.includes(s))];
}

export function createFloatPins(pendingFloats: PlannedFloat[]) {
  /** The page a float set by hand waits for, once its citation is placed:
   *  that many pages after the citing one. */
  const pinPageOf = (f: PlannedFloat): number | undefined =>
    f.pin && f.refPageIndex !== undefined ? f.refPageIndex + f.pin.page : undefined;
  /** The pin of `f` when `pageIndex` is its page. */
  const pinOn = (f: PlannedFloat, pageIndex: number): PlannedFloat['pin'] =>
    pinPageOf(f) === pageIndex ? f.pin : undefined;
  /** Drop the pins of the pending floats whose page is before `pageIndex`
   *  (they missed it), or, with `chapterEnd`, of every pending float but
   *  those pinned to `pageIndex` itself (nothing waits past a chapter's
   *  end). Those floats are placed as usual from here; the layout reports
   *  each after the pass (`floatPinMissed`). */
  const releasePins = (pageIndex: number, chapterEnd = false): void => {
    for (let i = 0; i < pendingFloats.length; i++) {
      const f = pendingFloats[i]!;
      if (!f.pin) continue;
      const target = pinPageOf(f);
      if (chapterEnd ? target !== pageIndex : target !== undefined && pageIndex > target) pendingFloats[i] = unpinned(f);
    }
  };
  return { pinPageOf, pinOn, releasePins };
}
