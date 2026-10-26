import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../pipeline/index.js';
import { createMeasurementCache } from '../measure/index.js';
import { measureRichBlock } from '../measure/rich.js';
import { getHyphenationRulesKey, hyphenateByDictionary, hyphenateText, normalizeHyphenationExceptions, setHyphenationLocale, setHyphenationRules, type HyphenationRules } from '../hyphenation/hyphenate.js';
import { stripConfigDefaults } from '../defaults/index.js';
import { resolveAllConfig } from '../pipeline/config.js';
import { citedNames } from '../citations/names.js';
import { registerCitationEngine } from '../citations/registry.js';
import type { CitationEngine } from '../citations/types.js';
import type { InlineSpan } from '../parse/index.js';
import type { PostextConfig, VDTDocument, VDTLine } from '../index.js';

// Deterministic text measurement stub (no DOM in the node test env): every
// printed character, the space included, is 7 px wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].filter((c) => c !== '­' && c !== '​').length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SHY = '­';
const FONT = '16px Test';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
const show = (s: string): string => s.split(SHY).join('-');
const divide = (word: string, locale: string, rules?: HyphenationRules): string => {
  setHyphenationRules(rules);
  return show(hyphenateText(word, locale));
};

const config = (widthPt: number, extra: Record<string, unknown> = {}, hyphenation: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 96, width: pt(widthPt), height: pt(900), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'en-us', ...hyphenation } },
  headings: { levels: [] },
  ...extra,
}) as unknown as PostextConfig;
const linesOf = (doc: VDTDocument): VDTLine[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));

afterEach(() => {
  setHyphenationLocale('en-us');
  setHyphenationRules();
});

describe('hyphenation.exceptions (#699)', () => {
  it('reads the list: trimmed, checked, without duplicates, sorted', () => {
    expect(normalizeHyphenationExceptions([' Alice ', 'You-Tube', 'Alice', 'two words', 'B12', '---', '', 'il·lusió', 42, 'cántaro'])).toEqual(['Alice', 'You-Tube', 'cántaro', 'il·lusió']);
    expect(normalizeHyphenationExceptions([])).toBeUndefined();
    expect(normalizeHyphenationExceptions(undefined)).toBeUndefined();
    const resolved = resolveAllConfig({ bodyText: { hyphenation: { exceptions: ['b', 'a', 'b', '1'] } } });
    expect(resolved.bodyText.hyphenation.exceptions).toEqual(['a', 'b']);
    expect(resolveAllConfig({}).bodyText.hyphenation.exceptions).toBeUndefined();
    expect(resolveAllConfig({ bodyText: { hyphenation: { exceptions: ['1'] } } }).bodyText.hyphenation.exceptions).toBeUndefined();
  });

  it('an entry without a hyphen is never divided, in its token and beside punctuation', () => {
    expect(divide('Alice', 'en-us')).toBe('Al-ice');
    const rules = { exceptions: ['Alice'] };
    expect(divide('Alice', 'en-us', rules)).toBe('Alice');
    expect(divide('(Alice,', 'en-us', rules)).toBe('(Alice,');
    expect(divide('Alice’s', 'en-us', rules)).toBe('Alice’s');
    // The other words keep the dictionary's points.
    expect(divide('said Alice indignantly', 'en-us', rules)).toBe('said Alice in-dig-nantly');
  });

  it('an entry with hyphens is divided only there, as TeX\'s \\hyphenation', () => {
    expect(divide('YouTube', 'es')).toBe('You-Tu-be');
    expect(divide('YouTube', 'es', { exceptions: ['You-Tube'] })).toBe('You-Tube');
    expect(divide('(YouTube).', 'es', { exceptions: ['You-Tube'] })).toBe('(You-Tube).');
    expect(divide('Gesellschaft', 'de', { exceptions: ['Ge-sellschaft'] })).toBe('Ge-sellschaft');
    // Points the dictionary would not give.
    expect(divide('together', 'en-us', { exceptions: ['to-gether'] })).toBe('to-gether');
  });

  it('a lower-case entry matches any case, a capitalised one only capitalised occurrences', () => {
    expect(divide('Blender', 'es')).toBe('Blen-der');
    expect(divide('blender', 'es')).toBe('blen-der');
    const capital = { exceptions: ['Blender'] };
    expect(divide('Blender', 'es', capital)).toBe('Blender');
    expect(divide('(Blender,', 'es', capital)).toBe('(Blender,');
    expect(divide('BLENDER', 'es', capital)).toBe('BLENDER');
    expect(divide('blender', 'es', capital)).toBe('blen-der');
    const lower = { exceptions: ['blender'] };
    expect(divide('Blender', 'es', lower)).toBe('Blender');
    expect(divide('(Blender,', 'es', lower)).toBe('(Blender,');
    expect(divide('blender', 'es', lower)).toBe('blender');
  });

  it('a compound is matched part by part, and an inflected form is another word', () => {
    const rules = { exceptions: ['Blender'] };
    expect(divide('Blender-based', 'en-us', rules)).toBe(`Blender-${show(hyphenateByDictionary('based', 'en-us'))}`);
    expect(divide('Blenders', 'en-us', rules)).toBe(show(hyphenateByDictionary('Blenders', 'en-us')));
  });

  it('holds in Catalan, an ela geminada inside the word', () => {
    expect(divide('Barcelona', 'ca')).toBe('Bar-ce-lo-na');
    expect(divide('Barcelona', 'ca', { exceptions: ['Barcelona'] })).toBe('Barcelona');
    expect(divide('il·lusió', 'ca', { exceptions: ['il·lusió'] })).toBe('il·lusió');
    expect(divide('Barcelona', 'ca', { exceptions: ['Barce-lona'] })).toBe('Barce-lona');
  });

  it('a soft hyphen typed in an occurrence still decides it', () => {
    const rules = { exceptions: ['together', 'Alice'], capitalized: false };
    expect(divide(`to${SHY}gether`, 'en-us', rules)).toBe('to-gether');
    expect(divide(`Al${SHY}ice`, 'en-us', rules)).toBe('Al-ice');
    const lines = measureRichBlock(span(`we were to${SHY}gether`), FONT, FONT, FONT, FONT, 84, 20, { hyphenate: true }).lines;
    expect(lines.map((l) => l.text)).toEqual(['we were to-', 'gether']);
  });

  it('the dictionary\'s own result is untouched by the rules', () => {
    setHyphenationRules({ exceptions: ['Alice'], capitalized: false });
    expect(show(hyphenateByDictionary('Alice Lupton', 'en-us'))).toBe('Al-ice Lup-ton');
    expect(show(hyphenateText('Alice Lupton', 'en-us'))).toBe('Alice Lupton');
    setHyphenationRules();
    expect(show(hyphenateText('Alice Lupton', 'en-us'))).toBe('Al-ice Lup-ton');
  });
});

describe('hyphenation.capitalized (#699)', () => {
  it('false: no break inside a run of letters that starts with a capital', () => {
    const rules = { capitalized: false };
    for (const word of ['Alice', '(Lupton,', 'UNESCO', 'Indignantly']) expect(divide(word, 'en-us', rules)).toBe(word);
    expect(divide('Ámsterdam', 'es', rules)).toBe('Ámsterdam');
    expect(divide('Gesellschaft', 'de', rules)).toBe('Gesellschaft');
    expect(divide('Barcelona', 'ca', rules)).toBe('Barcelona');
    expect(divide('Col·lecció', 'ca', rules)).toBe('Col·lecció');
    expect(divide('indignantly', 'en-us', rules)).toBe('in-dig-nantly');
    // The run that starts with a capital, not its neighbours.
    expect(divide('d’Alembert', 'en-us', rules)).toBe('d’Alembert');
    expect(divide('anti-Americanism', 'en-us', rules)).toBe('anti-Americanism');
    expect(divide('extraordinary-Alice', 'en-us', rules)).toBe(`${show(hyphenateByDictionary('extraordinary', 'en-us'))}-Alice`);
  });

  it('an entry of the list with points still divides its capitalised word', () => {
    expect(divide('YouTube', 'es', { capitalized: false, exceptions: ['You-Tube'] })).toBe('You-Tube');
  });

  it('true, the default, changes nothing', () => {
    expect(divide('Alice', 'en-us', { capitalized: true })).toBe('Al-ice');
    expect(getHyphenationRulesKey()).toBe('');
  });
});

describe('the rule set and the measurement cache (#699)', () => {
  it('equal rules share an id, no rule has none', () => {
    setHyphenationRules();
    expect(getHyphenationRulesKey()).toBe('');
    setHyphenationRules({ exceptions: [], capitalized: true, names: [] });
    expect(getHyphenationRulesKey()).toBe('');
    setHyphenationRules({ exceptions: ['b', 'a'] });
    const first = getHyphenationRulesKey();
    expect(first).not.toBe('');
    setHyphenationRules({ exceptions: ['a', 'b', 'a'] });
    expect(getHyphenationRulesKey()).toBe(first);
    setHyphenationRules({ exceptions: ['a'] });
    expect(getHyphenationRulesKey()).not.toBe(first);
  });

  const SENTENCE = 'The table was a large one, but the three were all crowded at one corner of it. There is plenty of room said Alice indignantly, and she sat down in a large chair at one end of the table.';

  it('with exceptions: [Alice] the sentence never sets Al- | ice, on either breaker, at any measure', () => {
    let divided = 0;
    for (let w = 115; w <= 340; w += 1) {
      for (const rich of [false, true]) {
        const md = rich ? SENTENCE.replace('plenty', '*plenty*') : SENTENCE;
        const plain = linesOf(buildDocument({ markdown: md }, config(w), createMeasurementCache()));
        if (plain.some((l) => /\bAl-$/.test(l.text))) divided++;
        const kept = linesOf(buildDocument({ markdown: md }, config(w, {}, { exceptions: ['Alice'] }), createMeasurementCache()));
        expect(kept.some((l) => /\bAl-$/.test(l.text)), `${w}pt ${rich ? 'formatted' : 'plain'}`).toBe(false);
        const capitals = linesOf(buildDocument({ markdown: md }, config(w, {}, { capitalized: false }), createMeasurementCache()));
        expect(capitals.some((l) => /\b(?:Al|The|There)-$/.test(l.text)), `${w}pt ${rich ? 'formatted' : 'plain'}`).toBe(false);
      }
    }
    // The measure the issue reproduces at (111 px) is in the sweep.
    expect(divided).toBeGreaterThan(0);
  }, 120_000);

  it('two builds with different lists that share a cache each get their own lines', () => {
    const cache = createMeasurementCache();
    const find = (): number => {
      for (let w = 115; w <= 340; w += 1) {
        if (linesOf(buildDocument({ markdown: SENTENCE }, config(w), createMeasurementCache())).some((l) => /\bAl-$/.test(l.text))) return w;
      }
      throw new Error('no measure divides Alice');
    };
    const w = find();
    const texts = (hyphenation: Record<string, unknown>): string[] => linesOf(buildDocument({ markdown: SENTENCE }, config(w, {}, hyphenation), cache)).map((l) => l.text);
    const free = texts({});
    const kept = texts({ exceptions: ['Alice'] });
    const again = texts({});
    const other = texts({ exceptions: ['indignantly'] });
    expect(free.some((t) => /\bAl-$/.test(t))).toBe(true);
    expect(kept.some((t) => /\bAl-$/.test(t))).toBe(false);
    expect(again).toEqual(free);
    expect(other).toEqual(free);
    // A build with no rules clears the ones of the build before.
    expect(getHyphenationRulesKey()).not.toBe('');
    buildDocument({ markdown: SENTENCE }, config(w), cache);
    expect(getHyphenationRulesKey()).toBe('');
  });

  it('a document that sets none of the three keeps its cache keys', () => {
    const cache = createMeasurementCache();
    buildDocument({ markdown: SENTENCE }, config(200), cache);
    const keys = [...(cache as unknown as { _blocks: Map<string, unknown> })._blocks.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes('\x00hr'))).toBe(false);
    const ruled = createMeasurementCache();
    buildDocument({ markdown: SENTENCE }, config(200, {}, { capitalized: false }), ruled);
    expect([...(ruled as unknown as { _blocks: Map<string, unknown> })._blocks.keys()].every((k) => k.includes('\x00hr'))).toBe(true);
  });

  it('a word wider than its measure is still divided: at its entry\'s points, else at the dictionary\'s', () => {
    // Eight characters to a line.
    const lines = (text: string, rules?: HyphenationRules): string[] => {
      setHyphenationRules(rules);
      return [
        measureRichBlock(span(text), FONT, FONT, FONT, FONT, 56, 20, { hyphenate: true }).lines.map((l) => l.text),
        measureRichBlock([{ text, bold: false, italic: true }], FONT, FONT, FONT, FONT, 56, 20, { hyphenate: true, textAlign: 'justify', optimal: true }).lines.map((l) => l.text),
      ].map((l) => l.join('|')).filter((v, i, a) => a.indexOf(v) === i);
    };
    expect(lines('Indignantly')).toEqual(['Indig-|nantly']);
    expect(lines('Indignantly', { exceptions: ['Indignantly'] })).toEqual(['Indig-|nantly']);
    expect(lines('Indignantly', { capitalized: false })).toEqual(['Indig-|nantly']);
    expect(lines('Indignantly', { exceptions: ['Indi-gnantly'] })).toEqual(['Indi-|gnantly']);
  });
});

describe('citations.hyphenateNames (#699)', () => {
  it('reads the family and literal names of every person of the references', () => {
    expect(citedNames([
      { id: 'a', type: 'book', author: [{ family: 'Lupton', given: 'Ellen' }, { literal: 'Bauhaus Archiv' }], editor: [{ family: 'García-Márquez' }] },
      { id: 'b', type: 'book', author: [{ family: 'Lupton' }], translator: [{ family: ' Baker ' }], title: 'Thinking with Type' },
    ])).toEqual(['Baker', 'Bauhaus Archiv', 'García-Márquez', 'Lupton']);
  });

  it('names are kept whole where they start with a capital', () => {
    const rules = { names: ['Lupton', 'Baker', 'García-Márquez', 'bell hooks'] };
    expect(divide('(Lupton,', 'en-us', rules)).toBe('(Lupton,');
    expect(divide('Baker', 'en-us', rules)).toBe('Baker');
    expect(divide('baker', 'en-us', rules)).toBe(show(hyphenateByDictionary('baker', 'en-us')));
    expect(divide('Márquez', 'es', rules)).toBe('Márquez');
    expect(divide('García', 'es', rules)).toBe('García');
    // A name written without a capital enters nothing: `hooks` stays a word.
    expect(divide('hooks', 'en-us', rules)).toBe(show(hyphenateByDictionary('hooks', 'en-us')));
    expect(divide('indignantly', 'en-us', rules)).toBe('in-dig-nantly');
  });

  const REFERENCES = `---
references:
  - id: lupton2010
    type: book
    title: Thinking with Type
    author:
      - family: Lupton
        given: Ellen
    issued:
      date-parts: [[2010]]
    publisher: Princeton Architectural Press
---

`;
  const TEXT = 'The grid is a way of ordering the page and the letters set upon it [@lupton2010]. A column of text that is too wide tires the eye, as every reader knows [@lupton2010], and one that is too narrow breaks the words apart [@lupton2010]. Nobody reads it gladly [@lupton2010].';

  /** An author-date style: `(Lupton, 2010)` and an entry by family name. */
  const authorDate: CitationEngine = {
    styles: () => [],
    createProcessor: ({ items }) => {
      const family = (id: string): string => String((items.find((i) => i.id === id)?.author as Array<{ family?: string }> | undefined)?.[0]?.family);
      return {
        kind: 'in-text',
        numeric: false,
        cite: (clusters) => clusters.map((c) => `(${c.items.map((it) => `${family(it.id)}, 2010`).join('; ')})`),
        bibliography: () => ({ entries: items.map((i) => ({ id: i.id, html: `${family(i.id)}, E. (2010). Thinking with Type.` })), hangingIndent: true, labelColumn: false, entrySpacing: 0 }),
        citationNumbers: () => new Map(),
      };
    },
  };
  beforeAll(() => registerCitationEngine(authorDate));
  afterAll(() => registerCitationEngine(undefined));

  it('false: no line of a document that cites Lupton ends on Lup-', () => {
    let divided = 0;
    for (let w = 120; w <= 330; w += 1) {
      const free = linesOf(buildDocument({ markdown: REFERENCES + TEXT }, config(w), createMeasurementCache()));
      expect(free.some((l) => l.text.includes('Lupton') || /Lup-$/.test(l.text)), `${w}pt`).toBe(true);
      if (free.some((l) => /Lup-$/.test(l.text))) divided++;
      const kept = linesOf(buildDocument({ markdown: REFERENCES + TEXT }, config(w, { citations: { hyphenateNames: false } }), createMeasurementCache()));
      expect(kept.some((l) => /Lup-$/.test(l.text)), `${w}pt`).toBe(false);
    }
    expect(divided).toBeGreaterThan(0);
  }, 120_000);
});

describe('the three settings survive the strip (#699)', () => {
  const reads = (c: PostextConfig): string => JSON.stringify(resolveAllConfig(c));
  it('each set alone', () => {
    for (const c of [
      { bodyText: { hyphenation: { exceptions: ['Alice', 'You-Tube'] } } },
      { bodyText: { hyphenation: { capitalized: false } } },
      { citations: { hyphenateNames: false } },
      { locale: 'es', bodyText: { hyphenation: { exceptions: ['Blender'] } } },
    ] as PostextConfig[]) {
      const stripped = stripConfigDefaults(c);
      expect(reads(stripped)).toBe(reads(c));
    }
    expect(stripConfigDefaults({ bodyText: { hyphenation: { exceptions: ['Alice'] } } }).bodyText?.hyphenation?.exceptions).toEqual(['Alice']);
    expect(stripConfigDefaults({ citations: { hyphenateNames: false } }).citations).toEqual({ hyphenateNames: false });
  });

  it('the defaults are dropped', () => {
    expect(stripConfigDefaults({ bodyText: { hyphenation: { capitalized: true, exceptions: [] } }, citations: { hyphenateNames: true } })).toEqual({});
  });
});
