/**
 * Pre-pass and derived typography for `:::part{number="…" title="…"}`
 * containers. Like the other container plans, part ranges are resolved up
 * front per content-block index (the placement loop rewinds `blockIdx` on
 * keep-with-next rollbacks and replays the markers in between).
 */

import type { ContentBlock } from '../parse';
import type { ColorValue, Dimension } from '../types';
import type { ResolvedConfig } from '../vdt';
import { dimensionsEqual } from '../defaults/shared';
import { resolveBodyStyle, resolveBlockquoteStyle } from './styles';
import {
  computeLevelIndentsPx,
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
} from './lists';
import type { BlockMeasureContext } from './measureContentBlock';

export interface PlannedPart {
  /** Content-block index of the `containerStart` marker. */
  startIdx: number;
  /** Content-block index of the matching `containerEnd` marker. */
  endIdx: number;
  containerId: number;
  /** `number` attribute as written (`'I'`, `'2'`, …); `''` when absent. */
  number: string;
  /** `title` attribute; `''` when absent. */
  title: string;
}

export interface PartPlan {
  /** Start-marker index → part. */
  byStart: Map<number, PlannedPart>;
  /** End-marker index → part. */
  byEnd: Map<number, PlannedPart>;
  /** Content-block index → enclosing part (markers excluded). A part nested
   *  inside another part is flattened into the outer one. */
  byBlock: Array<PlannedPart | undefined>;
}

export function planParts(contentBlocks: readonly ContentBlock[]): PartPlan {
  const byStart = new Map<number, PlannedPart>();
  const byEnd = new Map<number, PlannedPart>();
  const byBlock = new Array<PlannedPart | undefined>(contentBlocks.length);
  let open: { part: PlannedPart; depth: number } | undefined;
  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.type === 'containerStart' && b.containerName === 'part' && b.containerId !== undefined) {
      if (open) { open.depth++; continue; }
      const attrs = b.containerAttrs ?? {};
      const part: PlannedPart = {
        startIdx: i,
        endIdx: -1,
        containerId: b.containerId,
        number: (attrs.number ?? '').trim(),
        title: (attrs.title ?? '').trim(),
      };
      open = { part, depth: 0 };
      continue;
    }
    if (b.type === 'containerEnd' && b.containerName === 'part') {
      if (!open) continue;
      if (open.depth > 0) { open.depth--; continue; }
      open.part.endIdx = i;
      byStart.set(open.part.startIdx, open.part);
      byEnd.set(i, open.part);
      open = undefined;
      continue;
    }
    if (open) byBlock[i] = open.part;
  }
  return { byStart, byEnd, byBlock };
}

const ROMAN_RE = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
const ROMAN_VALUES: Record<string, number> = {
  M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1,
};

/** Numeric value of a part number written as a decimal (`'3'`) or a roman
 *  numeral (`'III'`, `'iv'`), so `{numberDecimal}` / `{numberRoman}` work
 *  whichever way the author wrote it. `undefined` for anything else. */
export function parsePartNumber(raw: string): number | undefined {
  const s = raw.trim();
  if (s.length === 0) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (!ROMAN_RE.test(s)) return undefined;
  const u = s.toUpperCase();
  let total = 0;
  for (let i = 0; i < u.length; i++) {
    const v = ROMAN_VALUES[u[i]!]!;
    const next = i + 1 < u.length ? ROMAN_VALUES[u[i + 1]!]! : 0;
    total += v < next ? -v : v;
  }
  return total;
}

type Eq = (a: unknown, b: unknown) => boolean;
const eqStrict: Eq = (a, b) => a === b;
const eqDim: Eq = (a, b) =>
  a !== undefined && b !== undefined && dimensionsEqual(a as Dimension, b as Dimension);
const eqColor: Eq = (a, b) =>
  a !== undefined && b !== undefined && (a as ColorValue).hex === (b as ColorValue).hex;

/** How one partial-config field maps onto the resolved list config. */
interface ListFieldSpec {
  /** Key on the list-wide config (and on the partial override). */
  key: string;
  /** Key on the level configs; omitted for list-wide-only fields. */
  levelKey?: string;
  eq: Eq;
  /** Fields whose resolved default is this field's value (the separator
   *  style inherits the number style); they follow it while still equal. */
  dependents?: Array<{ key: string; levelKey: string }>;
  /** Level key this field's resolved default comes from (the number style
   *  for the separator fields): a level value equal to it is inherited too. */
  inheritsFrom?: string;
}

const UNORDERED_FIELDS: ListFieldSpec[] = [
  { key: 'fontFamily', levelKey: 'fontFamily', eq: eqStrict },
  { key: 'color', levelKey: 'color', eq: eqColor },
  { key: 'fontWeight', levelKey: 'fontWeight', eq: eqStrict },
  { key: 'italic', levelKey: 'italic', eq: eqStrict },
  { key: 'bulletChar', levelKey: 'bulletChar', eq: eqStrict },
  { key: 'bulletFontSize', levelKey: 'fontSize', eq: eqDim },
  { key: 'gap', eq: eqDim },
  { key: 'indent', levelKey: 'indent', eq: eqDim },
  { key: 'bulletVerticalOffset', levelKey: 'verticalOffset', eq: eqDim },
  { key: 'marginTop', eq: eqDim },
  { key: 'marginBottom', eq: eqDim },
  { key: 'itemSpacing', eq: eqDim },
  { key: 'hangingIndent', eq: eqStrict },
  { key: 'taskCheckboxChar', eq: eqStrict },
  { key: 'taskCheckedChar', eq: eqStrict },
  { key: 'taskCompletedStrikethrough', eq: eqStrict },
  { key: 'taskCompletedColor', eq: eqColor },
];

const ORDERED_FIELDS: ListFieldSpec[] = [
  {
    key: 'fontFamily', levelKey: 'fontFamily', eq: eqStrict,
    dependents: [{ key: 'separatorFontFamily', levelKey: 'separatorFontFamily' }],
  },
  {
    key: 'color', levelKey: 'color', eq: eqColor,
    dependents: [{ key: 'separatorColor', levelKey: 'separatorColor' }],
  },
  {
    key: 'fontWeight', levelKey: 'fontWeight', eq: eqStrict,
    dependents: [{ key: 'separatorFontWeight', levelKey: 'separatorFontWeight' }],
  },
  {
    key: 'italic', levelKey: 'italic', eq: eqStrict,
    dependents: [{ key: 'separatorItalic', levelKey: 'separatorItalic' }],
  },
  { key: 'numberFormat', levelKey: 'numberFormat', eq: eqStrict },
  { key: 'separator', levelKey: 'separator', eq: eqStrict },
  { key: 'numberFontSize', levelKey: 'fontSize', eq: eqDim },
  { key: 'gap', eq: eqDim },
  { key: 'indent', levelKey: 'indent', eq: eqDim },
  { key: 'numberVerticalOffset', levelKey: 'verticalOffset', eq: eqDim },
  { key: 'marginTop', eq: eqDim },
  { key: 'marginBottom', eq: eqDim },
  { key: 'itemSpacing', eq: eqDim },
  { key: 'hangingIndent', eq: eqStrict },
  { key: 'separatorFontFamily', levelKey: 'separatorFontFamily', eq: eqStrict, inheritsFrom: 'fontFamily' },
  { key: 'separatorFontWeight', levelKey: 'separatorFontWeight', eq: eqStrict, inheritsFrom: 'fontWeight' },
  { key: 'separatorItalic', levelKey: 'separatorItalic', eq: eqStrict, inheritsFrom: 'italic' },
  { key: 'separatorColor', levelKey: 'separatorColor', eq: eqColor, inheritsFrom: 'color' },
  { key: 'separatorGap', levelKey: 'separatorGap', eq: eqDim },
];

/**
 * Apply a partial list config on top of a resolved one. A list-wide value
 * propagates to every level (and dependent field) whose current value still
 * equals the value it was resolved from — a level with its own value keeps
 * it (the same heuristic the callout overrides use). Entries in `levels`
 * then apply directly to their level.
 */
function applyListOverrides<B extends { levels: L[] }, L extends { level: number }>(
  base: B,
  override: object | undefined,
  specs: ListFieldSpec[],
): B {
  if (!override) return base;
  const ov = override as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  const levels = base.levels.map((l) => ({ ...l }) as Record<string, unknown>);
  const setField = (target: Record<string, unknown>, spec: ListFieldSpec, onLevel: boolean, value: unknown) => {
    const key = onLevel ? spec.levelKey! : spec.key;
    const prev = target[key];
    target[key] = value;
    for (const dep of spec.dependents ?? []) {
      const depKey = onLevel ? dep.levelKey : dep.key;
      if (spec.eq(target[depKey], prev)) target[depKey] = value;
    }
  };
  for (const spec of specs) {
    const value = ov[spec.key];
    if (value === undefined) continue;
    const prevGeneral = out[spec.key];
    setField(out, spec, false, value);
    if (!spec.levelKey) continue;
    for (const l of levels) {
      const current = l[spec.levelKey];
      const inherited =
        spec.eq(current, prevGeneral) ||
        (spec.inheritsFrom !== undefined && spec.eq(current, l[spec.inheritsFrom]));
      if (inherited) setField(l, spec, true, value);
    }
  }
  const levelOverrides = (ov.levels as Array<Record<string, unknown>> | undefined) ?? [];
  for (const lo of levelOverrides) {
    const target = levels.find((l) => l.level === lo.level);
    if (!target) continue;
    for (const spec of specs) {
      if (!spec.levelKey) continue;
      const value = lo[spec.levelKey];
      if (value !== undefined) setField(target, spec, true, value);
    }
  }
  out.levels = levels;
  return out as unknown as B;
}

/** Shallow copy of `resolved` whose `bodyText` and list configs carry the
 *  `parts.bodyStyle` overrides, so the body/list resolvers yield the part
 *  typography without any part-specific branches (the callout approach).
 *  Ordered-list numbers are set bold in `numberColor`; bullets take
 *  `bulletColor`. Level-specific values only follow an override when they
 *  still equal the general value they were resolved from. The
 *  `bodyStyle.unorderedLists` / `orderedLists` partials apply last. */
export function derivePartResolvedConfig(resolved: ResolvedConfig): ResolvedConfig {
  const { bodyStyle } = resolved.parts;
  const bold = resolved.bodyText.boldFontWeight;
  const unorderedLists = applyListOverrides(
    applyListOverrides(resolved.unorderedLists, { color: bodyStyle.bulletColor }, UNORDERED_FIELDS),
    bodyStyle.unorderedLists,
    UNORDERED_FIELDS,
  );
  const orderedLists = applyListOverrides(
    applyListOverrides(resolved.orderedLists, { color: bodyStyle.numberColor, fontWeight: bold }, ORDERED_FIELDS),
    bodyStyle.orderedLists,
    ORDERED_FIELDS,
  );
  return {
    ...resolved,
    bodyText: {
      ...resolved.bodyText,
      fontFamily: bodyStyle.fontFamily,
      fontSize: bodyStyle.fontSize,
      lineHeight: bodyStyle.lineHeight,
      color: bodyStyle.color,
      textAlign: bodyStyle.textAlign,
    },
    unorderedLists,
    orderedLists,
  };
}

/** Measurement context for the blocks inside a part: the derived config
 *  plus the body / blockquote styles, list indents and ordered-list number
 *  widths recomputed from it. */
export function derivePartMeasureContext(ctx: BlockMeasureContext): BlockMeasureContext {
  const resolved = derivePartResolvedConfig(ctx.resolved);
  const bodyStyle = resolveBodyStyle(resolved);
  const orderedMetrics = computeOrderedListRunMetrics(
    [...ctx.contentBlocks],
    resolved,
    bodyStyle.fontSizePx,
  );
  return {
    ...ctx,
    resolved,
    bodyStyle,
    blockquoteStyle: resolveBlockquoteStyle(resolved),
    listLevelIndentsPx: computeLevelIndentsPx(resolved, bodyStyle.fontSizePx),
    orderedMetrics,
    orderedLevelIndentsPx: computeOrderedLevelIndentsPx(
      resolved,
      bodyStyle.fontSizePx,
      orderedMetrics.maxWidthByDepth,
    ),
  };
}
