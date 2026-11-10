import { afterEach, describe, expect, it } from 'vitest';
import { hyphenateText, hyphenationLanguageLimits, hyphenationLimitsId, setHyphenationLimits, setHyphenationRules } from '../../hyphenation/hyphenate.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
import { hyphenRulesOf } from '../../pipeline/blocks/measureContentBlock/measureOptions.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

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

const SHY = '­';
const parts = (word: string, locale = 'es') => hyphenateText(word, locale).split(SHY);

afterEach(() => {
  setHyphenationLimits(undefined);
  setHyphenationRules(undefined);
});

describe('hyphenation limits', () => {
  it('keep the language’s own when unset', () => {
    expect(hyphenationLanguageLimits('es')).toEqual({ leftMin: 2, rightMin: 2, minWordLength: 5 });
    expect(hyphenationLanguageLimits('ca').minWordLength).toBe(4);
    expect(parts('fisioterapeuta')).toEqual(['fi', 'sio', 'te', 'ra', 'peu', 'ta']);
    expect(hyphenationLimitsId()).toBe(0);
  });

  it('leave at least leftMin letters before a break and rightMin after it', () => {
    setHyphenationLimits({ leftMin: 3, rightMin: 4 });
    expect(parts('fisioterapeuta')).toEqual(['fisio', 'te', 'ra', 'peuta']);
    expect(hyphenationLimitsId()).not.toBe(0);
  });

  it('leave words shorter than minWordLength whole', () => {
    expect(parts('casa')).toEqual(['casa']);
    expect(parts('camisa')).toEqual(['ca', 'mi', 'sa']);
    setHyphenationLimits({ minWordLength: 7 });
    expect(parts('camisa')).toEqual(['camisa']);
    expect(parts('camiseta')).toEqual(['ca', 'mi', 'se', 'ta']);
  });

  it('leave capitalised words whole when capitalized is off, but for the exceptions', () => {
    setHyphenationRules({ capitalized: false });
    expect(parts('Barcelona')).toEqual(['Barcelona']);
    expect(parts('(Barcelona),')).toEqual(['(Barcelona),']);
    expect(parts('barcelona')).toEqual(['bar', 'ce', 'lo', 'na']);
    setHyphenationRules({ capitalized: false, exceptions: ['Bar-ce-lo-na'] });
    expect(parts('Barcelona')).toEqual(['Bar', 'ce', 'lo', 'na']);
  });

  it('resolve from the config, and compare and strip as hyphenation settings', () => {
    const h = resolveBodyTextConfig({ hyphenation: { leftMin: 3, rightMin: 0, minWordLength: 6.4, capitalized: false } }).hyphenation;
    expect(h).toMatchObject({ leftMin: 3, rightMin: 1, minWordLength: 6, capitalized: false });
    expect(resolveBodyTextConfig().hyphenation.capitalized).toBe(true);
    expect(resolveBodyTextConfig().hyphenation.leftMin).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenation: { leftMin: 3 } })).toEqual({ hyphenation: { leftMin: 3 } });
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const column = (width: number, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(20000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), ...bodyText },
});
const MD = 'Diversos estudios han demostrado que la intervención multidisciplinaria, coordinada entre el médico de atención primaria, el fisioterapeuta y el psicólogo, mejora significativamente la calidad de vida y reduce el consumo de analgésicos. Sin embargo, todavía existen importantes diferencias entre los distintos sistemas sanitarios en cuanto a la disponibilidad de estos recursos y a los tiempos de espera.';
const hyphens = (doc: VDTDocument): number =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines))).filter((l) => l.text.trimEnd().endsWith('-')).length;

describe('the document’s limits in a build', () => {
  it('reach the layout, and the next build without them goes back', () => {
    const md = MD.repeat(3);
    const plain = hyphens(buildDocument({ markdown: md }, column(210)));
    const strict = hyphens(buildDocument({ markdown: md }, column(210, { hyphenation: { leftMin: 4, rightMin: 4 } })));
    expect(strict).toBeLessThan(plain);
    expect(hyphens(buildDocument({ markdown: md }, column(210)))).toBe(plain);
  });
});

describe('fewer hyphens', () => {
  it('is 0 by default and clamped to 0–10', () => {
    expect(resolveBodyTextConfig().fewerHyphens).toBe(0);
    expect(resolveBodyTextConfig({ fewerHyphens: 14 }).fewerHyphens).toBe(10);
    expect(stripBodyTextDefaults({ fewerHyphens: 0 })).toBeUndefined();
  });

  it('takes fewer hyphens the higher it goes', () => {
    const counts = [0, 5, 10].map((f) => hyphens(buildDocument({ markdown: MD.repeat(3) }, column(280, { fewerHyphens: f }))));
    expect(counts[1]!).toBeLessThanOrEqual(counts[0]!);
    expect(counts[2]!).toBeLessThan(counts[0]!);
  });
});

describe('hyphen limit and last word', () => {
  const lines = (doc: VDTDocument) => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
  const hyphenated = (l: { text: string }) => l.text.trimEnd().endsWith('-');
  const longestRun = (doc: VDTDocument): number => {
    let best = 0, run = 0;
    for (const l of lines(doc)) { run = hyphenated(l) ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };

  it('pass nothing to the breaker at their defaults, so cache keys stay', () => {
    expect(resolveBodyTextConfig().hyphenation).toMatchObject({ maxConsecutive: 0, lastWord: true });
    expect(hyphenRulesOf(resolveBodyTextConfig().hyphenation)).toBeUndefined();
    expect(hyphenRulesOf(resolveBodyTextConfig({ hyphenation: { maxConsecutive: 2.2, lastWord: false } }).hyphenation))
      .toEqual({ maxRun: 2, keepLastWord: true });
    expect(resolveBodyTextConfig({ hyphenation: { maxConsecutive: -1 } }).hyphenation.maxConsecutive).toBe(0);
    expect(stripBodyTextDefaults({ hyphenation: { maxConsecutive: 0, lastWord: true } })).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenation: { maxConsecutive: 1 } })).toEqual({ hyphenation: { maxConsecutive: 1 } });
  });

  it('keep runs of hyphenated lines to the limit, a looser setting taken for it', () => {
    // Strict hyphenation and hyphen spacing off, so only the limit acts.
    const off = { strictHyphenation: false, minLinesBetweenHyphens: 0, textAlign: 'justify' as const };
    const md = MD.repeat(4);
    const free = buildDocument({ markdown: md }, column(160, off));
    expect(longestRun(free)).toBeGreaterThan(1);
    const limited = buildDocument({ markdown: md }, column(160, { ...off, hyphenation: { maxConsecutive: 1 } }));
    expect(longestRun(limited)).toBe(1);
  });

  it('keep the last word whole with lastWord off, strict hyphenation off', () => {
    const off = { strictHyphenation: false, minLinesBetweenHyphens: 0, textAlign: 'justify' as const };
    const lastDivided = (doc: VDTDocument): number => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks))
      .filter((b) => b.lines.length > 1 && hyphenated(b.lines[b.lines.length - 2]!)).length;
    let freeCount = 0;
    let keptCount = 0;
    for (let w = 150; w <= 290; w += 7) {
      freeCount += lastDivided(buildDocument({ markdown: MD }, column(w, off)));
      keptCount += lastDivided(buildDocument({ markdown: MD }, column(w, { ...off, hyphenation: { lastWord: false } })));
    }
    expect(freeCount).toBeGreaterThan(0);
    expect(keptCount).toBe(0);
  });
});
