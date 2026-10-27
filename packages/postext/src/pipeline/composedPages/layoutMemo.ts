/**
 * A memo of whole frame layouts for one layout of a composed page (#972).
 *
 * The reflow ladder (#858) lays the page again at every step, and most
 * frames come out of a step as they went into it: the same story cut, at
 * the same width and height, in the same style, round the same
 * rectangles. `layoutRange` (the box typesetter, `frameLayout.ts`) asks
 * this memo before it lays such a range out and gets a copy of the earlier
 * result. The measurement memo (#953) already spares the measuring; what
 * is left is the placing, and the splitting probes, which lay the same
 * ranges the frame's final layout then needs.
 *
 * The memo lives as long as one `layoutComposedPage` run, as the
 * measurement memo does: what a layout reads besides its arguments (the
 * boxes that left the flow, a block's numbers, the page's column height)
 * is fixed only within the run.
 *
 * A caller that goes on to move the result (the frame's commit shifts it
 * to the page) gets a private deep copy; a caller that only reads it (the
 * splitting probes) gets the stored one. The copy keeps what the layout
 * keeps by identity (the designed headings of boxes, the end indent of a
 * block) and a layout that holds anything the copy cannot reproduce (a
 * comic page, with its own registries; a class instance) is never kept.
 * A layout writes to the measure context too (the drop cap notes and the
 * joining-script marks); those writes are recorded with the entry and
 * replayed on a hit, so the context ends up as if the range had been laid
 * out again.
 */

import type { ResolvedCalloutStyleConfig } from '../../types.js';
import type { VDTBlock } from '../../vdt.js';
import { copyBlockEndIndent } from '../blocks/buildHelpers.js';
import { copyDesignedBoxHeading, type CalloutLayoutResult } from '../callouts/calloutLayout.js';
import type { BlockMeasureContext, DropCapNote } from '../blocks/measureContentBlock.js';
import { idOf, measureStateKey } from './measureMemo.js';

type NoteWrite = readonly [kind: 'set', block: number, note: DropCapNote] | readonly [kind: 'delete', block: number];

interface LayoutEntry {
  /** `kept`: `result` holds the layout; `never`: it cannot be copied. */
  state: 'kept' | 'never';
  /** The layout as it came out, before anyone moved it. */
  result: CalloutLayoutResult | null;
  notes: NoteWrite[];
  joined: number[];
}

export interface LayoutMemo {
  readonly ids: WeakMap<object, number>;
  next: number;
  /** Box styles by content: the ladder resolves a frame's style again on
   *  every composition, so two layouts in equal styles hold two objects. */
  readonly styles: Map<string, number>;
  readonly styleOf: WeakMap<object, number>;
  readonly entries: Map<string, LayoutEntry>;
  /** Set while a layout is being recorded: a layout asked for from inside
   *  one is laid out without the memo. */
  recording: boolean;
  hits: number;
  misses: number;
}

/** Off only in tests, which lay a page both ways and compare. */
export const layoutMemoSwitch = { enabled: true, hits: 0 };

export function createLayoutMemo(): LayoutMemo {
  return { ids: new WeakMap(), next: 1, styles: new Map(), styleOf: new WeakMap(), entries: new Map(), recording: false, hits: 0, misses: 0 };
}

/** A number for the content of `style`: equal styles share one. */
function styleIdOf(memo: LayoutMemo, style: ResolvedCalloutStyleConfig): number {
  let id = memo.styleOf.get(style);
  if (id === undefined) {
    const text = JSON.stringify(style);
    id = memo.styles.get(text);
    if (id === undefined) memo.styles.set(text, (id = memo.styles.size + 1));
    memo.styleOf.set(style, id);
  }
  return id;
}

/** What a layout of a range reads (see `makeCalloutLayouter`): where it
 *  stands in the pass, the box style, the cut, the width, the frame's
 *  options and the measuring state. */
export function layoutKey(
  memo: LayoutMemo,
  pass: object,
  ctx: BlockMeasureContext,
  startIdx: number,
  endIdx: number,
  style: ResolvedCalloutStyleConfig,
  from: unknown,
  to: unknown,
  width: number,
  frameId: string,
  continuation: boolean,
  mirrored: boolean,
  frame: unknown,
): string {
  return `${idOf(memo, pass)}|${idOf(memo, ctx)}|${startIdx}|${endIdx}|${styleIdOf(memo, style)}|${JSON.stringify(from)}|${JSON.stringify(to)}|${width}|${frameId}|${continuation ? 1 : 0}|${mirrored ? 1 : 0}|${frame ? JSON.stringify(frame) : ''}|${measureStateKey()}`;
}

class NotCopyable extends Error {}

/** A deep copy of plain data, sharing preserved: an object that two parts
 *  of the result refer to is one object in the copy, as in the original. */
function copyData(value: unknown, seen: Map<object, object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  const known = seen.get(value);
  if (known) return known;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = copyData(value[i], seen);
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new NotCopyable();
  const out: Record<string, unknown> = proto === null ? Object.create(null) : {};
  seen.set(value, out);
  const src = value as Record<string, unknown>;
  for (const key in src) out[key] = copyData(src[key], seen);
  if ('lines' in src && 'bbox' in src) {
    copyBlockEndIndent(value as VDTBlock, out as unknown as VDTBlock);
    copyDesignedBoxHeading(value as VDTBlock, out as unknown as VDTBlock);
  }
  return out;
}

/** A private copy of a layout, `null` when it holds what a copy cannot
 *  reproduce. */
export function copyLayout(result: CalloutLayoutResult): CalloutLayoutResult | null {
  // A comic page keeps registries of its own by identity.
  if (result.frame.comic || result.children.some((b) => b.comic)) return null;
  try {
    return copyData(result, new Map()) as CalloutLayoutResult;
  } catch (e) {
    if (e instanceof NotCopyable) return null;
    throw e;
  }
}

/** Lay out through the memo. `shared`: the caller only reads the result
 *  and may be given the stored one. */
export function memoLayout(
  memo: LayoutMemo,
  key: string,
  ctx: BlockMeasureContext,
  shared: boolean,
  compute: () => CalloutLayoutResult,
): CalloutLayoutResult {
  const known = memo.entries.get(key);
  if (known?.state === 'kept') {
    // A reader may be given the stored layout; one that moves it needs a
    // copy, and a layout that cannot be copied is not kept.
    const given = shared ? known.result! : copyLayout(known.result!);
    if (given) {
      memo.hits++;
      layoutMemoSwitch.hits++;
      const notes = ctx.dropCapNotes;
      for (const w of known.notes) {
        if (w[0] === 'set') notes?.set(w[1], w[2]);
        else notes?.delete(w[1]);
      }
      for (const b of known.joined) ctx.joiningLetterSpacing?.add(b);
      return given;
    }
    known.state = 'never';
  }
  if (known?.state === 'never' || memo.recording) return compute();
  memo.misses++;
  const notes: NoteWrite[] = [];
  const joined: number[] = [];
  const map = ctx.dropCapNotes;
  const set = ctx.joiningLetterSpacing;
  memo.recording = true;
  const holder = map as unknown as { set?: unknown; delete?: unknown } | undefined;
  const setHolder = set as unknown as { add?: unknown } | undefined;
  if (map && holder) {
    holder.set = (k: number, v: DropCapNote) => { notes.push(['set', k, v]); return Map.prototype.set.call(map, k, v); };
    holder.delete = (k: number) => { notes.push(['delete', k]); return Map.prototype.delete.call(map, k); };
  }
  if (set && setHolder) setHolder.add = (v: number) => { joined.push(v); return Set.prototype.add.call(set, v); };
  let result: CalloutLayoutResult;
  try {
    result = compute();
  } finally {
    if (holder) { delete holder.set; delete holder.delete; }
    if (setHolder) delete setHolder.add;
    memo.recording = false;
  }
  // A caller that moves the result gets it as it is; the memo keeps its
  // own copy made before that. A reader's result is kept itself.
  const kept = shared ? result : copyLayout(result);
  memo.entries.set(key, kept ? { state: 'kept', result: kept, notes, joined } : { state: 'never', result: null, notes, joined });
  return result;
}
