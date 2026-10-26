/**
 * A memo of the box typesetter's measurements for one layout of a composed
 * page (#953).
 *
 * The reflow ladder (#858) lays the page again at every step, and the
 * frames that did not change set the same paragraphs at the same widths
 * each time (most `measureContentBlock` calls of a ladder repeat an earlier
 * one). A memo made for one `layoutComposedPage` run, and dropped with it,
 * answers the repeats. It lives only as long as the run because what a
 * measurement reads besides its arguments (the boxes that left the flow, a
 * block's numbers) is fixed for the run and may change before the next one.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { ResolvedCalloutStyleConfig } from '../../types.js';
import { getMeasureArabicNumbers, getMeasureDirection } from '../../measure/bidiLines.js';
import { measureLanguageKey } from '../../measure/canvas.js';
import { getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode } from '../../measure/vertical.js';
import { measureContentBlock, type BlockMeasureContext, type DropCapNote, type MeasureContentBlockOptions, type MeasuredContentBlock } from '../blocks/measureContentBlock.js';

interface MemoEntry {
  result: MeasuredContentBlock | null;
  /** The drop cap note the measurement left for the block, if any (it
   *  writes the notes of its context as a side effect). */
  note: DropCapNote | undefined;
  /** The measurement marked the block as set without letter-spacing. */
  joined: boolean;
}

export interface MeasureMemo {
  readonly ids: WeakMap<object, number>;
  next: number;
  readonly entries: Map<string, MemoEntry>;
}

export function createMeasureMemo(): MeasureMemo {
  return { ids: new WeakMap(), next: 1, entries: new Map() };
}

/** What the measuring code reads of the module state besides its
 *  arguments: writing mode, region, upright digits, direction, Arabic
 *  numerals and language. */
export const measureStateKey = (): string =>
  `${getMeasureWritingMode()}${getMeasureRegion()}${getMeasureUprightDigits()}${getMeasureDirection()}${getMeasureArabicNumbers() ? 'a' : ''}${measureLanguageKey()}`;

export const idOf = (memo: { readonly ids: WeakMap<object, number>; next: number }, o: object | undefined): number => {
  if (!o) return 0;
  let id = memo.ids.get(o);
  if (id === undefined) memo.ids.set(o, (id = memo.next++));
  return id;
};

/** `measureContentBlock(raw, blockIdx, width, derived, { styleOverride })`
 *  for a box of `style` whose children are measured in `ctx` (`derived` is
 *  `ctx` with the box's typography), remembered in `memo`. What the box's
 *  typography changes in the measurement is its `body` and `lists`
 *  (`deriveCalloutResolvedConfig`), which the styles a frame derives from
 *  one style share by identity. A figure or table is laid out afresh: its
 *  result is placed by moving it, so it is not kept. */
export function measureBlockMemo(
  memo: MeasureMemo,
  ctx: BlockMeasureContext,
  style: ResolvedCalloutStyleConfig,
  derived: BlockMeasureContext,
  raw: ContentBlock,
  blockIdx: number,
  width: number,
  styleOverride: MeasureContentBlockOptions['styleOverride'],
): MeasuredContentBlock | null {
  const key = `${idOf(memo, ctx)}|${style.id}|${idOf(memo, style.body)}|${idOf(memo, style.lists)}|${blockIdx}|${width}|${idOf(memo, styleOverride)}|${measureStateKey()}`;
  const notes = derived.dropCapNotes;
  const known = memo.entries.get(key);
  if (known) {
    if (notes) {
      if (known.note) notes.set(blockIdx, known.note);
      else notes.delete(blockIdx);
    }
    if (known.joined) derived.joiningLetterSpacing?.add(blockIdx);
    return known.result;
  }
  const joinedBefore = derived.joiningLetterSpacing?.has(blockIdx) ?? false;
  const result = measureContentBlock(raw, blockIdx, width, derived, { styleOverride });
  if (!result || result.resourceBlock) return result;
  memo.entries.set(key, {
    result,
    note: notes?.get(blockIdx),
    joined: !joinedBefore && (derived.joiningLetterSpacing?.has(blockIdx) ?? false),
  });
  return result;
}
