// Pins for configurations stored under rules 3 to 6 (postext 1.4 and
// earlier): heading breaks, maths size, inline and box gaps, colon lists,
// box cuts, heading marks and drop-cap sizes (#1276: split out of configVersion.ts).
import type { HeadingBreakBeforeConfig, PostextConfig, Dimension, MathConfig, LayoutConfig, BodyTextConfig, HeadingsConfig, DimensionUnit } from '../../types.js';
import { DEFAULT_MATH_CONFIG } from '../../defaults/text/math.js';
import { dimensionsEqual } from '../../defaults/shared.js';
import { DEFAULT_TEXT_ELEMENT, resolveDesignLineHeight } from '../../defaults/structure/headerFooter.js';
import { DEFAULT_PAGE_CONFIG } from '../../defaults/page.js';
import { dimensionToPx } from '../../units.js';
import { isRecord } from './contentChecks.js';

/** Up to 1.4 a drop cap with no `fontSize` was as tall as the line boxes it
 *  spans divided by this, the share of a letter's size its capitals take. */
const CAP_HEIGHT = 0.72;

/**
 * How much larger postext 1.4 set maths than the size it documents:
 * MathJax gives a formula's box in `ex`, one `ex` of its TeX font is
 * 0.442 em (the font's `x_height`), and 1.4 took it as half an em. So
 * 0.5 ÷ 0.442 ≈ 1.1312; a configuration whose `math.fontSizeScale` is
 * multiplied by it sets every formula at the size 1.4 did.
 */
export const LEGACY_MATH_SIZE = 0.5 / 0.442;

/** A partial `breakBefore` as postext 1.4 resolved it where the default
 *  it filled from was the no-break one, written out in full; undefined
 *  when it already says all it lays out. */
function pinnedBreak(raw: HeadingBreakBeforeConfig | undefined): HeadingBreakBeforeConfig | undefined {
  const enabled = raw?.enabled ?? false;
  if (raw?.enabled !== undefined && (!enabled || raw.parity !== undefined)) return undefined;
  return { ...raw, enabled, ...(enabled && raw?.parity === undefined ? { parity: 'any' as const } : {}) };
}

/**
 * A configuration written for postext 1.4 or earlier, pinned to the heading
 * breaks it laid out then. Up to 1.4 a `headings` object turned the H1 page
 * break off unless it set `levels[0].breakBefore.enabled` (and stripping the
 * defaults dropped an H1 `enabled: false`, so saved and exported
 * configurations never carried one), a partial H1 break took its missing
 * field from the no-break default, and a heading style's `breakBefore`
 * replaced its level's with the same fill. The engine now merges each onto
 * the level's break — H1's being `always-odd` — so those breaks are written
 * out: `enabled: false` on H1, or `parity: 'any'` beside an `enabled: true`.
 * A configuration with no `headings` object, or one that spells every break
 * out in full, is returned as it is (the same object).
 */
export function pinLegacyHeadingBreaks<T extends Partial<PostextConfig>>(config: T): T {
  let out = config;
  const headings = config.headings;
  if (isRecord(headings)) {
    const levels = Array.isArray(headings.levels) ? headings.levels : [];
    const i = levels.findIndex((l) => isRecord(l) && l.level === 1);
    const pin = pinnedBreak(i >= 0 && isRecord(levels[i]!.breakBefore) ? levels[i]!.breakBefore : undefined);
    if (pin) {
      const nextLevels = i >= 0
        ? levels.map((l, k) => (k === i ? { ...l, breakBefore: pin } : l))
        : [...levels, { level: 1, breakBefore: pin }];
      out = { ...out, headings: { ...headings, levels: nextLevels } };
    }
  }
  if (Array.isArray(config.headingStyles)) {
    let changed = false;
    const styles = config.headingStyles.map((style) => {
      if (!isRecord(style) || !isRecord(style.breakBefore)) return style;
      const pin = pinnedBreak(style.breakBefore);
      if (!pin) return style;
      changed = true;
      return { ...style, breakBefore: pin };
    });
    if (changed) out = { ...out, headingStyles: styles };
  }
  return out;
}

function isDimension(v: unknown): v is Dimension {
  return isRecord(v) && typeof v.value === 'number' && typeof v.unit === 'string';
}

/**
 * A configuration written before postext 1.5, pinned to the maths size it
 * laid out then: `math.fontSizeScale` (1 when unset) × {@link
 * LEGACY_MATH_SIZE}. A display formula's margins in `em` or `rem` are
 * lengths of the formula's own size, so they are divided by the same
 * factor and keep the space 1.4 left around the formula. A value that
 * lands on its default is left out (a scale of 0.884 becomes the default
 * 1), and a configuration with maths switched off (`math.enabled: false`,
 * whose formulas are set as their TeX source at the body size) is
 * returned as it is (the same object).
 */
export function pinLegacyMathSize<T extends Partial<PostextConfig>>(config: T): T {
  const math: MathConfig = isRecord(config.math) ? config.math : {};
  if (math.enabled === false) return config;
  const next: MathConfig = { ...math };
  const scale = typeof math.fontSizeScale === 'number' && Number.isFinite(math.fontSizeScale)
    ? math.fontSizeScale
    : DEFAULT_MATH_CONFIG.fontSizeScale;
  const pinnedScale = scale * LEGACY_MATH_SIZE;
  if (pinnedScale === DEFAULT_MATH_CONFIG.fontSizeScale) delete next.fontSizeScale;
  else next.fontSizeScale = pinnedScale;
  for (const key of ['marginTop', 'marginBottom'] as const) {
    const margin = isDimension(math[key]) ? math[key] : DEFAULT_MATH_CONFIG[key];
    if (margin.unit !== 'em' && margin.unit !== 'rem') continue;
    const pinned: Dimension = { ...margin, value: margin.value / LEGACY_MATH_SIZE };
    if (dimensionsEqual(pinned, DEFAULT_MATH_CONFIG[key])) delete next[key];
    else next[key] = pinned;
  }
  return { ...config, math: next };
}

/**
 * A configuration written before postext 1.5, pinned to the space it left
 * under an inline resource: `layout.inlineResourceGap: 'above'`, where 1.4
 * kept the float gap above the resource only and set the text after it at
 * the next grid line. A configuration that names a gap already is returned
 * as it is (the same object).
 */
export function pinLegacyInlineGap<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.inlineResourceGap !== undefined) return config;
  return { ...config, layout: { ...layout, inlineResourceGap: 'above' } };
}

/**
 * A configuration written before postext 1.5, pinned to the room it left
 * for a list under the colon line that introduces it:
 * `bodyText.colonListRoom: 'line'`, where 1.4 took one line of room as
 * enough and a first item the orphan and widow rules keep whole went on
 * to the next column without the colon line. A configuration that names a
 * room already, or turns `keepColonWithList` off, is returned as it is
 * (the same object).
 */
export function pinLegacyColonListRoom<T extends Partial<PostextConfig>>(config: T): T {
  const bodyText: BodyTextConfig = isRecord(config.bodyText) ? config.bodyText : {};
  if (bodyText.colonListRoom !== undefined || bodyText.keepColonWithList === false) return config;
  return { ...config, bodyText: { ...bodyText, colonListRoom: 'line' } };
}

/**
 * A configuration written before postext 1.5, pinned to the space it left
 * around an inline resource inside a box: `layout.inlineResourceGapInBoxes:
 * false`, where 1.4 set the resource right under the text before it and
 * the text after it right under the resource. A configuration that already
 * says whether boxes keep the gap is returned as it is (the same object).
 */
export function pinLegacyBoxResourceGap<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.inlineResourceGapInBoxes !== undefined) return config;
  return { ...config, layout: { ...layout, inlineResourceGapInBoxes: false } };
}

/**
 * A configuration written before postext 1.5, pinned to the cuts it made in
 * a box that splits: `layout.boxChildSplitMinLines: 1`, where 1.4 cut
 * inside a paragraph or list item wherever each side of the box held its
 * `splitMinLines` lines in all, even when that left one line of the
 * paragraph or item on a side. A configuration that names the setting
 * already is returned as it is (the same object).
 */
export function pinLegacyBoxChildCut<T extends Partial<PostextConfig>>(config: T): T {
  const layout: LayoutConfig = isRecord(config.layout) ? config.layout : {};
  if (layout.boxChildSplitMinLines !== undefined) return config;
  return { ...config, layout: { ...layout, boxChildSplitMinLines: 1 } };
}

/**
 * A configuration written before postext 1.5, pinned to the headings it
 * laid out then: `headings.inlineMarks: false`, where 1.4 printed the text
 * of a heading's `*italic*`, `**bold**` and other marks in the heading's
 * plain style. A configuration that names the setting already is returned
 * as it is (the same object).
 */
export function pinLegacyHeadingMarks<T extends Partial<PostextConfig>>(config: T): T {
  const headings: HeadingsConfig = isRecord(config.headings) ? config.headings : {};
  if (headings.inlineMarks !== undefined) return config;
  return { ...config, headings: { ...headings, inlineMarks: false } };
}

/** The double next to `v`, one step towards `+∞` (`dir` 1) or `−∞`. */
function nextDouble(v: number, dir: 1 | -1): number {
  if (v === 0) return dir * Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, v);
  view.setBigInt64(0, view.getBigInt64(0) + ((v > 0) === (dir > 0) ? 1n : -1n));
  return view.getFloat64(0);
}

/** A length in `unit` that `dimensionToPx` reads back as `px` at `dpi`
 *  (em against `basePx`): the plain conversion, or one of the doubles next
 *  to it when rounding leaves that a hair off. Most sizes read back
 *  exactly; for some unit, dpi and leading combinations no double does, and
 *  the plain conversion is kept, a rounding step or two (1e-14 px) away. */
function lengthOf(px: number, unit: DimensionUnit, dpi: number, basePx: number): Dimension {
  const toPx = (value: number) => dimensionToPx({ value, unit }, dpi, basePx);
  const first = px / toPx(1);
  let up = first;
  let down = first;
  for (let step = 0; step < 16; step++) {
    if (toPx(up) === px) return { value: up, unit };
    if (toPx(down) === px) return { value: down, unit };
    up = nextDouble(up, 1);
    down = nextDouble(down, -1);
  }
  return { value: first, unit };
}

/** The size postext 1.4 set the drop cap of the design text `el` at, when
 *  the cap names none, `dpi` being the document's: the line boxes it spans
 *  over {@link CAP_HEIGHT}, worked out as 1.4 did and written in the unit of
 *  the element's leading (a length) or of its font size (a multiplier of
 *  it). Undefined when that cannot be written out. */
function legacyDropCapSize(el: Record<string, unknown>, dropCap: Record<string, unknown>, dpi: number): Dimension | undefined {
  const lines = Math.max(1, Math.round(Number(dropCap.lines ?? 2)));
  if (!Number.isFinite(lines)) return undefined;
  const fontSize = isDimension(el.fontSize) ? el.fontSize : DEFAULT_TEXT_ELEMENT.fontSize;
  // A design text's size is a length; one in em has nothing to read against.
  if (fontSize.unit === 'em' || fontSize.unit === 'rem') return undefined;
  const fontSizePx = dimensionToPx(fontSize, dpi);
  const leading = resolveDesignLineHeight(el.lineHeight, fontSize);
  const lineHeightPx = leading.lineHeightLength ? dimensionToPx(leading.lineHeightLength, dpi) : fontSizePx * leading.lineHeight;
  const capPx = (lines * lineHeightPx) / CAP_HEIGHT;
  if (!Number.isFinite(capPx) || capPx <= 0) return undefined;
  return lengthOf(capPx, leading.lineHeightLength?.unit ?? fontSize.unit, dpi, fontSizePx);
}

/** `value` with every design text in it — a `kind: 'text'` object whose
 *  `dropCap` names no `fontSize` — given its 1.4 size, wherever it sits;
 *  the same object where nothing changed. */
function pinDropCaps(value: unknown, dpi: number): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const out = pinDropCaps(v, dpi);
      if (out !== v) changed = true;
      return out;
    });
    return changed ? next : value;
  }
  if (!isRecord(value)) return value;
  let out: Record<string, unknown> = value;
  for (const [key, v] of Object.entries(value)) {
    const next = pinDropCaps(v, dpi);
    if (next === v) continue;
    if (out === value) out = { ...value };
    out[key] = next;
  }
  const dropCap = out.dropCap;
  if (out.kind === 'text' && isRecord(dropCap) && dropCap.fontSize === undefined) {
    const size = legacyDropCapSize(out, dropCap, dpi);
    if (size) out = { ...out, dropCap: { ...dropCap, fontSize: size } };
  }
  return out;
}

/**
 * A configuration written before postext 1.5, pinned to the drop caps it
 * laid out then. Up to 1.4 a design text's `dropCap` that named no
 * `fontSize` was as tall as the line boxes it spans over 0.72 (the share of
 * the size its capitals take), so its top stood above the capitals of the
 * first line; today's default brings the two level. Every such drop cap,
 * in whatever design it sits (running heads, heading designs and styles,
 * part pages, the contents' part rows), gets that size written out: in the
 * unit of the element's leading when that is a length, else in the unit of
 * its font size, at the size 1.4 set at the document's `page.dpi` (to the
 * last digit in most cases, and never more than a rounding step or two
 * away). A configuration with none is returned as it is (the same object).
 */
export function pinLegacyDropCapSize<T extends Partial<PostextConfig>>(config: T): T {
  const dpi = isRecord(config.page) && typeof config.page.dpi === 'number' && config.page.dpi > 0
    ? config.page.dpi
    : DEFAULT_PAGE_CONFIG.dpi;
  return pinDropCaps(config, dpi) as T;
}
