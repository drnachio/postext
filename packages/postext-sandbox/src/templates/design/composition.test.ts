import { describe, expect, it } from 'vitest';
import { chapterConfig, type PostextConfig } from 'postext';
import { applyDesign, extractDesign, templateAsChapterStyle, type DesignSnapshot } from './designTemplate.js';
import { COMPOSITION_PATHS, followsComposition, getPath, withCompositionOf, withPath } from './compositionPaths.js';
import { COMPOSITION_CONVENTIONS, conventionFor } from './compositionConventions.js';
import { BUILTIN_TEMPLATES } from './builtinTemplates.js';
import { templateFromFile, templateToFile } from './templateStore.js';

// The composition part: a language's typesetting rules, apart from the
// type they are set in.

const pt = (value: number) => ({ value, unit: 'pt' as const });

const book: PostextConfig = {
  locale: 'es',
  bodyText: {
    fontFamily: 'Lora',
    fontSize: pt(10),
    stacks: 'warn',
    hyphenation: { locale: 'es', maxConsecutive: 2, ladders: 'warn' },
  },
};

describe('the composition part', () => {
  it('names settings the configuration has', () => {
    const resolvedKeys = new Set(['ladders', 'maxConsecutive', 'ladderPenalty', 'lastWord', 'lastWordPenalty', 'fewerHyphens', 'minWordLength', 'leftMin', 'rightMin', 'capitalized', 'stacks', 'stackMinCharacters', 'stackPenalty', 'hyphenateAcrossColumns']);
    for (const p of COMPOSITION_PATHS) expect(resolvedKeys.has(p.split('.').pop()!), p).toBe(true);
  });

  it('is saved apart from the type', () => {
    const type = extractDesign(book, ['typography']);
    expect(type.config.bodyText?.fontFamily).toBe('Lora');
    expect(type.config.bodyText?.stacks).toBeUndefined();
    expect(type.config.bodyText?.hyphenation?.maxConsecutive).toBeUndefined();
    expect(type.config.bodyText?.hyphenation?.locale).toBe('es');

    const rules = extractDesign(book, ['composition']);
    expect(rules.config).toEqual({ bodyText: { stacks: 'warn', hyphenation: { maxConsecutive: 2, ladders: 'warn' } } });
  });

  it('is not reset by the type, and does not touch it', () => {
    const lora = extractDesign({ bodyText: { fontFamily: 'Inter' } }, ['typography']);
    const typed = applyDesign(book, lora, ['typography']);
    expect(typed.bodyText?.fontFamily).toBe('Inter');
    expect(typed.bodyText?.stacks).toBe('warn');
    expect(typed.bodyText?.hyphenation).toEqual({ maxConsecutive: 2, ladders: 'warn' });

    const spanish = conventionFor('es')!;
    const ruled = applyDesign(book, { parts: ['composition'], config: spanish.config }, ['composition']);
    expect(ruled.bodyText?.fontFamily).toBe('Lora');
    expect(ruled.bodyText?.hyphenation?.locale).toBe('es');
    expect(ruled.bodyText?.hyphenation?.maxConsecutive).toBe(1);
    expect(ruled.bodyText?.stacks).toBe('avoid');
    expect(ruled.bodyText?.hyphenateAcrossColumns).toBe(false);
  });

  it('sets every rule: what the template leaves unset goes back to its default', () => {
    const english = conventionFor('en-GB')!;
    const next = applyDesign(book, { parts: ['composition'], config: english.config }, ['composition']);
    expect(next.bodyText?.stacks).toBeUndefined();
    expect(next.bodyText?.hyphenation).toEqual({ locale: 'es', ladders: 'avoid', maxConsecutive: 2, lastWord: 'avoid' });
  });

  it('applying only the type of a template that holds both keeps the book\'s rules', () => {
    const both = extractDesign({ bodyText: { fontFamily: 'Inter', stacks: 'avoid' } }, ['typography', 'composition']);
    const next = applyDesign(book, both, ['typography']);
    expect(next.bodyText?.fontFamily).toBe('Inter');
    expect(next.bodyText?.stacks).toBe('warn');
  });

  it('a template saved before the part existed applies its rules with its type, as it did', () => {
    const legacy: DesignSnapshot = { parts: ['typography'], config: { bodyText: { fontFamily: 'Inter', stacks: 'avoid' } } };
    const next = applyDesign(book, legacy, ['typography']);
    expect(next.bodyText).toEqual({ fontFamily: 'Inter', stacks: 'avoid' });
  });

  it('goes into a chapter style', () => {
    const french = conventionFor('fr')!;
    const { config, id } = templateAsChapterStyle(book, { parts: ['composition'], config: french.config }, ['composition'], { name: 'Annexe' });
    expect(config.bodyText).toEqual(book.bodyText);
    const styled = chapterConfig(config, id);
    expect(styled.bodyText?.hyphenation?.maxConsecutive).toBe(3);
    expect(styled.bodyText?.hyphenation?.lastWord).toBe('avoid');
    expect(styled.bodyText?.fontFamily).toBe('Lora');
  });

  it('travels in a template file', () => {
    const file = templateToFile({ id: 'x', name: 'House rules', createdAt: 0, updatedAt: 0, design: extractDesign(book, ['composition']), fonts: [], blobs: [] });
    const back = templateFromFile(JSON.parse(JSON.stringify(file)));
    expect(back.design.parts).toEqual(['composition']);
    expect(back.design.config.bodyText?.hyphenation?.maxConsecutive).toBe(2);
  });
});

describe('paths', () => {
  it('sets and removes a value, dropping objects left empty', () => {
    const set = withPath({}, 'bodyText.hyphenation.ladders', 'avoid');
    expect(getPath(set, 'bodyText.hyphenation.ladders')).toBe('avoid');
    expect(withPath(set, 'bodyText.hyphenation.ladders', undefined)).toEqual({});
    const unchanged: PostextConfig = { bodyText: { fontSize: pt(9) } };
    expect(withPath(unchanged, 'bodyText.stacks', undefined)).toBe(unchanged);
  });
});

describe('composition conventions', () => {
  it('ship as templates holding only the composition, set only rules', () => {
    for (const c of COMPOSITION_CONVENTIONS) {
      const t = BUILTIN_TEMPLATES.find((b) => b.id === c.id)!;
      expect(t.parts).toEqual(['composition']);
      expect(extractDesign(t.config, ['composition']).config).toEqual(t.config);
    }
  });

  it('are offered only while the book\'s rules differ (a default written out counts as unset)', () => {
    const spanish = conventionFor('es')!.config;
    expect(followsComposition(book, spanish)).toBe(false);
    const ruled = withCompositionOf(book, spanish);
    expect(followsComposition(ruled, spanish)).toBe(true);
    const spelledOut = withPath(ruled, 'bodyText.stackPenalty', 3000);
    expect(followsComposition(spelledOut, spanish)).toBe(true);
    expect(followsComposition(withPath(ruled, 'bodyText.hyphenation.maxConsecutive', 2), spanish)).toBe(false);
  });

  it('are found by the book\'s language', () => {
    expect(conventionFor('es')?.id).toBe('builtin-composition-es');
    expect(conventionFor('es-MX')?.id).toBe('builtin-composition-es');
    expect(conventionFor('en')?.id).toBe('builtin-composition-en-us');
    expect(conventionFor('en-us')?.id).toBe('builtin-composition-en-us');
    expect(conventionFor('en-GB')?.id).toBe('builtin-composition-en-gb');
    expect(conventionFor('fr-CA')?.id).toBe('builtin-composition-fr');
    expect(conventionFor('de')?.id).toBe('builtin-composition-de');
    expect(conventionFor('it')).toBeUndefined();
    expect(conventionFor(undefined)).toBeUndefined();
  });
});
