import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { measureBlock } from '../../measure/plain';
import { computeBreakpoints } from '../../knuthPlass';
import { HYPHEN_PENALTY, KP_INFINITY, MAX_STRETCH } from '../../knuthPlass/constants';
import type { KPItem } from '../../knuthPlass/types';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults';
import type { PostextConfig, VDTDocument } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const long = 'measurement comprehensive interpretation extraordinary circumstances considerable temperature approximately investigation particularly responsibility understanding communication international development environmental administration'.split(' ');
const short = 'the of and a to in is was for on that with as by it'.split(' ');
const text = (n: number, seed: number) =>
  `${Array.from({ length: n }, (_, i) => ((i * 3 + seed) % 4 === 0 ? long[(i * 7 + seed) % long.length] : short[(i * 5 + seed) % short.length])).join(' ')}.`;
const markdown = (seed: number) => Array.from({ length: 40 }, (_, i) => text(40 + ((i * 13 + seed) % 50), i + seed)).join('\n\n');

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (across?: boolean): PostextConfig => ({
  page: { dpi: 96, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'double' },
  bodyText: {
    textAlign: 'justify',
    hyphenation: { enabled: true, locale: 'en-us' },
    ...(across === undefined ? {} : { hyphenateAcrossColumns: across }),
  },
  headings: { levels: [] },
});

/** The columns whose last line ends on a hyphen (the word runs on in the
 *  next column or page). */
const hyphenEnds = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  for (const p of doc.pages) {
    p.columns.forEach((c, ci) => {
      const last = c.blocks[c.blocks.length - 1];
      if (last?.lines[last.lines.length - 1]?.hyphenated) out.push(`p${p.index}c${ci}`);
    });
  }
  return out;
};
const words = (doc: VDTDocument): string =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => (l.hyphenated ? l.text.replace(/-$/, '') : `${l.text} `))))).join('').replace(/\s+/g, ' ').trim();

describe('bodyText.hyphenateAcrossColumns (EF-86)', () => {
  it('is on by default, and stripped when on', () => {
    expect(resolveBodyTextConfig().hyphenateAcrossColumns).toBe(true);
    expect(stripBodyTextDefaults({ hyphenateAcrossColumns: true })).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenateAcrossColumns: false })).toEqual({ hyphenateAcrossColumns: false });
  });

  it('keeps a hyphen off the last line of a column when the spaces allow it', () => {
    const cache = createMeasurementCache();
    const on = buildDocument({ markdown: markdown(4) }, config(), cache);
    const off = buildDocument({ markdown: markdown(4) }, config(false), cache);
    // Non-vacuous: with the default, four columns end on a hyphen.
    expect(hyphenEnds(on).length).toBeGreaterThanOrEqual(3);
    expect(hyphenEnds(off)).toEqual([]);
    // Same text, same pages: only line breaks inside paragraphs moved.
    expect(words(off)).toBe(words(on));
    expect(off.pages.length).toBe(on.pages.length);
  }, 60_000);

  it('removes most column-end hyphens across documents, and leaves the default alone', () => {
    let on = 0;
    let off = 0;
    for (const seed of [0, 1, 2, 3, 5]) {
      const cache = createMeasurementCache();
      const plain = buildDocument({ markdown: markdown(seed) }, config(), cache);
      expect(hyphenEnds(buildDocument({ markdown: markdown(seed) }, config(true), cache))).toEqual(hyphenEnds(plain));
      on += hyphenEnds(plain).length;
      off += hyphenEnds(buildDocument({ markdown: markdown(seed) }, config(false), cache)).length;
    }
    // A hyphen stays only where no break within the word-spacing limits
    // avoids it (short splits in a narrow measure).
    expect(on).toBeGreaterThanOrEqual(15);
    expect(off).toBeLessThan(on / 2);
  }, 120_000);

  it('guards the later column ends of a paragraph whose first column break falls on a whole word', () => {
    // One paragraph over four columns. In the natural setting its first
    // column ends on a whole word and its second on a hyphen ("adminis-").
    const md = text(420, 4);
    const cache = createMeasurementCache();
    const on = buildDocument({ markdown: md }, config(), cache);
    const off = buildDocument({ markdown: md }, config(false), cache);
    expect(hyphenEnds(on)).not.toContain('p0c0');
    expect(hyphenEnds(on)).toContain('p0c1');
    expect(hyphenEnds(off)).not.toContain('p0c0');
    expect(hyphenEnds(off)).not.toContain('p0c1');
    expect(hyphenEnds(off).length).toBeLessThan(hyphenEnds(on).length);
    expect(words(off)).toBe(words(on));
    expect(off.pages.length).toBe(on.pages.length);
  }, 60_000);

  it('removes most column-end hyphens from paragraphs longer than two columns', () => {
    let on = 0;
    let off = 0;
    for (const seed of [0, 1, 2, 3, 4]) {
      const md = Array.from({ length: 6 }, (_, i) => text(300 + ((i * 37 + seed) % 200), i + seed)).join('\n\n');
      const cache = createMeasurementCache();
      on += hyphenEnds(buildDocument({ markdown: md }, config(), cache)).length;
      off += hyphenEnds(buildDocument({ markdown: md }, config(false), cache)).length;
    }
    expect(on).toBeGreaterThanOrEqual(15);
    expect(off).toBeLessThanOrEqual(Math.floor(on / 3));
  }, 120_000);

  it('breaks a paragraph again from a later column whose end the first re-break did not foresee', () => {
    // In these documents a paragraph's later column ends where the first
    // re-break did not expect it (a closing band cut level, a widow kept),
    // on a hyphen: p4c0 (seed 3), p7c0 (seeds 2, 5). A second re-break from
    // that column keeps every line already placed and ends it on a whole word.
    const doc = (seed: number, across?: boolean) => buildDocument(
      { markdown: Array.from({ length: 6 }, (_, i) => text(300 + ((i * 37 + seed) % 200), i + seed)).join('\n\n') },
      config(across),
      createMeasurementCache(),
    );
    for (const [seed, end] of [[3, 'p4c0'], [2, 'p7c0'], [5, 'p7c0']] as const) {
      const on = doc(seed);
      const off = doc(seed, false);
      expect(hyphenEnds(off), `seed ${seed}`).not.toContain(end);
      expect(hyphenEnds(off).length, `seed ${seed}`).toBeLessThan(hyphenEnds(on).length);
      expect(words(off), `seed ${seed}`).toBe(words(on));
      expect(off.pages.length, `seed ${seed}`).toBe(on.pages.length);
    }
  }, 120_000);

  it('leaves a hyphen only at a paragraph\'s first column break, where no setting within the limits avoids it', () => {
    // The later column ends of a paragraph are broken again with the lines
    // already placed kept at their breaks, so only the rest of the
    // paragraph moves: every one of them ends on a whole word here. Up to
    // round 4 a later end whose clean setting changed a placed line kept
    // its hyphen (8 of the 12 left in these 30 documents).
    let left = 0;
    let later = 0;
    for (let seed = 0; seed < 30; seed++) {
      const md = Array.from({ length: 6 }, (_, i) => text(300 + ((i * 37 + seed) % 200), i + seed)).join('\n\n');
      const off = buildDocument({ markdown: md }, config(false), createMeasurementCache());
      for (const p of off.pages) {
        for (const c of p.columns) {
          const last = c.blocks[c.blocks.length - 1];
          if (!last?.lines[last.lines.length - 1]?.hyphenated) continue;
          left++;
          if (/-cont-\d+$/.test(last.id)) later++;
        }
      }
    }
    expect(left).toBeGreaterThan(0);
    expect(later).toBe(0);
  }, 120_000);

  it('keeps the lines of an earlier setting at their breaks and breaks the rest again', () => {
    const para = text(90, 2);
    const options = { textAlign: 'justify' as const, optimal: true, hyphenate: true, maxStretchRatio: 2.5 };
    const natural = measureBlock(para, '12px serif', 170, 14, options);
    expect(natural.breaks?.path).toBe('plain');
    // A line past the first few that the breaker can end on a whole word.
    const at = natural.lines.findIndex((l, i) => i > 3 && l.hyphenated && i < natural.lines.length - 2
      && !measureBlock(para, '12px serif', 170, 14, { ...options, avoidHyphenAtLines: [i + 1] }).lines[i]!.hyphenated);
    expect(at).toBeGreaterThan(3);
    const guarded = measureBlock(para, '12px serif', 170, 14, { ...options, avoidHyphenAtLines: [at + 1] });
    // Broken again with its first two lines kept: those two stay as the
    // natural setting has them, whatever the guarded setting does there,
    // and the guarded line still ends on a whole word.
    const kept = measureBlock(para, '12px serif', 170, 14, {
      ...options,
      avoidHyphenAtLines: [at + 1],
      keepBreaks: { path: 'plain', at: natural.breaks!.at.slice(0, 2) },
    });
    expect(kept.lines.slice(0, 2).map((l) => l.text)).toEqual(natural.lines.slice(0, 2).map((l) => l.text));
    expect(kept.lines[at]!.hyphenated).toBe(false);
    // Keeping every line of the natural setting gives it back; keeping them
    // on the other path's numbering changes nothing.
    const all = measureBlock(para, '12px serif', 170, 14, { ...options, keepBreaks: natural.breaks });
    expect(all.lines.map((l) => l.text)).toEqual(natural.lines.map((l) => l.text));
    const other = measureBlock(para, '12px serif', 170, 14, {
      ...options, avoidHyphenAtLines: [at + 1], keepBreaks: { path: 'rich', at: natural.breaks!.at.slice(0, 2) },
    });
    expect(other.lines.map((l) => l.text)).toEqual(guarded.lines.map((l) => l.text));
  });

  it('the breaker takes a whole-word break at a line it is asked to keep hyphen-free, within the spacing limits', () => {
    const para = text(60, 3);
    const options = { textAlign: 'justify' as const, optimal: true, hyphenate: true };
    const plain = measureBlock(para, '12px serif', 170, 14, options);
    const at = plain.lines.findIndex((l, i) => l.hyphenated && i > 1 && i < plain.lines.length - 2);
    expect(at).toBeGreaterThan(0);
    // In this narrow measure no break keeps line `at` whole within the
    // default word spacing: the hyphen stays (a soft rule)…
    const strict = measureBlock(para, '12px serif', 170, 14, { ...options, avoidHyphenAtLines: [at + 1] });
    expect(strict.lines.map((l) => l.text)).toEqual(plain.lines.map((l) => l.text));
    // …and with room in the spaces the breaker ends it on a whole word.
    const roomy = { ...options, maxStretchRatio: 2.5 };
    const loose = measureBlock(text(60, 1), '12px serif', 170, 14, roomy);
    const hyphenated = loose.lines.map((l, i) => (l.hyphenated && i > 1 && i < loose.lines.length - 2 ? i : -1)).filter((i) => i >= 0);
    expect(hyphenated.length).toBeGreaterThan(0);
    const kept = hyphenated.filter((i) =>
      !measureBlock(text(60, 1), '12px serif', 170, 14, { ...roomy, avoidHyphenAtLines: [i + 1] }).lines[i]!.hyphenated);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('keeps line counts apart only up to the last line it guards, with the same breaks as keeping them all apart', () => {
    // A paragraph of words with syllable breaks: the breaker merges nodes of
    // one fitness class past the last guarded line (as it does everywhere
    // without guarded lines), which must not change the optimum.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 16; run++) {
      const items: KPItem[] = [];
      let src = 0;
      const nWords = 60 + Math.floor(rand() * 60);
      for (let w = 0; w < nWords; w++) {
        const syllables = 1 + Math.floor(rand() * 4);
        for (let k = 0; k < syllables; k++) {
          items.push({ type: 'box', width: 8 + Math.floor(rand() * 18), sourceIndex: src++ });
          if (k < syllables - 1) items.push({ type: 'penalty', width: 4, penalty: HYPHEN_PENALTY, flagged: true, sourceIndex: src++ });
        }
        if (w < nWords - 1) items.push({ type: 'glue', width: 4, stretch: 2, shrink: 1, sourceIndex: src++ });
      }
      items.push({ type: 'glue', width: 0, stretch: MAX_STRETCH, shrink: 0, sourceIndex: src++ });
      items.push({ type: 'penalty', width: 0, penalty: -KP_INFINITY, flagged: false, sourceIndex: src++ });
      const guarded = [2 + Math.floor(rand() * 4), 8 + Math.floor(rand() * 4)];
      const base = { lineWidth: () => 170, normalSpaceWidth: 4, maxStretchRatio: 2, minShrinkRatio: 0.75, avoidHyphenAtLines: guarded };
      const allApart = computeBreakpoints(items, base);
      const merged = computeBreakpoints(items, { ...base, lineWidthUniformFrom: 1 });
      expect(merged, `run ${run}`).toEqual(allApart);
      // Fixed breaks: the first lines break where they are told, and a
      // prefix of the optimum leaves the optimum as it is.
      const natural = computeBreakpoints(items, { ...base, avoidHyphenAtLines: undefined, lineWidthUniformFrom: 1 });
      const fixed = natural.slice(0, 3);
      expect(computeBreakpoints(items, { ...base, lineWidthUniformFrom: 1, fixedBreaks: fixed }).slice(0, 3), `run ${run}`).toEqual(fixed);
      expect(computeBreakpoints(items, { ...base, avoidHyphenAtLines: undefined, lineWidthUniformFrom: 1, fixedBreaks: fixed }), `run ${run}`)
        .toEqual(natural);
    }
  }, 60_000);
});
