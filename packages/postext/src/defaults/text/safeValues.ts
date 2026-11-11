// Values of a configuration checked where they are resolved, so that what
// reaches a stylesheet, a Word part or a PDF operator is a colour or a
// length and nothing else (character and highlight styles, #1488).
import type { ColorValue, Dimension, DimensionUnit } from '../../types.js';

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;
const UNITS: ReadonlySet<DimensionUnit> = new Set<DimensionUnit>(['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem']);

/** `color` when its `hex` is a colour (`#rrggbb`, or `#rgb`, given back
 *  as `#rrggbb`), else undefined. */
export function safeColor(color: ColorValue | undefined): ColorValue | undefined {
  if (!color || typeof color !== 'object' || typeof color.hex !== 'string') return undefined;
  const hex = color.hex.trim();
  if (HEX6.test(hex)) return hex === color.hex ? color : { ...color, hex };
  if (HEX3.test(hex)) return { ...color, hex: `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` };
  return undefined;
}

/** `d` when it is a finite number in a known unit, else undefined. */
export function safeDimension(d: Dimension | undefined): Dimension | undefined {
  if (!d || typeof d !== 'object' || typeof d.value !== 'number' || !Number.isFinite(d.value) || !UNITS.has(d.unit)) return undefined;
  return d;
}

/** A percentage clamped to 0–100; `fallback` for anything not a finite
 *  number. */
export function clampPercent(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

/** `value` when `allowed` holds it, else `fallback`: an enumeration read
 *  from a configuration (a `Set`, so no key of `Object.prototype` passes). */
export function oneOf<T extends string>(value: unknown, allowed: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}
