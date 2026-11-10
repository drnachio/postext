/**
 * Core Knuth-Plass dynamic-programming breakpoint selection.
 */

import type { KPItem, KPOptions } from './types.js';
import type { Breaker } from './wasm/abi.js';
import { readyWasmBreaker } from './wasm/engine.js';
import { limited } from './breakpoints/limited.js';

export { foldEdge, isMonosyllable, edgesStack } from './breakpoints/edges.js';

export { adjustLine } from './breakpoints/adjust.js';
export type { LineAdjustment } from './breakpoints/adjust.js';

/** Research hooks (#779), read once per call and absent in normal runs:
 *  `__postextKpTap` sees every call with its breaks, so a benchmark can
 *  record a book's calls and replay them against another implementation;
 *  `__postextKpImpl` answers the calls instead. */
type BreakpointsTap = (items: KPItem[], options: KPOptions, breaks: number[]) => void;
interface BreakpointsHooks {
  __postextKpTap?: BreakpointsTap;
  __postextKpImpl?: Breaker;
}

/**
 * The breaks of a paragraph: the index of the item each line ends at. Set
 * by the Rust line breaker compiled to WebAssembly when it is available
 * (see `wasm/engine.ts`), else by {@link breakpoints}; the two choose the
 * same breaks.
 */
export function computeBreakpoints(items: KPItem[], options: KPOptions): number[] {
  const hooks = globalThis as BreakpointsHooks;
  // The WebAssembly breaker applies the composition rules too (strict
  // hyphenation, stacks, hyphen spacing and limits, the cost of each
  // hyphen), with the line edges stacks compare worked out here
  // (`wasm/abi.ts`).
  const breaks = (hooks.__postextKpImpl ?? readyWasmBreaker() ?? breakpoints)(items, options);
  hooks.__postextKpTap?.(items, options, breaks);
  return breaks;
}

/** {@link computeBreakpoints} in TypeScript: the reference the WebAssembly
 *  breaker is tested against. */
export function computeBreakpointsTs(items: KPItem[], options: KPOptions): number[] {
  return breakpoints(items, options);
}

function breakpoints(items: KPItem[], options: KPOptions): number[] {
  const looseness = options.looseness ?? 0;
  if (looseness <= 0) return limited(items, options)?.breaks ?? [];
  // A longer setting (TeX \looseness > 0: one line more, to fill a short
  // column) takes two searches (#780). The natural one, whose nodes merge by
  // fitness class and so stay few. Then one that keeps every line count
  // apart for the target, but never lets a line be very loose (fitness
  // class 3, word spacing at `maxStretchRatio` or more): such a chain can never be the longer setting, and counted in
  // it was what made a single search quadratic (25 000 active nodes on one
  // paragraph, 39 % of a whole book's layout). It also made that search
  // lose settings: a cheaper chain with a very loose line could take the
  // key of the only acceptable one. None found: the natural setting. Nor
  // may the longer setting break more limits than the natural one.
  const natural = limited(items, { ...options, looseness: 0 });
  if (!natural || natural.breaks.length === 0) return natural?.breaks ?? [];
  return limited(items, options, natural.breaks.length + looseness, natural.hard)?.breaks ?? natural.breaks;
}
