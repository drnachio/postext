import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { defaultResourceTypes, resolveBodyTextConfig, resolveLayoutConfig, resolveOrderedListsConfig, resolvePageConfig } from 'postext';
import { createDefaultConfig } from './defaultConfig';
import { chineseDefaults, chineseFontsFor, undoChineseDefaults, type ChineseDefaultId } from './chineseDefaults';

const ids = (r: ReturnType<typeof chineseDefaults>) => r.changes.map((c) => c.id);
const change = (r: ReturnType<typeof chineseDefaults>, id: ChineseDefaultId) => r.changes.find((c) => c.id === id);

describe('chineseDefaults', () => {
  it('sets up a pristine English book for Simplified Chinese', () => {
    const before = createDefaultConfig('en');
    const r = chineseDefaults(before, { locale: 'zh-Hans', fallbackLocale: 'en' });
    expect(r.locale).toBe('zh-Hans');
    // Justified text, the indent after headings and no paragraph spacing
    // are the engine's defaults already: no row for them.
    expect(ids(r)).toEqual([
      'locale', 'bodyFont', 'headingFont', 'firstLineIndent', 'hyphenation',
      'resourceTypes', 'captionLabel', 'chapterNumbering', 'listNumbers',
    ]);
    expect(r.changes.every((c) => c.applied && !c.customised)).toBe(true);
    const c = r.config;
    expect(c.locale).toBe('zh-Hans');
    expect(c.bodyText?.fontFamily).toBe('Noto Serif SC');
    expect(c.headings?.fontFamily).toBe('Noto Sans SC');
    expect(c.bodyText?.firstLineIndent).toEqual({ value: 2, unit: 'em' });
    expect(c.resourceTypes).toEqual(defaultResourceTypes('zh-Hans'));
    expect(c.resourceTypes?.[0]?.numberingTemplate).toBe('{h1}-{n}');
    expect(c.captionStyle).toEqual({ labelNumberGap: '', labelSeparator: '　' });
    expect(c.headings?.levels).toEqual([{ level: 1, numberingTemplate: '第{1:一}章', numberSeparator: '　' }]);
    const body = resolveBodyTextConfig(c.bodyText, c.locale);
    expect(body.hyphenation.enabled).toBe(false);
    expect(body.textAlign).toBe('justify');
    expect(body.indentAfterHeading).toBe(true);
    expect(body.paragraphSpacing).toBe(false);
    const lists = resolveOrderedListsConfig(c.orderedLists, body, c.locale);
    expect(lists.levels.map((l) => [l.numberFormat, l.prefix, l.separator])).toEqual([
      ['simp-chinese-informal', '', '、'],
      ['simp-chinese-informal', '（', '）'],
      ['arabic', '', '.'],
      ['arabic', '（', '）'],
      ['circled-decimal', '', ''],
    ]);
    // The book keeps its palette and the rest of its settings.
    expect(c.colorPalette).toBe(before.colorPalette);
    expect(c.layout).toBeUndefined();
    expect(c.page).toBeUndefined();
  });

  it('names what each row changes from and to', () => {
    const r = chineseDefaults(createDefaultConfig('es'), { locale: 'zh-Hans', fallbackLocale: 'es' });
    expect(change(r, 'locale')).toMatchObject({ from: { kind: 'locale', tag: 'es' }, to: { kind: 'locale', tag: 'zh-Hans' }, required: true });
    expect(change(r, 'bodyFont')).toMatchObject({ from: { kind: 'text', text: 'EB Garamond' }, to: { kind: 'text', text: 'Noto Serif SC' } });
    expect(change(r, 'firstLineIndent')?.to).toEqual({ kind: 'dimension', value: { value: 2, unit: 'em' } });
    // Hyphenation turns off with the language: listed, not optional.
    expect(change(r, 'hyphenation')).toMatchObject({ from: { kind: 'switch', on: true }, to: { kind: 'switch', on: false }, required: true });
    expect(change(r, 'resourceTypes')).toMatchObject({ from: { kind: 'text', text: 'Figura, Tabla' }, to: { kind: 'text', text: '图, 表' } });
    expect(change(r, 'captionLabel')).toMatchObject({ from: { kind: 'text', text: 'Figura 1.1. …' }, to: { kind: 'text', text: '图1-1　…' } });
    expect(change(r, 'chapterNumbering')).toMatchObject({ from: { kind: 'none' }, to: { kind: 'text', text: '第一章' } });
    expect(change(r, 'listNumbers')).toMatchObject({ from: { kind: 'text', text: '1. 1. 1. 1. 1.' }, to: { kind: 'text', text: '一、 （一） 1. （1） ①' } });
  });

  it('uses Traditional names, numerals and fonts for zh-Hant, and sets it vertically when asked', () => {
    const r = chineseDefaults(createDefaultConfig('en'), { locale: 'zh-Hant', vertical: true, fallbackLocale: 'en' });
    const c = r.config;
    expect(c.locale).toBe('zh-Hant');
    expect(c.bodyText?.fontFamily).toBe('Noto Serif TC');
    expect(c.headings?.fontFamily).toBe('Noto Sans TC');
    expect(c.resourceTypes).toEqual(defaultResourceTypes('zh-Hant'));
    expect(c.orderedLists?.levels?.[0]?.numberFormat).toBe('trad-chinese-informal');
    expect(c.layout).toEqual({ writingMode: 'vertical-rl' });
    expect(change(r, 'writingMode')).toMatchObject({
      required: true,
      from: { kind: 'writingMode', value: 'horizontal-tb', binding: 'left' },
      to: { kind: 'writingMode', value: 'vertical-rl', binding: 'right' },
    });
    // Binding stays 'auto', which a vertical book reads as right.
    expect(c.page?.binding).toBeUndefined();
    expect(resolvePageConfig(c.page, c.locale, resolveLayoutConfig(c.layout).writingMode).binding).toBe('right');
  });

  it('keeps a Traditional tag of the same script, with Hong Kong faces', () => {
    const base: PostextConfig = { ...createDefaultConfig('en'), locale: 'zh-Hant-HK' };
    const r = chineseDefaults(base, { locale: 'zh-Hant' });
    expect(r.locale).toBe('zh-Hant-HK');
    expect(ids(r)).not.toContain('locale');
    expect(r.config.bodyText?.fontFamily).toBe('Noto Serif HK');
    expect(chineseFontsFor('zh-TW')).toEqual({ body: 'Noto Serif TC', headings: 'Noto Sans TC' });
    expect(chineseFontsFor('zh')).toEqual({ body: 'Noto Serif SC', headings: 'Noto Sans SC' });
  });

  it('lists the author\'s own settings unticked and leaves them alone', () => {
    const base: PostextConfig = {
      ...createDefaultConfig('en'),
      bodyText: { fontFamily: 'Lora', textAlign: 'left', paragraphSpacing: true, hyphenation: { enabled: true } },
      headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: true, parity: 'any' } }] },
      captionStyle: { labelSeparator: ': ' },
      page: { binding: 'left' },
    };
    const r = chineseDefaults(base, { locale: 'zh-Hant', vertical: true });
    const own = r.changes.filter((c) => c.customised).map((c) => c.id);
    expect(own).toEqual(['binding', 'bodyFont', 'paragraphSpacing', 'textAlign', 'hyphenation', 'captionLabel', 'chapterNumbering']);
    expect(r.changes.filter((c) => c.customised).every((c) => !c.applied)).toBe(true);
    expect(r.config.bodyText).toMatchObject({ fontFamily: 'Lora', textAlign: 'left', paragraphSpacing: true, hyphenation: { enabled: true } });
    expect(r.config.page).toEqual({ binding: 'left' });
    expect(r.config.headings?.levels?.[0]?.numberingTemplate).toBe('Chapter {1}');
    expect(r.config.captionStyle).toEqual({ labelSeparator: ': ' });
    // The ones the author did not touch still apply.
    expect(r.config.headings?.fontFamily).toBe('Noto Sans TC');
    expect(r.config.bodyText?.firstLineIndent).toEqual({ value: 2, unit: 'em' });
  });

  it('applies the author\'s own settings too when they are ticked', () => {
    const base: PostextConfig = {
      ...createDefaultConfig('en'),
      bodyText: { fontFamily: 'Lora', textAlign: 'left', hyphenation: { enabled: true, locale: 'es' } },
      headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: true, parity: 'any' } }] },
      page: { binding: 'left', dpi: 150 },
    };
    const include: ChineseDefaultId[] = ['bodyFont', 'textAlign', 'hyphenation', 'chapterNumbering', 'binding'];
    const r = chineseDefaults(base, { locale: 'zh-Hant', vertical: true, include });
    expect(r.config.bodyText?.fontFamily).toBe('Noto Serif TC');
    expect(r.config.bodyText?.textAlign).toBe('justify');
    // Hyphenation loses its "on": a Chinese document is not hyphenated.
    expect(r.config.bodyText?.hyphenation).toEqual({ locale: 'es' });
    expect(resolveBodyTextConfig(r.config.bodyText, r.config.locale).hyphenation.enabled).toBe(false);
    // Level 1 keeps its other settings.
    expect(r.config.headings?.levels?.[0]).toEqual({
      level: 1, numberingTemplate: '第{1:一}章', numberSeparator: '　', breakBefore: { enabled: true, parity: 'any' },
    });
    expect(r.config.page).toEqual({ dpi: 150 });
    // Only what `include` names (and the required rows) applies.
    expect(r.config.headings?.fontFamily).toBeUndefined();
    expect(r.config.captionStyle).toBeUndefined();
  });

  it('keeps renamed and added resource types, renaming only the built-in ones when ticked', () => {
    const own = [
      { ...defaultResourceTypes('en')[0]!, name: 'Plate', captionPrefix: 'Plate' },
      defaultResourceTypes('en')[1]!,
      { id: 'map', name: 'Map', shortLabel: 'Map', captionPrefix: 'Map', numberingTemplate: '{n}', resetOn: 'never' as const, counterFormat: 'decimal' as const },
    ];
    const base: PostextConfig = { ...createDefaultConfig('en'), resourceTypes: own };
    const kept = chineseDefaults(base, { locale: 'zh-Hans' });
    expect(change(kept, 'resourceTypes')).toMatchObject({ customised: true, applied: false });
    expect(kept.config.resourceTypes).toBe(own);
    const ticked = chineseDefaults(base, { locale: 'zh-Hans', include: ['resourceTypes'] });
    expect(ticked.config.resourceTypes?.map((t) => [t.id, t.name, t.numberingTemplate])).toEqual([
      ['figure', '图', '{h1}-{n}'], ['table', '表', '{h1}-{n}'], ['map', 'Map', '{n}'],
    ]);
  });

  it('switches a Simplified book to Traditional without calling its Chinese settings the author\'s own', () => {
    const hans = chineseDefaults(createDefaultConfig('en'), { locale: 'zh-Hans' }).config;
    const r = chineseDefaults(hans, { locale: 'zh-Hant' });
    expect(r.changes.some((c) => c.customised)).toBe(false);
    expect(ids(r)).toEqual(['locale', 'bodyFont', 'headingFont', 'resourceTypes', 'listNumbers']);
    expect(r.config.resourceTypes).toEqual(defaultResourceTypes('zh-Hant'));
    expect(r.config.orderedLists?.levels?.[1]?.numberFormat).toBe('trad-chinese-informal');
    // Applying it again changes nothing.
    expect(chineseDefaults(r.config, { locale: 'zh-Hant' }).changes).toEqual([]);
  });

  it('turns a vertical book horizontal when asked, and drops a contrary binding when ticked', () => {
    const base: PostextConfig = { ...createDefaultConfig('en'), locale: 'zh-Hant', layout: { writingMode: 'vertical-rl', layoutType: 'double' }, page: { binding: 'right' } };
    const r = chineseDefaults(base, { locale: 'zh-Hant', vertical: false, include: ['binding'] });
    expect(r.config.layout).toEqual({ layoutType: 'double' });
    expect(r.config.page).toBeUndefined();
    expect(change(r, 'binding')).toMatchObject({ customised: true, from: { kind: 'binding', value: 'right' }, to: { kind: 'binding', value: 'left', auto: true } });
  });
});

describe('undoChineseDefaults', () => {
  it('restores what the action changed in one step', () => {
    const before = createDefaultConfig('en');
    const after = chineseDefaults(before, { locale: 'zh-Hant', vertical: true }).config;
    const undone = undoChineseDefaults(after, before, after);
    expect(undone).toEqual(before);
  });

  it('keeps the edits made after the action', () => {
    const before = createDefaultConfig('en');
    const after = chineseDefaults(before, { locale: 'zh-Hans' }).config;
    const edited: PostextConfig = { ...after, bodyText: { ...after.bodyText, fontSize: { value: 11, unit: 'pt' } }, math: { enabled: false } };
    const undone = undoChineseDefaults(edited, before, after);
    expect(undone.locale).toBeUndefined();
    expect(undone.resourceTypes).toEqual(before.resourceTypes);
    // Body text was edited since: it stays as it is now.
    expect(undone.bodyText).toBe(edited.bodyText);
    expect(undone.math).toEqual({ enabled: false });
  });
});
