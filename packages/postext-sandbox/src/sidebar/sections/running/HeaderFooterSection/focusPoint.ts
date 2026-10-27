/** The cover `focus` point of a design image (#945): fractions of the
 *  picture the crop centres on. Pure helpers of the editor. */

export interface FocusPoint {
  x: number;
  y: number;
}

/** What a pointer press at (`clientX`, `clientY`) over a picture drawn in
 *  `rect` sets: fractions of the picture, to the nearest hundredth, held
 *  inside it. Null for a picture drawn with no size. */
export function focusFromPointer(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): FocusPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const clamp = (v: number): number => Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) };
}

/** A fraction as a whole percentage. */
export function focusPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

/** The point a percentage names (0 to 100). */
export function focusFromPercent(percent: number): number {
  return Math.min(1, Math.max(0, Math.round(percent) / 100));
}

/** The point as the engine reads it when the element sets none: the
 *  picture's centre, shown by the crosshair until the reader picks one. */
export const FOCUS_CENTER: FocusPoint = { x: 0.5, y: 0.5 };
