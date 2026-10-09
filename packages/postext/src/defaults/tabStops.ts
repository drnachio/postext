/**
 * Tab stops of body text (#622): reading their settings and resolving them
 * to px for the measurer (`measure/tabs.ts`). A stop whose position is no
 * length, `'end'` or percentage is left out (`collectConfigWarnings` says
 * so); an unknown `align` reads as `'start'`.
 */

import type { Dimension, DimensionUnit, TabStop, TabStopAlign, TabStopPosition } from '../types';
import { dimensionToPx } from '../units';
import { defaultDecimalChar, type TabSettings, type TabStopPx } from '../measure/tabs';

const ALIGNS: readonly TabStopAlign[] = ['start', 'end', 'center', 'decimal'];
const UNITS: readonly DimensionUnit[] = ['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem'];

/** The default room between a leader and the text on either side: the
 *  contents' `leader.gap`. */
export const DEFAULT_TAB_LEADER_GAP: Dimension = { value: 0.5, unit: 'em' };

export function isTabStopAlign(value: unknown): value is TabStopAlign {
  return typeof value === 'string' && (ALIGNS as readonly string[]).includes(value);
}

/** A length written as text (`120mm`, `3.5cm`, `2em`; a bare number is in
 *  points), or undefined. */
export function parseLengthText(text: string): Dimension | undefined {
  const m = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*(cm|mm|in|pt|px|em|rem)?\s*$/i.exec(text);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: (m[2]?.toLowerCase() as DimensionUnit | undefined) ?? 'pt' };
}

/** A stop's position as the config (or a `:tab{at=…}`) writes it: a
 *  `Dimension`, `'end'`, a percentage (`'50%'`) or a length as text. */
export function parseTabStopPosition(value: unknown): TabStopPosition | undefined {
  if (value && typeof value === 'object') {
    const d = value as Partial<Dimension>;
    return typeof d.value === 'number' && Number.isFinite(d.value) && typeof d.unit === 'string' && (UNITS as readonly string[]).includes(d.unit)
      ? { value: d.value, unit: d.unit }
      : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  if (text === 'end') return 'end';
  const pct = /^(\d+(?:\.\d+)?|\.\d+)\s*%$/.exec(text);
  if (pct) return `${Number(pct[1])}%`;
  return parseLengthText(text);
}

/** The stop of `:tab{at=… align=… leader=… gap=… decimal=…}` (#622), or
 *  undefined when `at` is missing or no position. */
export function tabStopFromAttrs(attrs: Readonly<Record<string, string>>): TabStop | undefined {
  const position = attrs.at !== undefined ? parseTabStopPosition(attrs.at) : undefined;
  if (position === undefined) return undefined;
  const align = attrs.align?.trim().toLowerCase();
  const gap = attrs.gap !== undefined ? parseLengthText(attrs.gap) : undefined;
  return {
    position,
    ...(isTabStopAlign(align) ? { align } : {}),
    ...(attrs.leader !== undefined && attrs.leader.length > 0 ? { leader: attrs.leader } : {}),
    ...(gap ? { leaderGap: gap } : {}),
    ...(attrs.decimal !== undefined && attrs.decimal.length > 0 ? { decimalChar: attrs.decimal } : {}),
  };
}

/** One stop in px: lengths at `dpi`, `em` of the paragraph's size, the
 *  leader gap at its default, the decimal separator the locale's. Undefined
 *  for a stop whose position is no position. */
export function resolveTabStopPx(stop: TabStop, dpi: number, fontSizePx: number, locale: string | undefined): TabStopPx | undefined {
  const position = parseTabStopPosition(stop?.position);
  if (position === undefined) return undefined;
  const at: TabStopPx['at'] = position === 'end'
    ? 'end'
    : typeof position === 'string'
      ? { percent: parseFloat(position) }
      : Math.max(0, dimensionToPx(position, dpi, fontSizePx));
  const gap = stop.leaderGap ?? DEFAULT_TAB_LEADER_GAP;
  return {
    at,
    align: isTabStopAlign(stop.align) ? stop.align : 'start',
    ...(typeof stop.leader === 'string' && stop.leader.length > 0 ? { leader: stop.leader } : {}),
    gapPx: Math.max(0, dimensionToPx(gap, dpi, fontSizePx)),
    decimalChar: typeof stop.decimalChar === 'string' && stop.decimalChar.length > 0 ? stop.decimalChar : defaultDecimalChar(locale),
  };
}

/** A paragraph's tab stops and default interval in px; undefined when it
 *  has neither. */
export function resolveTabSettings(
  stops: readonly TabStop[] | undefined,
  interval: Dimension | undefined,
  dpi: number,
  fontSizePx: number,
  locale: string | undefined,
): TabSettings | undefined {
  const px = (stops ?? []).map((s) => resolveTabStopPx(s, dpi, fontSizePx, locale)).filter((s): s is TabStopPx => s !== undefined);
  const intervalPx = interval ? dimensionToPx(interval, dpi, fontSizePx) : undefined;
  const hasInterval = intervalPx !== undefined && Number.isFinite(intervalPx) && intervalPx > 0;
  if (px.length === 0 && !hasInterval) return undefined;
  return { stops: px, ...(hasInterval ? { intervalPx } : {}) };
}
