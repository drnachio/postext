// A float set by hand (`placement.pin`, #1494) as the Resources panel, the
// canvas drag and the WebMCP resource tool store it. Not recommended:
// Postext lays the book out by rules and lays it out again when the text,
// the page size, the columns or the edition's language change, while a pin
// names a page, a column and a slot of one layout. These functions keep
// the stored pin well formed; the engine reports a pin it cannot follow
// (`floatPinMissed`).

import { MAX_PIN_PAGE_OFFSET, type Resource, type ResourcePin, type ResourcePlacement } from 'postext';
import { placementWith } from './resourceEdits.js';

/** The page offsets a pin may name: the citing page (0) to
 *  `MAX_PIN_PAGE_OFFSET` pages after it. */
export const PIN_PAGE_OFFSETS: readonly number[] = Array.from({ length: MAX_PIN_PAGE_OFFSET + 1 }, (_, i) => i);

/** What is wrong with a pin as given, or `null` when it can be stored. */
export function pinProblem(pin: unknown): string | null {
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)) return 'a pin is { page, column?, slot }';
  const p = pin as Record<string, unknown>;
  for (const key of Object.keys(p)) if (key !== 'page' && key !== 'column' && key !== 'slot') return `a pin has no ${key}: it is { page, column?, slot }`;
  if (!Number.isInteger(p.page) || (p.page as number) < 0 || (p.page as number) > MAX_PIN_PAGE_OFFSET) {
    return `page is a whole number of pages after the one that cites the float, 0 to ${MAX_PIN_PAGE_OFFSET}`;
  }
  if (p.column !== undefined && (!Number.isInteger(p.column) || (p.column as number) < 0)) return 'column is a text column counted from 0 in reading order, or left out for any';
  if (p.slot !== 'top' && p.slot !== 'bottom') return 'slot is top or bottom';
  return null;
}

/** `pin` as stored: the keys in order, no `column` when it is any. */
export function cleanPinInput(pin: ResourcePin): ResourcePin {
  return { page: pin.page, ...(pin.column !== undefined ? { column: pin.column } : {}), slot: pin.slot };
}

/** `placement` with `pin` set, or without one (`undefined`: back to the
 *  automatic placement). */
export function placementWithPin(placement: ResourcePlacement | undefined, pin: ResourcePin | undefined): ResourcePlacement | undefined {
  return placementWith(placement, 'pin', pin ? cleanPinInput(pin) : undefined);
}

/** `resource` with `pin` set or cleared, touched. */
export function resourceWithPin(resource: Resource, pin: ResourcePin | undefined, now = Date.now()): Resource {
  const next: Resource = { ...resource, updatedAt: now };
  const placement = placementWithPin(resource.placement, pin);
  if (placement) next.placement = placement;
  else delete next.placement;
  return next;
}

/** One field of a pin changed in the panel: the pin it makes, starting
 *  from the resource's own (or, for a resource with none, the foot of any
 *  column of the citing page). */
export function pinWithField(pin: ResourcePin | undefined, field: 'page' | 'column' | 'slot', value: number | 'top' | 'bottom' | undefined): ResourcePin {
  const base: ResourcePin = pin ?? { page: 0, slot: 'bottom' };
  if (field === 'page') return cleanPinInput({ ...base, page: Math.max(0, Math.min(MAX_PIN_PAGE_OFFSET, Math.round(value as number) || 0)) });
  if (field === 'slot') return cleanPinInput({ ...base, slot: value === 'top' ? 'top' : 'bottom' });
  const { column: _old, ...rest } = base;
  void _old;
  return cleanPinInput(value === undefined ? rest : { ...rest, column: Math.max(0, Math.round(value as number)) });
}

/** Whether a pin moves this resource: a float to a column or across the
 *  page, upright, not a full-page plate. The engine ignores (and reports)
 *  any other's. */
export function pinApplies(o: { inline: boolean; span: string; rotated: boolean; plate: boolean }): boolean {
  return !o.inline && o.span !== 'side' && !o.rotated && !o.plate;
}
