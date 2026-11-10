/**
 * The WebAssembly line breaker (#779) against the TypeScript one: the same
 * breaks on every paragraph, whatever the options. Random paragraphs cover
 * the options a book's corpus does not (tracking, zones, fixed breaks,
 * lines that avoid a hyphen, ragged settings, kashida boxes, stacks).
 */
import { describe, expect, it } from 'vitest';
import { computeBreakpoints, computeBreakpointsTs, type KPItem, type KPOptions } from '../../knuthPlass/index.js';
import { readyWasmBreaker } from '../../knuthPlass/wasm/engine.js';

/** A small seeded generator, so a failure names its paragraph. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Syllables the boxes' text is drawn from, few enough that line edges
 *  repeat (stacks), monosyllables and accents among them. */
const SYLLABLES = ['de', 'la', 'y', 'a', 'que', 'men', 'te', 'cla', 'ra', 'sól', 'sol', 'en', 'el', 'gen', 'ción'];

function paragraph(seed: number): { items: KPItem[]; options: KPOptions } {
  const r = rng(seed);
  // The text and the stacks come from a generator of their own, so the
  // paragraphs of every other option stay as they were.
  const t = rng(seed ^ 0x5eed);
  // And the hyphen rules from a third one (#1466).
  const h = rng(seed ^ 0x4a11);
  const words = 3 + Math.floor(r() * 120);
  const items: KPItem[] = [];
  const kashida = r() < 0.15;
  for (let w = 0; w < words; w++) {
    const syllables = r() < 0.3 ? 2 + Math.floor(r() * 3) : 1;
    for (let s = 0; s < syllables; s++) {
      // Now and then a box with no text (a formula), one with nothing to
      // compare (a footnote marker), and a zero-width break between two
      // words (#1463).
      const kind = t();
      if (kind < 0.02 && s === 0 && w > 0) items.push({ type: 'penalty', width: 0, penalty: 0, flagged: false, sourceIndex: -1, separates: true });
      items.push({
        type: 'box',
        width: 8 + r() * 50,
        sourceIndex: w,
        chars: 1 + Math.floor(r() * 6),
        ...(kind > 0.97 ? {} : { text: kind > 0.95 ? '' : SYLLABLES[Math.floor(t() * SYLLABLES.length)]! }),
        ...(r() < 0.05 ? { noTracking: true } : {}),
        ...(kashida && r() < 0.4 ? { stretch: r() * 12 } : {}),
      });
      if (s < syllables - 1) {
        items.push({
          type: 'penalty',
          width: 5,
          penalty: 50,
          flagged: true,
          sourceIndex: -1,
          chars: 1,
          ...(r() < 0.3 ? { zoned: true } : {}),
          ...(r() < 0.1 ? { postWidth: 3, postChars: 1, postShift: r() } : {}),
        });
      }
    }
    if (w < words - 1) {
      if (r() < 0.02) items.push({ type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: -1 });
      items.push({ type: 'glue', width: 10, stretch: 5 + r() * 5, shrink: 3, sourceIndex: w });
    }
  }
  items.push({ type: 'glue', width: 0, stretch: Number.MAX_SAFE_INTEGER, shrink: 0, sourceIndex: -1 });
  items.push({ type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: -1 });
  const measure = 200 + r() * 300;
  const indent = r() < 0.5 ? 20 : 0;
  const options: KPOptions = {
    lineWidth: (line) => (line === 0 ? measure - indent : measure),
    lineWidthUniformFrom: r() < 0.9 ? 1 : undefined,
    normalSpaceWidth: 10,
    maxStretchRatio: 1.5,
    minShrinkRatio: 0.7,
    runtPenalty: r() < 0.5 ? 1500 : 0,
    runtMinWidth: 60,
    runtGraded: r() < 0.3,
    looseness: [0, 0, 1, -1][Math.floor(r() * 4)]!,
    ...(r() < 0.2 ? { trackingPerChar: 0.3 } : {}),
    ...(r() < 0.15 ? { raggedStretch: 30 } : {}),
    ...(r() < 0.2 ? { hyphenationZone: 25 } : {}),
    ...(r() < 0.15 ? { avoidHyphenAtLines: [2, 4] } : {}),
    ...(t() < 0.4 ? { stacks: { minChars: 1 + Math.floor(t() * 4), demerits: [0, 500, 3000, 100000, 1e7][Math.floor(t() * 5)]! } } : {}),
    ...(h() < 0.4 ? { ladders: { maxRun: 1 + Math.floor(h() * 3), demerits: [0, 3000, 30000, 1e6][Math.floor(h() * 4)]! } } : {}),
    ...(h() < 0.3 ? { lastWordDemerits: [0, 5000, 30000, 1e6][Math.floor(h() * 4)]! } : {}),
    ...(h() < 0.3 ? { extraHyphenPenalty: 50 * (1 + Math.floor(h() * 10)) } : {}),
  };
  return { items, options };
}

describe('the WebAssembly line breaker', () => {
  it('compiles in this environment', () => {
    expect(readyWasmBreaker()).not.toBeNull();
  });

  it('chooses the TypeScript breaks on 800 random paragraphs', () => {
    const differ: number[] = [];
    for (let seed = 1; seed <= 800; seed++) {
      const { items, options } = paragraph(seed);
      if (JSON.stringify(computeBreakpoints(items, options)) !== JSON.stringify(computeBreakpointsTs(items, options))) differ.push(seed);
    }
    expect(differ).toEqual([]);
  }, 120_000);

  it('gives up the exact stacks search at the same cap as the TypeScript breaker', () => {
    // A paragraph long enough, in a measure wide enough, for the exact
    // search to pass EXACT_MAX_ACTIVE nodes (#1463).
    const items: KPItem[] = [];
    const r = rng(7);
    for (let w = 0; w < 3000; w++) {
      items.push({ type: 'box', width: 8 + r() * 40, sourceIndex: w, chars: 3, text: SYLLABLES[Math.floor(r() * SYLLABLES.length)]! });
      items.push({ type: 'glue', width: 10, stretch: 8, shrink: 4, sourceIndex: w });
    }
    items.push({ type: 'glue', width: 0, stretch: Number.MAX_SAFE_INTEGER, shrink: 0, sourceIndex: -1 });
    items.push({ type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: -1 });
    // A shorter setting keeps every line count apart, whatever the rule:
    // quadratic on a paragraph this long, and left out.
    for (const looseness of [0, 1]) {
      const options: KPOptions = {
        lineWidth: () => 900, lineWidthUniformFrom: 0, normalSpaceWidth: 10, maxStretchRatio: 2, minShrinkRatio: 0.6,
        looseness, stacks: { minChars: 2, demerits: 3000 },
      };
      expect(computeBreakpoints(items, options), `${looseness}`).toEqual(computeBreakpointsTs(items, options));
      // A hyphen ladder longer than one line keys the exact search too.
      const ladders: KPOptions = { ...options, ladders: { maxRun: 2, demerits: 30000 } };
      expect(computeBreakpoints(items, ladders), `${looseness} ladders`).toEqual(computeBreakpointsTs(items, ladders));
    }
  }, 60_000);

  it('keeps fixed breaks as the TypeScript breaker does', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { items, options } = paragraph(seed);
      const natural = computeBreakpointsTs(items, options);
      const fixed = { ...options, fixedBreaks: natural.slice(0, Math.min(2, natural.length - 1)) };
      expect(computeBreakpoints(items, fixed)).toEqual(computeBreakpointsTs(items, fixed));
    }
  });
});
