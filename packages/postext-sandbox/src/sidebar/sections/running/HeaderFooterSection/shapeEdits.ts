/**
 * The values the shape fields edit (#1063): a radius per corner, a border
 * per side, a dash pattern, and the path presets of a shape element. Pure,
 * so the fields and their tests share them.
 */

import { isCornerRadii, parseSvgPath, type BorderSide, type BorderSides, type CornerRadius, type Dimension } from 'postext';

export const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export type Corner = (typeof CORNERS)[number];
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];

const ZERO_LIKE = (d: Dimension): Dimension => ({ value: 0, unit: d.unit });

/** Each corner's radius (a corner a per-corner value leaves out is square). */
export function cornerValues(r: CornerRadius | undefined, fallback: Dimension): Record<Corner, Dimension> {
  if (r && isCornerRadii(r)) {
    const zero = ZERO_LIKE(fallback);
    return { topLeft: r.topLeft ?? zero, topRight: r.topRight ?? zero, bottomRight: r.bottomRight ?? zero, bottomLeft: r.bottomLeft ?? zero };
  }
  const one = (r as Dimension | undefined) ?? fallback;
  return { topLeft: one, topRight: one, bottomRight: one, bottomLeft: one };
}

/** The radius with every corner its own (unlinked): each starts at what it
 *  showed. */
export function unlinkCorners(r: CornerRadius | undefined, fallback: Dimension): CornerRadius {
  return { ...cornerValues(r, fallback) };
}

/** One radius for all four corners again: the largest of them, so a
 *  rounded box stays rounded. */
export function linkCorners(r: CornerRadius | undefined, fallback: Dimension): Dimension {
  const all = Object.values(cornerValues(r, fallback));
  return all.reduce((a, b) => (b.value > a.value ? b : a), all[0]!);
}

/** One corner's radius changed. */
export function setCorner(r: CornerRadius | undefined, fallback: Dimension, corner: Corner, value: Dimension): CornerRadius {
  return { ...cornerValues(r, fallback), [corner]: value };
}

/** The sides' borders with one field of one side changed (undefined: the
 *  field taken off, the side then reads the whole border's). */
export function setSideField<K extends keyof BorderSide>(sides: BorderSides | undefined, side: Side, field: K, value: BorderSide[K] | undefined): BorderSides {
  const next: BorderSides = { ...(sides ?? {}) };
  const s: BorderSide = { ...(next[side] ?? {}) };
  if (value === undefined) delete s[field];
  else s[field] = value;
  if (Object.keys(s).length === 0) delete next[side];
  else next[side] = s;
  return next;
}

/** What one side draws: its own fields over the whole border's. */
export function sideValue(sides: BorderSides | undefined, side: Side, whole: { enabled: boolean; color: BorderSide['color']; width: Dimension }): { enabled: boolean; color: BorderSide['color']; width: Dimension } {
  const s = sides?.[side];
  return { enabled: s?.enabled ?? whole.enabled, color: s?.color ?? whole.color, width: s?.width ?? whole.width };
}

// ---------------------------------------------------------------------------
// Dash patterns
// ---------------------------------------------------------------------------

const DASH_TOKEN = /^(\d+(?:\.\d+)?|\.\d+)(pt|mm|px|em)?$/;

/** A dash pattern as typed: lengths separated by spaces or commas, points
 *  when they have no unit (`3 2`, `2mm 1mm`). Empty: undefined (a solid
 *  line); a token that is no positive length: null. */
export function parseDash(text: string): Dimension[] | undefined | null {
  const tokens = text.split(/[\s,]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return undefined;
  const out: Dimension[] = [];
  for (const t of tokens) {
    const m = DASH_TOKEN.exec(t);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;
    out.push({ value, unit: (m[2] as Dimension['unit'] | undefined) ?? 'pt' });
  }
  if (out.every((d) => d.value === 0)) return null;
  return out;
}

/** A dash pattern as the field shows it: points bare, other units named. */
export function formatDash(dash: readonly Dimension[] | undefined): string {
  return (dash ?? []).map((d) => (d.unit === 'pt' ? `${d.value}` : `${d.value}${d.unit}`)).join(' ');
}

// ---------------------------------------------------------------------------
// Shape (path) presets
// ---------------------------------------------------------------------------

/** The shapes a path element starts from, written in the default view box
 *  (1 × 1: fractions of the element's box), so they stretch to it. */
export const PATH_PRESETS = {
  bar: 'M0 0H1V1H0Z',
  ribbon: 'M0 0H0.88L1 0.5L0.88 1H0L0.08 0.5Z',
  arrow: 'M0 0.32H0.62V0L1 0.5L0.62 1V0.68H0Z',
  chevron: 'M0 0H0.7L1 0.5L0.7 1H0L0.3 0.5Z',
  wave: 'M0 0.35C0.17 0.05 0.33 0.05 0.5 0.35C0.67 0.65 0.83 0.65 1 0.35V1H0Z',
} as const;
export type PathPreset = keyof typeof PATH_PRESETS;
export const PATH_PRESET_NAMES = Object.keys(PATH_PRESETS) as PathPreset[];

/** The preset a path's data is, if any. */
export function presetOf(d: string, viewBox: readonly [number, number] | undefined): PathPreset | undefined {
  if (viewBox && (viewBox[0] !== 1 || viewBox[1] !== 1)) return undefined;
  const t = d.trim();
  return PATH_PRESET_NAMES.find((name) => PATH_PRESETS[name] === t);
}

/** Whether path data can be drawn, and where it goes wrong (a 1-based
 *  character position) when it cannot. */
export function checkPathData(d: string): { ok: true } | { ok: false; at: number } {
  const r = parseSvgPath(d);
  return r.ok ? { ok: true } : { ok: false, at: Math.min(d.length, r.at) + 1 };
}
