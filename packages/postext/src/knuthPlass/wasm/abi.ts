/**
 * The JavaScript side of the WebAssembly line breaker (rust/crates/wasm):
 * the call `computeBreakpoints(items, options)` makes, answered by the Rust
 * engine. A paragraph is written straight into buffers the module owns,
 * nine f64 per item, and the breaks are read back the same way; nothing is
 * serialised and nothing is allocated per paragraph once the buffers have
 * grown.
 */

import type { KPItem, KPOptions } from '../types';
import { DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT, DEFAULT_FITNESS_CLASS_DEMERIT } from '../constants';

/** What the module exports (`rust/crates/wasm/src/linebreak.rs`). */
interface LineBreakExports {
  memory: WebAssembly.Memory;
  lb_new(): number;
  lb_items(ctx: number, count: number): number;
  lb_widths(ctx: number, count: number): number;
  lb_avoid(ctx: number, count: number): number;
  lb_fixed(ctx: number, count: number): number;
  lb_set_options(
    ctx: number,
    uniformFrom: number,
    normalSpaceWidth: number,
    maxStretchRatio: number,
    consecutiveHyphenDemerit: number,
    fitnessClassDemerit: number,
    runtPenalty: number,
    runtMinWidth: number,
    looseness: number,
    trackingPerChar: number,
    raggedStretch: number,
    hyphenationZone: number,
    flags: number,
  ): void;
  lb_break(ctx: number): number;
  lb_breaks(ctx: number): number;
}

/** f64 per staged item: kind, width, stretch, shrink, penalty, flags,
 *  chars, post width, post chars. */
const STRIDE = 9;
const FLAGGED = 1;
const ZONED = 2;
const NO_TRACKING = 4;
const WORD_SPACE = 8;

export type Breaker = (items: KPItem[], options: KPOptions) => number[];

/** A line breaker over an instance of the module. */
export function wasmBreaker(instance: WebAssembly.Instance): Breaker {
  const x = instance.exports as unknown as LineBreakExports;
  const ctx = x.lb_new();
  // Views are made after the call that sizes their buffer: a call may grow
  // the memory, which detaches every view made before it.
  const f64 = (ptr: number, n: number) => new Float64Array(x.memory.buffer, ptr, n);
  const u32 = (ptr: number, n: number) => new Uint32Array(x.memory.buffer, ptr, n);

  return (items, options) => {
    const n = items.length;
    const rows = f64(x.lb_items(ctx, n), n * STRIDE);
    for (let i = 0, o = 0; i < n; i++, o += STRIDE) {
      const it = items[i]!;
      rows[o + 1] = it.width;
      if (it.type === 'glue') {
        rows[o] = 1;
        rows[o + 2] = it.stretch;
        rows[o + 3] = it.shrink;
        rows[o + 4] = 0;
        rows[o + 5] = it.sourceIndex >= 0 ? WORD_SPACE : 0;
        rows[o + 6] = 0;
        rows[o + 7] = 0;
        rows[o + 8] = 0;
      } else if (it.type === 'box') {
        rows[o] = 0;
        rows[o + 2] = it.stretch ?? 0;
        rows[o + 3] = 0;
        rows[o + 4] = 0;
        rows[o + 5] = it.noTracking ? NO_TRACKING : 0;
        rows[o + 6] = it.chars ?? 0;
        rows[o + 7] = 0;
        rows[o + 8] = 0;
      } else {
        rows[o] = 2;
        rows[o + 2] = 0;
        rows[o + 3] = 0;
        rows[o + 4] = it.penalty;
        rows[o + 5] = (it.flagged ? FLAGGED : 0) | (it.zoned ? ZONED : 0);
        rows[o + 6] = it.chars ?? 0;
        rows[o + 7] = (it.postWidth ?? 0) + (it.postShift ?? 0);
        rows[o + 8] = it.postChars ?? 0;
      }
    }
    // The measure, line by line until it is uniform (every line a
    // paragraph of these items could have, when it never is).
    const uniform = options.lineWidthUniformFrom;
    const lines = (uniform ?? n) + 1;
    const widths = f64(x.lb_widths(ctx, lines), lines);
    for (let l = 0; l < lines; l++) widths[l] = options.lineWidth(l);
    const avoid = options.avoidHyphenAtLines ?? [];
    u32(x.lb_avoid(ctx, avoid.length), avoid.length).set(avoid);
    const fixed = options.fixedBreaks ?? [];
    u32(x.lb_fixed(ctx, fixed.length), fixed.length).set(fixed);
    x.lb_set_options(
      ctx,
      uniform ?? -1,
      options.normalSpaceWidth,
      options.maxStretchRatio,
      options.consecutiveHyphenDemerit ?? DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
      options.fitnessClassDemerit ?? DEFAULT_FITNESS_CLASS_DEMERIT,
      options.runtPenalty ?? 0,
      options.runtMinWidth ?? 0,
      options.looseness ?? 0,
      options.trackingPerChar ?? 0,
      options.raggedStretch ?? 0,
      options.hyphenationZone ?? -1,
      options.runtGraded ? 1 : 0,
    );
    const count = x.lb_break(ctx);
    return Array.from(u32(x.lb_breaks(ctx), count));
  };
}
