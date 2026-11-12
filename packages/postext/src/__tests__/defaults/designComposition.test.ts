import { describe, it, expect } from 'vitest';
import type { Design, PostextConfig } from '../../index.js';
import {
  COMPOSITION_CONVENTIONS,
  applyDesign,
  chapterConfig,
  compositionConventionDesign,
  compositionConventionFor,
  designPartOf,
  designPartsWithComposition,
  extractDesign,
  followsCompositionConvention,
  pickDesignParts,
  revertDesign,
} from '../../index.js';

// The composition part (#1540): a language's composition rules, saved and
// applied apart from the type they are set in.

const pt = (value: number) => ({ value, unit: 'pt' as const });

const BOOK: PostextConfig = {
  locale: 'es',
  bodyText: {
    fontFamily: 'Lora',
    fontSize: pt(10),
    stacks: 'warn',
    citationBreaks: 'avoid',
    hyphenation: { locale: 'es', exceptions: ['Postext'], maxConsecutive: 2, ladders: 'warn' },
  },
};

const conv = (tag: string) => compositionConventionDesign(compositionConventionFor(tag)!);

describe('the composition part', () => {
  it('claims the rules inside bodyText, the text part the rest', () => {
    expect(designPartOf('bodyText')).toBe('text');
    expect(designPartOf('bodyText', 'stacks')).toBe('composition');
    expect(designPartOf('bodyText', 'operatorBreaks')).toBe('composition');
    expect(designPartOf('bodyText', 'hyphenation.ladders')).toBe('composition');
    expect(designPartOf('bodyText', 'hyphenation')).toBe('text');
  });

  it('is saved apart from the type', () => {
    const type = extractDesign(BOOK, ['text']);
    expect(type.config.bodyText).toEqual({ fontFamily: 'Lora', fontSize: pt(10), hyphenation: { locale: 'es', exceptions: ['Postext'] } });
    const rules = extractDesign(BOOK, ['composition']);
    expect(rules.config).toEqual({ bodyText: { stacks: 'warn', citationBreaks: 'avoid', hyphenation: { maxConsecutive: 2, ladders: 'warn' } } });
  });

  it('is not reset by the type, and does not touch it', () => {
    const typed = applyDesign(BOOK, extractDesign({ bodyText: { fontFamily: 'Inter' } }, ['text']));
    expect(typed.bodyText).toEqual({ fontFamily: 'Inter', stacks: 'warn', citationBreaks: 'avoid', hyphenation: { maxConsecutive: 2, ladders: 'warn' } });

    const ruled = applyDesign(BOOK, conv('es'));
    expect(ruled.bodyText?.fontFamily).toBe('Lora');
    expect(ruled.bodyText?.hyphenation).toEqual({ locale: 'es', exceptions: ['Postext'], ladders: 'avoid', maxConsecutive: 1, lastWord: 'avoid' });
    expect(ruled.bodyText?.stacks).toBe('avoid');
    expect(ruled.bodyText?.hyphenateAcrossColumns).toBe(false);
    // What the convention leaves unset goes back to its default.
    expect(ruled.bodyText?.citationBreaks).toBeUndefined();
  });

  it('applying only the type of a design that holds both keeps the book’s rules', () => {
    const both = extractDesign({ bodyText: { fontFamily: 'Inter', stacks: 'avoid' } }, ['text', 'composition']);
    expect(both.parts).toEqual(['text', 'composition']);
    const next = applyDesign(BOOK, both, ['text']);
    expect(next.bodyText?.fontFamily).toBe('Inter');
    expect(next.bodyText?.stacks).toBe('warn');
    expect(pickDesignParts(both, ['composition']).config).toEqual({ bodyText: { stacks: 'avoid' } });
  });

  it('is taken back with the design', () => {
    const applied = applyDesign(BOOK, conv('es'));
    expect(revertDesign(applied, BOOK, applied)).toEqual(BOOK);
  });

  it('goes into a chapter style', () => {
    const styled: PostextConfig = { ...BOOK, chapterStyles: [{ id: 'annexe', config: { bodyText: { fontSize: pt(9), hyphenation: { maxConsecutive: 3 } } } }] };
    const rules = extractDesign(styled, ['composition']);
    expect(rules.config.chapterStyles).toEqual([{ id: 'annexe', config: { bodyText: { hyphenation: { maxConsecutive: 3 } } } }]);
    const typeOnly = extractDesign(styled, ['text']);
    expect(typeOnly.config.chapterStyles).toEqual([{ id: 'annexe', config: { bodyText: { fontSize: pt(9) } } }]);
    const chapter = chapterConfig(styled, 'annexe');
    expect(chapter.bodyText?.hyphenation?.maxConsecutive).toBe(3);
  });

  it('a design saved before the part holds it when its text carries the rules', () => {
    const old: Design = { parts: ['page', 'text'], config: { bodyText: { fontFamily: 'Inter', stacks: 'avoid' } } };
    expect(designPartsWithComposition(old.parts, old.config)).toEqual(['page', 'text', 'composition']);
    expect(designPartsWithComposition(['page', 'text'], { bodyText: { fontFamily: 'Inter' } })).toEqual(['page', 'text']);
    expect(designPartsWithComposition(['page'], { bodyText: { stacks: 'avoid' } })).toEqual(['page']);
  });
});

describe('composition conventions', () => {
  it('hold the composition part alone', () => {
    for (const c of COMPOSITION_CONVENTIONS) {
      expect(extractDesign(c.config, ['composition']).config, c.id).toEqual(c.config);
      expect(extractDesign(c.config, ['text']).config, c.id).toEqual({});
    }
  });

  it('are found by the book’s language', () => {
    expect(compositionConventionFor('es')?.id).toBe('composition-es');
    expect(compositionConventionFor('es-MX')?.id).toBe('composition-es');
    expect(compositionConventionFor('en')?.id).toBe('composition-en-us');
    expect(compositionConventionFor('en-us')?.id).toBe('composition-en-us');
    expect(compositionConventionFor('en-GB')?.id).toBe('composition-en-gb');
    expect(compositionConventionFor('en_AU')?.id).toBe('composition-en-gb');
    expect(compositionConventionFor('fr-CA')?.id).toBe('composition-fr');
    expect(compositionConventionFor('de')?.id).toBe('composition-de');
    expect(compositionConventionFor('it')).toBeUndefined();
    expect(compositionConventionFor(undefined)).toBeUndefined();
  });

  it('are followed only once the book’s rules match (a default written out counts as unset)', () => {
    const spanish = compositionConventionFor('es')!;
    expect(followsCompositionConvention(BOOK, spanish)).toBe(false);
    const ruled = applyDesign(BOOK, conv('es'));
    expect(followsCompositionConvention(ruled, spanish)).toBe(true);
    const spelledOut: PostextConfig = { ...ruled, bodyText: { ...ruled.bodyText, stackPenalty: 3000 } };
    expect(followsCompositionConvention(spelledOut, spanish)).toBe(true);
    const off: PostextConfig = { ...ruled, bodyText: { ...ruled.bodyText, hyphenation: { ...ruled.bodyText!.hyphenation, maxConsecutive: 2 } } };
    expect(followsCompositionConvention(off, spanish)).toBe(false);
  });
});
