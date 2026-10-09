/**
 * Text wrap (#627): text running beside a picture or a box narrower than
 * its column.
 *
 * The wrapped item is first placed as it would be without wrapping: an
 * inline figure atomically at the cursor, a float in its band at the head
 * or foot of its column. When the next block can run beside it (a
 * paragraph, a quotation, a list item), the band is given back to the flow
 * and recorded as an exclusion of the column (`VDTColumn.exclusions`): the
 * flow's cursor may then run beside it, and every text block that takes
 * lines next to it is broken with those lines set short
 * (`MeasureBlockOptions.lineInsets`, `wrapInsetSteps`). A block that cannot
 * run beside it (a heading, a display formula, a figure, a box, a table)
 * settles the column first: below a picture at the head of the text, the
 * cursor goes under it; above one at the column's foot, the column ends at
 * its top. So does leaving the column. A block that never meets a wrap is
 * set exactly as before.
 *
 * This module holds the pure parts: the settings as a resource reads them,
 * the exclusions still open in each column (per pass: columns are created
 * afresh by every placement pass) and the line insets they ask of a block.
 */

import type { ContentBlock } from '../parse';
import type { Dimension, Resource, ResourceType, ResolvedTextWrapConfig } from '../types';
import type { VDTColumn, VDTExclusion } from '../vdt';
import type { LineInsetStep } from '../measure/types';
import { lineInsetsAt } from '../measure/types';
import { dimensionToPx } from '../units';
import { wrapWidthOf } from '../defaults/layout';
import { parseLengthText } from '../defaults/tabStops';

/** A `wrap` value as a side of the flow: `'start'` is `'left'`, `'end'` is
 *  `'right'`; `'none'` and anything else are no wrap. */
export function wrapSideOf(value: unknown): 'left' | 'right' | undefined {
  if (value === 'left' || value === 'start') return 'left';
  if (value === 'right' || value === 'end') return 'right';
  return undefined;
}

/** A resource's wrap, resolved: its side, the share of the column it
 *  takes and its gap (unset: the document's). */
export interface ResolvedWrap {
  side: 'left' | 'right';
  width: number;
  gap?: Dimension;
}

/** The wrap a resource asks for: its own placement, then its type's
 *  `defaultPlacement`. `undefined` when it does not wrap. */
export function resolveResourceWrap(
  resource: Resource,
  type: ResourceType | undefined,
  settings: ResolvedTextWrapConfig,
): ResolvedWrap | undefined {
  const side = wrapSideOf(resource.placement?.wrap ?? type?.defaultPlacement?.wrap);
  if (!side) return undefined;
  const width = wrapWidthOf(resource.placement?.width ?? type?.defaultPlacement?.width) ?? settings.defaultWidth;
  const gap = resource.placement?.wrapGap ?? type?.defaultPlacement?.wrapGap ?? settings.gap;
  return { side, width, ...(gap ? { gap } : {}) };
}

/** The gap of a wrap in px: its own, else one body line (`floatGapPx`). */
export function wrapGapPx(gap: Dimension | undefined, dpi: number, bodyFontSizePx: number, floatGapPx: number): number {
  return gap ? Math.max(0, dimensionToPx(gap, dpi, bodyFontSizePx)) : floatGapPx;
}

/** `layout.wrap.minTextWidth` in px for a column `columnWidth` wide. */
export function minTextWidthPx(min: Dimension | number, columnWidth: number, dpi: number, bodyFontSizePx: number): number {
  return typeof min === 'number' ? min * columnWidth : dimensionToPx(min, dpi, bodyFontSizePx);
}

/** Whether a block may run beside a wrapped item: running text that splits
 *  line by line (a paragraph, a quotation, a list item). A poem, a
 *  contents or index row, a heading, a formula and every atomic block
 *  clear it. */
export function runsBesideWrap(block: ContentBlock): boolean {
  if (block.toc !== undefined || block.index !== undefined) return false;
  if (block.type === 'paragraph') return block.verse === undefined;
  return block.type === 'blockquote' || block.type === 'listItem';
}

/** Whether a block takes nothing from the flow on its own and leaves an
 *  open wrap as it is: the markers of a `:::paragraphs` group and a
 *  numbering change. */
export function transparentToWrap(block: ContentBlock): boolean {
  if (block.type === 'containerStart' || block.type === 'containerEnd') {
    const name = block.containerName;
    return name !== 'callout' && name !== 'part' && name !== 'paper';
  }
  return block.type === 'directive' && block.directiveName === 'numbering';
}

/** An exclusion still open in its column: the text has not gone past it. */
export interface OpenWrap {
  ex: VDTExclusion;
  /** `'top'`: it starts at or above the flow's cursor (an inline figure, a
   *  float at the column's head); settling takes the cursor under it.
   *  `'bottom'`: it stands at the column's foot, below the cursor;
   *  settling ends the column at its top. */
  kind: 'top' | 'bottom';
}

const openWraps = new WeakMap<VDTColumn, OpenWrap[]>();

/** Record an exclusion of `col` and open it to the flow. */
export function openColumnWrap(col: VDTColumn, ex: VDTExclusion, kind: OpenWrap['kind']): void {
  (col.exclusions ??= []).push(ex);
  const list = openWraps.get(col);
  if (list) list.push({ ex, kind });
  else openWraps.set(col, [{ ex, kind }]);
}

/** The exclusions of `col` the flow may still run beside. */
export function openColumnWraps(col: VDTColumn): readonly OpenWrap[] {
  return openWraps.get(col) ?? [];
}

/** The flow's cursor in `col` (page y of the next block's top, before its
 *  spacing). */
export function columnCursorY(col: VDTColumn): number {
  return col.bbox.y + col.bbox.height - col.availableHeight;
}

/**
 * Close the open exclusions of `col`: under one that starts at or above
 * the cursor the flow goes on below it; above one at the column's foot the
 * column ends at its top. Returns whether the cursor moved down (the
 * space the text was owing is then taken by the wrap's own gap).
 */
export function settleColumnWraps(col: VDTColumn): boolean {
  const list = openWraps.get(col);
  if (!list || list.length === 0) return false;
  openWraps.delete(col);
  const before = col.availableHeight;
  const colBottom = col.bbox.y + col.bbox.height;
  for (const { ex, kind } of list) {
    const y = columnCursorY(col);
    if (kind === 'top') {
      const bottom = ex.y + ex.height;
      if (y < bottom - 0.01) col.availableHeight = Math.max(0, Math.min(col.availableHeight, colBottom - bottom));
    } else {
      col.availableHeight = Math.max(0, Math.min(col.availableHeight, ex.y - y));
    }
  }
  return col.availableHeight < before - 0.01;
}

/**
 * The lines of a text block set short by the open exclusions of `col`
 * when its first line's top is at `y0` and its lines are `lineHeight`
 * apart: a line that meets an exclusion on a grid line (even in part) is
 * beside it. Line numbers count from `firstLine` (the lines of the block
 * already placed elsewhere). The insets are the exclusions' widths, from
 * the column's sides: they add to the block's own indents.
 */
export function wrapInsetSteps(col: VDTColumn, y0: number, lineHeight: number, firstLine: number): LineInsetStep[] {
  const steps: LineInsetStep[] = [];
  if (!(lineHeight > 0)) return steps;
  for (const { ex } of openColumnWraps(col)) {
    const top = ex.y;
    const bottom = ex.y + ex.height;
    if (bottom <= y0 + 0.01) continue;
    const from = Math.max(0, Math.floor((top - y0 + 0.01) / lineHeight));
    const to = Math.ceil((bottom - y0 - 0.01) / lineHeight) - 1;
    if (to < from) continue;
    steps.push({
      fromLine: firstLine + from,
      toLine: firstLine + to,
      startInsetPx: ex.side === 'left' ? ex.width : 0,
      endInsetPx: ex.side === 'right' ? ex.width : 0,
    });
  }
  return steps;
}

/** The steps of `steps` for the lines before `line`, cut there. */
export function insetsBefore(steps: readonly LineInsetStep[], line: number): LineInsetStep[] {
  const out: LineInsetStep[] = [];
  for (const s of steps) {
    if (s.fromLine >= line) continue;
    const to = s.toLine === undefined ? line - 1 : Math.min(s.toLine, line - 1);
    out.push({ ...s, toLine: to });
  }
  return out;
}

/** Whether two sets of insets set every line from `line` on alike. */
export function sameInsetsFrom(a: readonly LineInsetStep[], b: readonly LineInsetStep[], line: number): boolean {
  let last = line;
  for (const s of [...a, ...b]) last = Math.max(last, s.toLine ?? s.fromLine);
  for (let li = line; li <= last; li++) {
    const x = lineInsetsAt(a, li);
    const y = lineInsetsAt(b, li);
    if (Math.abs(x.start - y.start) > 0.01 || Math.abs(x.end - y.end) > 0.01) return false;
  }
  return true;
}

/** The wrap a box asks for with its fence's attributes (#627):
 *  `wrap="left|right|start|end"`, `width` (a share of the column, 0 to 1;
 *  else `layout.wrap.defaultWidth`) and `wrapGap` (a length, `6pt`).
 *  `undefined` when it does not wrap. */
export function resolveCalloutWrap(
  attrs: Readonly<Record<string, string | undefined>>,
  settings: ResolvedTextWrapConfig,
): ResolvedWrap | undefined {
  const side = wrapSideOf(attrs.wrap?.trim().toLowerCase());
  if (!side) return undefined;
  const raw = attrs.width !== undefined ? Number(attrs.width.trim()) : undefined;
  const width = wrapWidthOf(raw) ?? settings.defaultWidth;
  const gap = attrs.wrapGap !== undefined ? parseLengthText(attrs.wrapGap) : undefined;
  const ownGap = gap && gap.value >= 0 ? gap : settings.gap;
  return { side, width, ...(ownGap ? { gap: ownGap } : {}) };
}
