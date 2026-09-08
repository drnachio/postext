/**
 * Pre-pass and derived typography for `:::part{number="…" title="…"}`
 * containers. Like the other container plans, part ranges are resolved up
 * front per content-block index (the placement loop rewinds `blockIdx` on
 * keep-with-next rollbacks and replays the markers in between).
 */

import type { ContentBlock } from '../parse';
import type { ResolvedConfig } from '../vdt';
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

/** Shallow copy of `resolved` whose `bodyText` and list configs carry the
 *  `parts.bodyStyle` overrides, so the body/list resolvers yield the part
 *  typography without any part-specific branches (the callout approach).
 *  Ordered-list numbers are set bold in `numberColor`; bullets take
 *  `bulletColor`. Level-specific colours only follow the override when it
 *  differs from the general value they were resolved from. */
export function derivePartResolvedConfig(resolved: ResolvedConfig): ResolvedConfig {
  const { bodyStyle } = resolved.parts;
  const ul = resolved.unorderedLists;
  const ol = resolved.orderedLists;
  const bold = resolved.bodyText.boldFontWeight;
  const bulletOverride = bodyStyle.bulletColor.hex !== ul.color.hex;
  const numberOverride = bodyStyle.numberColor.hex !== ol.color.hex;
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
    unorderedLists: {
      ...ul,
      color: bodyStyle.bulletColor,
      levels: ul.levels.map((l) => ({ ...l, color: bulletOverride ? bodyStyle.bulletColor : l.color })),
    },
    orderedLists: {
      ...ol,
      color: bodyStyle.numberColor,
      fontWeight: bold,
      levels: ol.levels.map((l) => ({
        ...l,
        fontWeight: bold,
        color: numberOverride ? bodyStyle.numberColor : l.color,
      })),
    },
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
