import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
import { hyphenBreaking } from '../../pipeline/text/hyphenRules.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { findHyphenFaults, endsOnHyphen } from '../../checks/hyphenRules.js';
import { buildDocument } from '../../pipeline/index.js';
import type { HyphenationConfig, PostextConfig, VDTDocument, VDTLine } from '../../index.js';

// The hyphen rules (#1466): hyphen ladders, the last word divided and
// fewer hyphens, each a demerit cost in the line breaker.

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const column = (width: number, hyphenation: HyphenationConfig = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(20000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', hyphenation },
});
const MD = 'Diversos estudios han demostrado que la intervención multidisciplinaria, coordinada entre el médico de atención primaria, el fisioterapeuta y el psicólogo, mejora significativamente la calidad de vida y reduce el consumo de analgésicos. Sin embargo, todavía existen importantes diferencias entre los distintos sistemas sanitarios en cuanto a la disponibilidad de estos recursos y a los tiempos de espera.';
const BOOK = [MD, MD.split(' ').reverse().join(' '), MD.replace(/,/g, '')].join('\n\n');
const WIDTHS = [150, 164, 178, 192, 206, 220, 234, 248];

const lineTexts = (doc: VDTDocument): string[] => doc.blocks.flatMap((b) => b.lines.map((l) => l.text));
const paragraphsOf = (doc: VDTDocument): VDTLine[][] => doc.blocks.filter((b) => b.type === 'paragraph').map((b) => b.lines);
/** Lines past `max` hyphenated lines in a row. */
const pastLadders = (doc: VDTDocument, max: number): number => {
  let past = 0;
  for (const lines of paragraphsOf(doc)) {
    let run = 0;
    for (const l of lines) {
      run = endsOnHyphen(l) ? run + 1 : 0;
      if (run > max) past++;
    }
  }
  return past;
};
const lastWordsDivided = (doc: VDTDocument): number =>
  paragraphsOf(doc).filter((ls) => ls.length > 1 && endsOnHyphen(ls[ls.length - 2]!) && !/\s/.test(ls[ls.length - 1]!.text.trim())).length;
const hyphens = (doc: VDTDocument): number => paragraphsOf(doc).flat().filter(endsOnHyphen).length;
const total = (f: (w: number) => number): number => WIDTHS.reduce((sum, w) => sum + f(w), 0);
const ofKind = (doc: VDTDocument, kind: string) => (doc.contentWarnings ?? []).filter((w) => w.kind === kind);

describe('hyphen rules settings', () => {
  it('are off by default and hand the line breaker nothing, so cache keys stay', () => {
    const h = resolveBodyTextConfig().hyphenation;
    expect(h).toMatchObject({ fewerHyphens: 0, ladders: 'allow', maxConsecutive: 1, ladderPenalty: 30000, lastWord: 'allow', lastWordPenalty: 30000 });
    expect(hyphenBreaking(h)).toEqual({});
    // 'warn' reads the lines afterwards; 'avoid' at no cost costs nothing.
    expect(hyphenBreaking(resolveBodyTextConfig({ hyphenation: { ladders: 'warn', lastWord: 'warn' } }).hyphenation)).toEqual({});
    expect(hyphenBreaking(resolveBodyTextConfig({ hyphenation: { ladders: 'avoid', ladderPenalty: 0, lastWord: 'avoid', lastWordPenalty: 0 } }).hyphenation)).toEqual({});
    expect(hyphenBreaking(resolveBodyTextConfig({ hyphenation: { ladders: 'avoid', maxConsecutive: 2.4, lastWord: 'avoid', fewerHyphens: 3 } }).hyphenation))
      .toEqual({ ladders: { maxRun: 2, demerits: 30000 }, lastWordDemerits: 30000, extraHyphenPenalty: 150 });
  });

  it('are clamped, compared and stripped as hyphenation settings', () => {
    const h = resolveBodyTextConfig({ hyphenation: { fewerHyphens: 14, maxConsecutive: 0, ladderPenalty: -5 } }).hyphenation;
    expect(h).toMatchObject({ fewerHyphens: 10, maxConsecutive: 1, ladderPenalty: 0 });
    expect(stripBodyTextDefaults({ hyphenation: { ladders: 'allow', maxConsecutive: 1, fewerHyphens: 0 } })).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenation: { ladders: 'warn' } })).toEqual({ hyphenation: { ladders: 'warn' } });
  });

  it('read an unknown level as allow, with a warning', () => {
    expect(resolveBodyTextConfig({ hyphenation: { lastWord: 'never' as 'avoid' } }).hyphenation.lastWord).toBe('allow');
    expect(collectConfigWarnings({ bodyText: { hyphenation: { ladders: 'never' as 'avoid' } } })).toContainEqual({
      kind: 'unknownConfigValue', path: 'bodyText.hyphenation.ladders', value: 'never', used: 'allow',
    });
  });
});

describe('hyphen ladders', () => {
  it("leave the lines as they were under 'warn', and report each ladder", () => {
    let reported = 0;
    for (const w of WIDTHS) {
      const plain = buildDocument({ markdown: BOOK }, column(w));
      const warn = buildDocument({ markdown: BOOK }, column(w, { ladders: 'warn' }));
      expect(lineTexts(warn), `${w}`).toEqual(lineTexts(plain));
      expect(ofKind(plain, 'hyphenLadder')).toEqual([]);
      const found = ofKind(warn, 'hyphenLadder');
      expect(found.length, `${w}`).toBe(findHyphenFaults(warn).length);
      reported += found.length;
    }
    expect(reported).toBeGreaterThan(0);
  });

  it("are set otherwise under 'avoid' where the word spacing allows", () => {
    const before = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w)), 1));
    const after = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w, { ladders: 'avoid' })), 1));
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it('count only the lines past the limit', () => {
    const two = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w, { ladders: 'avoid', maxConsecutive: 2 })), 2));
    const plain = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w)), 2));
    expect(two).toBeLessThanOrEqual(plain);
    // Two in a row are let through under a limit of two.
    const pairsOne = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w, { ladders: 'avoid', maxConsecutive: 1 })), 1));
    const pairsTwo = total((w) => pastLadders(buildDocument({ markdown: BOOK }, column(w, { ladders: 'avoid', maxConsecutive: 2 })), 1));
    expect(pairsTwo).toBeGreaterThanOrEqual(pairsOne);
  });
});

describe('the last word divided', () => {
  it("is kept whole under 'avoid', and only when the last line holds nothing but its rest", () => {
    let before = 0;
    let after = 0;
    for (let w = 100; w <= 400; w += 2) {
      const plain = buildDocument({ markdown: MD }, column(w));
      const kept = buildDocument({ markdown: MD }, column(w, { lastWord: 'avoid' }));
      before += lastWordsDivided(plain);
      after += lastWordsDivided(kept);
      // A paragraph whose last word is whole keeps its lines.
      if (lastWordsDivided(plain) === 0) expect(lineTexts(kept), `${w}`).toEqual(lineTexts(plain));
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("is reported under 'warn' with the word as printed", () => {
    for (let w = 100; w <= 400; w += 2) {
      const warn = buildDocument({ markdown: MD }, column(w, { lastWord: 'warn' }));
      const found = ofKind(warn, 'lastWordDivided');
      expect(found.length, `${w}`).toBe(lastWordsDivided(warn));
      for (const f of found) expect((f as { word: string }).word).toMatch(/-\S+$/);
    }
  });
});

describe('fewer hyphens', () => {
  it('takes fewer hyphens the higher it goes', () => {
    const counts = [0, 3, 10].map((f) => total((w) => hyphens(buildDocument({ markdown: BOOK }, column(w, { fewerHyphens: f })))));
    expect(counts[1]!).toBeLessThanOrEqual(counts[0]!);
    expect(counts[2]!).toBeLessThan(counts[0]!);
  });
});
