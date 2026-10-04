import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { defaultResourceTypes, resolveBodyTextConfig, resolveFootnotesConfig, resolveOrderedListsConfig, resolvePageConfig } from 'postext';
import { createDefaultConfig } from './defaultConfig';
import {
  arabicDefaults, arabicFontsFor, forgetArabicDefaults, isArabicScriptLanguage, recallArabicDefaults, rememberArabicDefaults,
  takeArabicDefaultsFocus, undoArabicDefaults,
  type ArabicDefaultId,
} from './arabicDefaults';
import { recallChineseDefaults, rememberChineseDefaults, forgetChineseDefaults } from './chineseDefaults';
import { documentDigits, documentDirection, documentLanguage } from './documentDirection';

const ids = (r: ReturnType<typeof arabicDefaults>) => r.changes.map((c) => c.id);
const change = (r: ReturnType<typeof arabicDefaults>, id: ArabicDefaultId) => r.changes.find((c) => c.id === id);
/** A book whose language the author switched to Arabic in the picker (the
 *  picker relocalises the built-in figure and table names). */
const arabicBook = (locale = 'ar'): PostextConfig => ({ ...createDefaultConfig(locale), locale });

describe('arabicDefaults', () => {
  it('sets up a pristine Arabic book in the classical faces', () => {
    const before = arabicBook();
    const r = arabicDefaults(before, { locale: 'ar' });
    // Right to left and the right binding come with the language already,
    // and so does hyphenation off (#368); justified text is the engine's
    // default; the names are Arabic.
    expect(ids(r)).toEqual(['bodyFont', 'headingFont', 'lineHeight', 'captionLabel', 'chapterNumbering', 'listNumbers', 'footnotes']);
    expect(r.changes.every((c) => c.applied && !c.customised && !c.required)).toBe(true);
    const c = r.config;
    expect(c.bodyText?.fontFamily).toBe('Amiri');
    expect(c.headings?.fontFamily).toBe('Amiri');
    expect(c.bodyText?.lineHeight).toEqual({ value: 1.75, unit: 'em' });
    expect(resolveBodyTextConfig(c.bodyText, c.locale).hyphenation.enabled).toBe(false);
    expect(c.captionStyle).toEqual({ labelSeparator: ': ' });
    expect(c.headings?.levels).toEqual([{ level: 1, numberingTemplate: 'الفصل {1:ordinal}', numberSeparator: ': ' }]);
    const lists = resolveOrderedListsConfig(c.orderedLists, resolveBodyTextConfig(c.bodyText, c.locale), c.locale);
    expect(lists.levels.slice(0, 3).map((l) => [l.numberFormat, l.prefix, l.separator])).toEqual([
      ['arabic', '', '-'],
      ['abjad', '', '-'],
      ['arabic', '(', ')'],
    ]);
    expect(c.footnotes).toEqual({ numbering: 'page', markerTemplate: '({n})', noteNumberPosition: 'inline' });
    expect(resolveFootnotesConfig(c.footnotes, c.locale).markerPosition).toBe('superscript');
    // Emphasis is already bold in an Arabic book: no row.
    expect(c.bodyText?.emphasis).toBeUndefined();
    // Nothing else moves: the language, the direction, the palette.
    expect(c.locale).toBe('ar');
    expect(c.direction).toBeUndefined();
    expect(c.numerals).toBeUndefined();
    expect(c.colorPalette).toBe(before.colorPalette);
    expect(c.resourceTypes).toBe(before.resourceTypes);
    expect(resolvePageConfig(c.page, 'ar', undefined, documentDirection(c.direction, 'ar')).binding).toBe('right');
  });

  it('names what each row changes from and to, in the document digits', () => {
    const r = arabicDefaults(arabicBook(), { locale: 'ar' });
    expect(change(r, 'lineHeight')).toMatchObject({ from: { kind: 'dimension', value: { value: 1.5, unit: 'em' } }, to: { kind: 'dimension', value: { value: 1.75, unit: 'em' } } });
    expect(change(r, 'captionLabel')).toMatchObject({ from: { kind: 'text', text: 'شكل ١-١. …' }, to: { kind: 'text', text: 'شكل ١-١: …' } });
    expect(change(r, 'chapterNumbering')).toMatchObject({ from: { kind: 'none' }, to: { kind: 'text', text: 'الفصل الأول' } });
    expect(change(r, 'listNumbers')).toMatchObject({ from: { kind: 'text', text: '١. ١. ١.' }, to: { kind: 'text', text: '١- أ- (١)' } });
    expect(change(r, 'footnotes')).toMatchObject({
      from: { kind: 'footnotes', marker: '١', position: 'superscript', numbering: 'chapter' },
      to: { kind: 'footnotes', marker: '(١)', position: 'superscript', numbering: 'page', noteNumber: 'inline' },
    });
    expect(change(r, 'footnotes')?.from).not.toHaveProperty('noteNumber');
    // The Maghreb prints European digits.
    const ma = arabicDefaults(arabicBook('ar-MA'), { locale: 'ar-MA' });
    expect(change(ma, 'captionLabel')?.to).toEqual({ kind: 'text', text: 'شكل 1-1: …' });
    expect(change(ma, 'listNumbers')?.to).toEqual({ kind: 'text', text: '1- أ- (1)' });
  });

  it('offers Noto Naskh Arabic with Noto Kufi Arabic headings as the modern faces', () => {
    expect(arabicFontsFor('modern')).toEqual({ body: 'Noto Naskh Arabic', headings: 'Noto Kufi Arabic' });
    const r = arabicDefaults(arabicBook(), { locale: 'ar', faces: 'modern' });
    expect(r.config.bodyText?.fontFamily).toBe('Noto Naskh Arabic');
    expect(r.config.headings?.fontFamily).toBe('Noto Kufi Arabic');
    // A classical book switched to modern takes the other faces without asking.
    const classical = arabicDefaults(arabicBook(), { locale: 'ar' }).config;
    const switched = arabicDefaults(classical, { locale: 'ar', faces: 'modern' });
    expect(ids(switched)).toEqual(['bodyFont', 'headingFont']);
    expect(switched.changes.every((c) => !c.customised && c.applied)).toBe(true);
  });

  it('relocalises a book still named in another language, keeping types of the author\'s own', () => {
    const english: PostextConfig = { ...createDefaultConfig('en'), locale: 'ar' };
    const r = arabicDefaults(english, { locale: 'ar' });
    expect(change(r, 'resourceTypes')).toMatchObject({ from: { kind: 'text', text: 'Figure, Table' }, to: { kind: 'text', text: 'شكل، جدول' }, customised: false });
    expect(r.config.resourceTypes).toEqual(defaultResourceTypes('ar'));
    const own: PostextConfig = { ...english, resourceTypes: [...defaultResourceTypes('en'), { ...defaultResourceTypes('en')[0]!, id: 'map', name: 'Map', captionPrefix: 'Map' }] };
    const mine = arabicDefaults(own, { locale: 'ar' });
    expect(change(mine, 'resourceTypes')).toMatchObject({ customised: true, applied: false });
    const ticked = arabicDefaults(own, { locale: 'ar', include: ['resourceTypes'] });
    expect(ticked.config.resourceTypes?.map((t) => t.name)).toEqual(['شكل', 'جدول', 'Map']);
  });

  it('returns a book set left to right to Auto, a row the author cannot untick', () => {
    const r = arabicDefaults({ ...arabicBook(), direction: 'ltr' }, { locale: 'ar', include: [] });
    expect(change(r, 'direction')).toMatchObject({
      from: { kind: 'direction', value: 'ltr' },
      to: { kind: 'direction', value: 'rtl', auto: true },
      required: true,
      applied: true,
    });
    expect(r.config.direction).toBeUndefined();
    // An explicit right to left is what the language gives anyway.
    expect(ids(arabicDefaults({ ...arabicBook(), direction: 'rtl' }, { locale: 'ar' }))).not.toContain('direction');
  });

  it('lists the author\'s own binding, digits, leading and footnote numbering unticked', () => {
    const base: PostextConfig = {
      ...arabicBook(),
      page: { binding: 'left' },
      numerals: 'latn',
      bodyText: { lineHeight: { value: 2, unit: 'em' } },
      footnotes: { numbering: 'document' },
    };
    const r = arabicDefaults(base, { locale: 'ar' });
    for (const id of ['binding', 'numerals', 'lineHeight', 'footnotes'] as const) {
      expect(change(r, id), id).toMatchObject({ customised: true, applied: false });
    }
    expect(change(r, 'binding')).toMatchObject({ from: { kind: 'binding', value: 'left' }, to: { kind: 'binding', value: 'right', auto: true } });
    expect(change(r, 'numerals')).toMatchObject({ from: { kind: 'digits', value: 'latn' }, to: { kind: 'digits', value: 'arab', auto: true } });
    expect(r.config.page).toEqual({ binding: 'left' });
    expect(r.config.numerals).toBe('latn');
    // With the digits row left out the samples keep the author's digits;
    // ticked, they take the region's.
    expect(change(r, 'listNumbers')?.to).toEqual({ kind: 'text', text: '1- أ- (1)' });
    const ticked = arabicDefaults(base, { locale: 'ar', include: ['binding', 'numerals'] });
    expect(ticked.config.page).toBeUndefined();
    expect(ticked.config.numerals).toBeUndefined();
    expect(change(ticked, 'listNumbers')?.to).toEqual({ kind: 'text', text: '١- أ- (١)' });
    // Digits that are the region's own need no row.
    expect(ids(arabicDefaults({ ...arabicBook(), numerals: 'arab' }, { locale: 'ar' }))).not.toContain('numerals');
  });

  it('keeps hyphenation the author turned on for a Latin language they named', () => {
    const base: PostextConfig = { ...arabicBook(), bodyText: { hyphenation: { enabled: true, locale: 'en-us' } } };
    expect(change(arabicDefaults(base, { locale: 'ar' }), 'hyphenation')).toMatchObject({ customised: true, applied: false });
    // Turned on with no language named, the engine keeps it off for an
    // Arabic book (#368): nothing to offer.
    const plain: PostextConfig = { ...arabicBook(), bodyText: { hyphenation: { enabled: true } } };
    const r = arabicDefaults(plain, { locale: 'ar' });
    expect(change(r, 'hyphenation')).toBeUndefined();
    expect(resolveBodyTextConfig(r.config.bodyText, r.config.locale).hyphenation.enabled).toBe(false);
  });

  it('moves heading faces of levels and styles to the chosen set', () => {
    const base: PostextConfig = {
      ...arabicBook(),
      headings: { fontFamily: 'Noto Kufi Arabic', levels: [{ level: 2, fontFamily: 'Noto Naskh Arabic' }, { level: 3, fontFamily: 'Fraunces' }] },
    };
    const r = arabicDefaults(base, { locale: 'ar' });
    expect(change(r, 'headingFont')).toMatchObject({
      from: { kind: 'text', text: 'Noto Kufi Arabic; H2: Noto Naskh Arabic; H3: Fraunces' },
      customised: true,
    });
    const ticked = arabicDefaults(base, { locale: 'ar', include: ['headingFont'] });
    expect(ticked.config.headings?.fontFamily).toBe('Amiri');
    expect(ticked.config.headings?.levels?.slice(0, 2)).toEqual([{ level: 2, fontFamily: 'Amiri' }, { level: 3 }]);
  });

  it('has nothing left to change once applied', () => {
    const once = arabicDefaults(arabicBook(), { locale: 'ar' }).config;
    expect(arabicDefaults(once, { locale: 'ar' }).changes).toEqual([]);
  });

  it('is taken back by Undo, keeping what the author changed since', () => {
    const before = arabicBook();
    const after = arabicDefaults(before, { locale: 'ar' }).config;
    expect(undoArabicDefaults(after, before, after)).toEqual({ config: before, kept: [] });
    const edited: PostextConfig = { ...after, bodyText: { ...after.bodyText, fontFamily: 'Scheherazade New' } };
    const undone = undoArabicDefaults(edited, before, after);
    expect(undone.kept).toEqual(['bodyText.fontFamily']);
    expect(undone.config.bodyText).toEqual({ fontFamily: 'Scheherazade New' });
    expect(undone.config.headings).toBeUndefined();
  });

  it('remembers its last application apart from the Chinese list', () => {
    forgetArabicDefaults();
    forgetChineseDefaults();
    const at = 1_000;
    rememberArabicDefaults({ book: 'b', at, status: { kind: 'applied', count: 3 }, undo: null, focus: 'status' });
    expect(recallChineseDefaults('b', at)).toBeNull();
    rememberChineseDefaults({ book: 'b', at, status: { kind: 'undone', partial: false }, undo: null });
    expect(recallArabicDefaults('b', at)?.status).toEqual({ kind: 'applied', count: 3 });
    expect(takeArabicDefaultsFocus('b', at)).toBe('status');
    expect(takeArabicDefaultsFocus('b', at)).toBeNull();
    expect(recallArabicDefaults('other', at)).toBeNull();
    forgetChineseDefaults();
  });
});

describe('document direction and digits', () => {
  it('reads Auto from the language as the engine does', () => {
    expect(documentDirection(undefined, 'ar')).toBe('rtl');
    expect(documentDirection('auto', 'ar-EG')).toBe('rtl');
    expect(documentDirection('ltr', 'ar')).toBe('ltr');
    expect(documentDirection('rtl', 'en')).toBe('rtl');
    expect(documentDirection('sideways', 'he')).toBe('rtl');
    expect(documentDirection(undefined, 'es')).toBe('ltr');
    expect(documentDigits(undefined, 'ar')).toBe('arab');
    expect(documentDigits('auto', 'ar-MA')).toBe('latn');
    expect(documentDigits('arabext', 'en')).toBe('arabext');
    expect(documentDigits('roman', 'fa')).toBe('arabext');
    expect(documentLanguage({ bodyText: { hyphenation: { locale: 'ar' } } }, 'en')).toBe('ar');
    expect(documentLanguage({ locale: ' ' }, 'es')).toBe('es');
  });

  it('knows which languages the Arabic list is for', () => {
    expect(isArabicScriptLanguage('ar')).toBe(true);
    expect(isArabicScriptLanguage('ar-MA')).toBe(true);
    expect(isArabicScriptLanguage('fa')).toBe(true);
    expect(isArabicScriptLanguage('he')).toBe(false);
    expect(isArabicScriptLanguage('en')).toBe(false);
    expect(isArabicScriptLanguage(undefined)).toBe(false);
  });

  it('returns an emphasis the author set to Auto, which is bold in Arabic', () => {
    for (const emphasis of ['italic', 'color', 'overline'] as const) {
      const base: PostextConfig = { ...arabicBook(), bodyText: { emphasis, lineHeight: { value: 1.75, unit: 'em' } } };
      const r = arabicDefaults(base, { locale: 'ar' });
      expect(change(r, 'emphasis'), emphasis).toMatchObject({
        from: { kind: 'emphasis', value: emphasis },
        to: { kind: 'emphasis', value: 'bold', auto: true },
        customised: true,
        applied: false,
      });
      expect(r.config.bodyText?.emphasis).toBe(emphasis);
      const ticked = arabicDefaults(base, { locale: 'ar', include: ['emphasis'] }).config;
      expect(ticked.bodyText).toEqual({ lineHeight: { value: 1.75, unit: 'em' } });
    }
    // An explicit bold, or Auto, needs no row.
    expect(ids(arabicDefaults({ ...arabicBook(), bodyText: { emphasis: 'bold' } }, { locale: 'ar' }))).not.toContain('emphasis');
    expect(ids(arabicDefaults({ ...arabicBook(), bodyText: { emphasis: 'auto' } }, { locale: 'ar' }))).not.toContain('emphasis');
  });

  it('sets notes in parentheses with the note\'s number on the line, keeping a template of the author\'s own', () => {
    // Per-page notes already: the row still brings the parentheses.
    const paged = arabicDefaults({ ...arabicBook(), footnotes: { numbering: 'page' } }, { locale: 'ar' });
    expect(change(paged, 'footnotes')).toMatchObject({ customised: false, applied: true });
    expect(paged.config.footnotes).toEqual({ numbering: 'page', markerTemplate: '({n})', noteNumberPosition: 'inline' });
    // Applied once, nothing is left to do.
    expect(ids(arabicDefaults(paged.config, { locale: 'ar' }))).not.toContain('footnotes');
    // A template of the author's own («[١]») is theirs.
    const own = arabicDefaults({ ...arabicBook(), footnotes: { markerTemplate: '[{n}]' } }, { locale: 'ar' });
    expect(change(own, 'footnotes')).toMatchObject({
      from: { kind: 'footnotes', marker: '[١]' },
      customised: true,
      applied: false,
    });
  });

  it('turns kashida justification back on when the author turned it off', () => {
    const base: PostextConfig = { ...arabicBook(), bodyText: { kashida: 'none', lineHeight: { value: 1.75, unit: 'em' } } };
    const r = arabicDefaults(base, { locale: 'ar' });
    expect(change(r, 'kashida')).toMatchObject({ from: { kind: 'switch', on: false }, to: { kind: 'switch', on: true }, customised: true, applied: false });
    const ticked = arabicDefaults(base, { locale: 'ar', include: ['kashida'] }).config;
    expect(ticked.bodyText).toEqual({ lineHeight: { value: 1.75, unit: 'em' } });
    expect(resolveBodyTextConfig(ticked.bodyText, 'ar').kashida).toBe('auto');
    // Unset or 'auto' is already on in an Arabic book.
    expect(ids(arabicDefaults(arabicBook(), { locale: 'ar' }))).not.toContain('kashida');
  });
});
