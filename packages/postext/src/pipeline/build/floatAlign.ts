// The driver's rounds for figures lined up across the columns of their band
// (`layout.alignFloatsAcrossColumns`): pads read off the first layout, so
// the citing-page, cap and balancing passes place the figures with their
// white; and the pads read again off the last layout the driver keeps,
// placed again when they changed (a figure moved, its neighbour went), so
// no figure keeps white for a neighbour it no longer has.
import type { BandCap } from '../columns/bandCaps.js';
import { type FloatPad, MAX_FLOAT_PAD_ROUNDS, proposeFloatPads, samePads } from './floatPads.js';
import { type PullOutcome, pullHeld } from './floatPull.js';
import type { PassResult } from './passTypes.js';

/** The pads every pass of a build is placed with; the rounds change them. */
export interface FloatAlignState {
  pads: ReadonlyMap<string, FloatPad>;
}

/**
 * Pads for the figures of `start`, and the document placed again with them
 * until the pads hold (a padded figure can move another), for at most
 * {@link MAX_FLOAT_PAD_ROUNDS} passes. `run` places the document with
 * `state.pads`.
 */
export function* lineUpFloats(
  start: PassResult,
  state: FloatAlignState,
  run: () => PassResult,
): Generator<void, PassResult, void> {
  let result = start;
  for (let round = 0; round < MAX_FLOAT_PAD_ROUNDS; round++) {
    const next = proposeFloatPads(result.doc, result.floatSlots, state.pads);
    if (samePads(next, state.pads)) break;
    state.pads = next;
    result = run();
    yield;
  }
  return result;
}

/**
 * The pads read again off `best`, the layout the driver keeps after its
 * last pass. When they are the pads it was placed with, `best` stands.
 * Otherwise it is placed again (`run`, with the driver's settled hints)
 * with the pads it asks for, until a layout is borne out by its own pads;
 * one that does not `hold` what the driver settled (its caps, the floats at
 * their citing page, no page more) ends the rounds. Without such a layout,
 * the figures are placed without pads; and if that does not hold either,
 * `best` stands as it is. Returns the layout kept and the passes run.
 */
export function* settleFloatPads(
  best: PassResult,
  state: FloatAlignState,
  run: () => PassResult,
  holds: (next: PassResult) => boolean,
): Generator<void, { result: PassResult; passes: number }, void> {
  let proposal = proposeFloatPads(best.doc, best.floatSlots, state.pads);
  if (samePads(proposal, state.pads)) return { result: best, passes: 0 };
  const kept = state.pads;
  let passes = 0;
  for (let round = 0; round < MAX_FLOAT_PAD_ROUNDS; round++) {
    state.pads = proposal;
    const next = run();
    passes++;
    yield;
    if (!holds(next)) break;
    proposal = proposeFloatPads(next.doc, next.floatSlots, state.pads);
    if (samePads(proposal, state.pads)) return { result: next, passes };
  }
  if (kept.size > 0) {
    state.pads = new Map();
    const plain = run();
    passes++;
    yield;
    if (holds(plain)) return { result: plain, passes };
  }
  state.pads = kept;
  return { result: best, passes };
}

/** Whether `next` keeps what the driver settled in `best`: no page more,
 *  every band cap `best` delivered still delivered, no float heading its
 *  citing page refused that `best` kept (#633), the floats pulled to their
 *  citing page still there (#1492). */
export function holdsSettled(best: PassResult, next: PassResult, bandCaps: ReadonlyMap<number, BandCap>, pull: PullOutcome): boolean {
  return next.doc.pages.length <= best.doc.pages.length
    && [...bandCaps.keys()].every((i) => !best.spanPlacedInBand.has(i) || next.spanPlacedInBand.has(i))
    && [...next.citingPageRefused.keys()].every((id) => best.citingPageRefused.has(id))
    && pullHeld(pull, next.doc);
}
