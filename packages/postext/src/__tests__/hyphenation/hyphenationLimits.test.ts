import { afterEach, describe, expect, it } from 'vitest';
import { hyphenateText, hyphenationLanguageLimits, hyphenationLimitsId, setHyphenationLimits, setHyphenationRules } from '../../hyphenation/hyphenate.js';
import { activeLimits } from '../../hyphenation/limits.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
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

  it('count the letters about an apostrophe against them, in French, Italian and Catalan', () => {
    const p = (w: string, l: string) => parts(w, l).join('-');
    // The languages' own limits: as before.
    expect(p('aujourd’hui', 'fr')).toBe('au-jourd’hui');
    expect(p('l’oportunitat', 'ca')).toBe('l’o-por-tu-ni-tat');
    expect(p('dell’acqua', 'it')).toBe('dell’ac-qua');
    setHyphenationLimits({ leftMin: 3, rightMin: 3 });
    expect(p('aujourd’hui', 'fr')).toBe('aujourd’hui');
    expect(p('l’occasion', 'fr')).toBe('l’oc-ca-sion');
    // The Catalan patterns count the apostrophe as a letter; the limits
    // do not.
    expect(p('l’oportunitat', 'ca')).toBe('l’opor-tu-ni-tat');
    expect(p('d’aquesta', 'ca')).toBe('d’aquesta');
    setHyphenationLimits({ leftMin: 2, rightMin: 4 });
    expect(p('dell’acqua', 'it')).toBe('dell’acqua');
    expect(p('un’altra', 'it')).toBe('un’altra');
  });

  it('keep the dictionaries of the last sets used, so two books alternating rebuild nothing', () => {
    setHyphenationLimits({ leftMin: 3 });
    parts('fisioterapeuta');
    const a = activeLimits();
    const patterns = a.hyphenators.get('es');
    expect(patterns).toBeDefined();
    setHyphenationLimits({ leftMin: 4 });
    parts('fisioterapeuta');
    expect(activeLimits()).not.toBe(a);
    setHyphenationLimits({ leftMin: 3 });
    expect(activeLimits()).toBe(a);
    expect(activeLimits().hyphenators.get('es')).toBe(patterns);
    expect(hyphenationLimitsId()).toBe(a.id);
    // A set let go comes back with the same id, its dictionaries rebuilt.
    for (let k = 5; k < 12; k++) setHyphenationLimits({ leftMin: k });
    setHyphenationLimits({ leftMin: 3 });
    expect(activeLimits()).not.toBe(a);
    expect(hyphenationLimitsId()).toBe(a.id);
    expect(parts('fisioterapeuta')).toEqual(['fisio', 'te', 'ra', 'peu', 'ta']);
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
