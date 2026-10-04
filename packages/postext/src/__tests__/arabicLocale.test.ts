import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DOCUMENT_LANGUAGES,
  hyphenationLocaleFor,
  isCjkLanguage,
  isUnhyphenatedLanguage,
  renderLangOf,
  stringsKeyOf,
} from '../locale';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { defaultTableContinuationStrings } from '../defaults/tableStyle';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { resolveIndexConfig, stripIndexDefaults } from '../defaults/indexConfig';
import { resolveAllConfig } from '../pipeline/config';
import { defaultCrossRefStrings } from '../pipeline/crossRefs';
import { citationLocale, defaultBibliographyTitle } from '../pipeline/citations';
import { expandIndexDirectives } from '../pipeline/indexDirective';
import { arabicSortKey } from '../pipeline/indexGroups';
import { dateLocaleOf, metadataText, normalizeMetadata } from '../frontmatter';
import { buildDocument } from '../pipeline';
import { parseMarkdown } from '../parse';
import { renderToHtml } from '../html-backend';
import type { ContentBlock } from '../parse';
import type { DocumentMetadata, OutlineEntry, PostextConfig } from '../types';

// Arabic locale tables, dates, citations and index collation (#372).

const NBSP = '\u00a0';

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

afterEach(() => vi.restoreAllMocks());

describe('Arabic as a document language', () => {
  it('is offered by the language picker: bare, Egyptian and Moroccan', () => {
    expect(DOCUMENT_LANGUAGES.slice(-3)).toEqual([
      { tag: 'ar', name: 'العربية' },
      { tag: 'ar-EG', name: 'العربية (مصر)' },
      { tag: 'ar-MA', name: 'العربية (المغرب)' },
    ]);
    // One strings key for every Arabic tag.
    for (const tag of ['ar', 'ar-EG', 'AR_ma', 'ar-u-nu-latn']) expect(stringsKeyOf(tag), tag).toBe('ar');
  });

  it('is set without hyphenation, as are the other right-to-left languages and CJK', () => {
    for (const tag of ['ar', 'ar-EG', 'AR_ma', 'fa', 'fa-IR', 'ur', 'ps', 'ckb', 'he', 'yi', 'syr', 'dv', 'zh', 'ja', 'ko']) {
      expect(isUnhyphenatedLanguage(tag), tag).toBe(true);
    }
    for (const tag of ['en', 'es', 'tr', 'az', 'ks-Deva', 'sw', '', undefined]) expect(isUnhyphenatedLanguage(tag), String(tag)).toBe(false);
    // The CJK gate is unchanged.
    expect(isCjkLanguage('ar')).toBe(false);
  });

  it('does not report the en-us hyphenation fallback for Arabic, Persian or Hebrew', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const tag of ['ar', 'ar-SA', 'fa', 'he-IL']) expect(hyphenationLocaleFor(tag)).toBe('en-us');
    expect(warn).not.toHaveBeenCalled();
    // A Latin language without patterns still is.
    hyphenationLocaleFor('sv-arabic-test');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('declares its language to the renderers; LTR non-CJK documents still declare none', () => {
    expect(renderLangOf({ locale: 'ar' })).toBe('ar');
    expect(renderLangOf({ locale: 'ar_eg' })).toBe('ar-EG');
    expect(renderLangOf({ locale: 'fa-IR' })).toBe('fa-IR');
    expect(renderLangOf({ locale: 'he' })).toBe('he');
    expect(renderLangOf({ bodyText: { hyphenation: { tag: 'ur-PK' } } })).toBe('ur-PK');
    for (const locale of ['en-us', 'es', 'tr', 'sw']) expect(renderLangOf({ locale }), locale).toBeUndefined();
    const html = renderToHtml(buildDocument({ markdown: 'نص عربي Latin 123.' }, { locale: 'ar-EG' }));
    expect(html).toContain('<div class="pt-doc" lang="ar-EG"');
  });
});

describe('Arabic built-in strings', () => {
  it('names the resource types and numbers them by chapter with a hyphen', () => {
    for (const tag of ['ar', 'ar-EG', 'ar-MA']) {
      const [figure, table] = defaultResourceTypes(tag);
      expect([figure!.name, figure!.namePlural, figure!.shortLabel, figure!.captionPrefix], tag).toEqual(['شكل', 'أشكال', 'شكل', 'شكل']);
      expect([table!.name, table!.namePlural, table!.shortLabel, table!.captionPrefix], tag).toEqual(['جدول', 'جداول', 'جدول', 'جدول']);
      expect(figure!.numberingTemplate).toBe('{h1}-{n}');
      expect(table!.numberingTemplate).toBe('{h1}-{n}');
    }
    // Persian has no strings of its own: English, dotted.
    expect(defaultResourceTypes('fa')[0]!.name).toBe('Figure');
    expect(defaultResourceTypes('fa')[0]!.numberingTemplate).toBe('{h1}.{n}');
  });

  it('cross-references, the bibliography title and the continuation marks', () => {
    expect(defaultCrossRefStrings('ar-EG')).toEqual({ chapter: `الفصل${NBSP}{n}`, section: `القسم${NBSP}{n}`, page: `ص${NBSP}{n}` });
    expect(defaultBibliographyTitle('ar')).toBe('المراجع');
    expect(defaultTableContinuationStrings('ar-MA')).toEqual({ continuedSuffix: '(تابع)', continuesMarker: 'يتبع' });
    // Callouts take the table's continuation marks.
    const resolved = resolveAllConfig({ locale: 'ar' });
    expect(resolved.tableStyle.continuedSuffix).toBe('(تابع)');
  });

  it('cites in the one Arabic CSL locale', () => {
    const resolved = resolveAllConfig({ locale: 'ar-EG' });
    expect(citationLocale(resolved, 'ar-EG')).toBe('ar');
    expect(citationLocale(resolved, 'ar_MA')).toBe('ar');
    expect(citationLocale(resolved, 'ar')).toBe('ar');
    expect(citationLocale(resolveAllConfig({ locale: 'ar', citations: { locale: 'en-GB' } }), 'ar')).toBe('en-GB');
    expect(citationLocale(resolved, 'es')).toBe('es');
  });
});

describe('dates and lists in the front matter', () => {
  const day = new Date(Date.UTC(2026, 9, 4));

  it('pins Arabic to the Gregorian calendar unless the tag names one', () => {
    expect(dateLocaleOf('ar')).toBe('ar-u-ca-gregory');
    expect(dateLocaleOf('ar_SA')).toBe('ar-SA-u-ca-gregory');
    expect(dateLocaleOf('ar-u-ca-islamic')).toBe('ar-u-ca-islamic');
    expect(metadataText(day, 'ar-SA')).toContain('أكتوبر');
    expect(metadataText(day, 'ar-u-ca-islamic')).toContain('ربيع الآخر');
    // Other languages are untouched, their calendar the runtime's.
    expect(dateLocaleOf('es')).toBe('es');
    expect(dateLocaleOf('fa')).toBe('fa');
  });

  it('writes the digits of a numbering system: the tag\'s, else the one passed, else the runtime\'s', () => {
    expect(metadataText(day, 'ar-EG-u-nu-latn')).toBe('4 أكتوبر 2026');
    expect(metadataText(day, 'ar', 'arab')).toBe('٤ أكتوبر ٢٠٢٦');
    expect(metadataText(day, 'ar-MA', 'latn')).toBe('4 أكتوبر 2026');
    // The tag wins over the document's digits.
    expect(metadataText(day, 'ar-u-nu-latn', 'arab')).toBe('4 أكتوبر 2026');
    expect(dateLocaleOf('en', 'latn')).toBe('en-u-nu-latn');
    expect(normalizeMetadata({ publishDate: day } as unknown as DocumentMetadata, 'ar', 'arab').publishDate).toBe('٤ أكتوبر ٢٠٢٦');
  });

  it('joins a list with the Arabic comma', () => {
    expect(metadataText(['الجاحظ', 'ابن قتيبة'], 'ar')).toBe('الجاحظ، ابن قتيبة');
    expect(metadataText(['Ana', 'Luis'], 'es')).toBe('Ana, Luis');
    expect(metadataText(['Ana', 'Luis'])).toBe('Ana, Luis');
  });
});

describe('sort keys of an Arabic index', () => {
  it('drops vowel signs and tatweel, and folds hamza seats, alif waṣla, alif maqṣūra and tāʾ marbūṭa', () => {
    expect(arabicSortKey('كِتَابٌ', false)).toBe('كتاب');
    expect(arabicSortKey('عـــلم', false)).toBe('علم');
    expect(['أحمد', 'إبراهيم', 'آدم', 'ٱبن', 'ءاية'].map((w) => arabicSortKey(w, false))).toEqual(['احمد', 'ابراهيم', 'ادم', 'ابن', 'اايه']);
    expect(arabicSortKey('مؤمن', false)).toBe('مومن');
    expect(arabicSortKey('مسائل', false)).toBe('مسايل');
    expect(arabicSortKey('مستشفى', false)).toBe('مستشفي');
    expect(arabicSortKey('مدرسة', false)).toBe('مدرسه');
    // Presentation forms decompose.
    expect(arabicSortKey('ﻻ', false)).toBe('لا');
  });

  it('ignores the article on request, not a hamza-alif lām nor الله', () => {
    expect(arabicSortKey('البصرة', true)).toBe('بصره');
    expect(arabicSortKey('اَلْكِتَابُ', true)).toBe('كتاب');
    expect(arabicSortKey('ٱلْقُرْآن', true)).toBe('قران');
    expect(arabicSortKey('البصرة', false)).toBe('البصره');
    // ألف: the hamza tells it from the article.
    expect(arabicSortKey('ألف ليلة', true)).toBe('الف ليلة'.replace('ة', 'ه'));
    expect(arabicSortKey('اللّٰه', true)).toBe('الله');
    // Too short to be article + word.
    expect(arabicSortKey('الا', true)).toBe('الا');
    // Latin text keeps its accents; only Arabic letters change.
    expect(arabicSortKey('Émile', true)).toBe('Émile');
  });
});

describe('an Arabic index', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const base: PostextConfig = {
    page: { width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    layout: { layoutType: 'single' },
  };
  const markEntry = (path: string[], pageIndex: number, extra: Partial<NonNullable<OutlineEntry['indexMark']>> = {}): OutlineEntry => ({
    kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
    indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length, ...extra },
    pageIndex, pageLabel: String(pageIndex + 1), pageFormat: 'decimal',
  });
  const expanded = (blocks: ContentBlock[]): string[] => blocks.filter((b) => b.index).map((b) =>
    `${b.index!.group ? `[${b.index!.group}] ` : b.index!.groupStart ? '+ ' : ''}${b.text}`);
  const directive = parseMarkdown(':::index');
  const build = (config: PostextConfig, outline: OutlineEntry[]) =>
    expanded(expandIndexDirectives(directive, outline, resolveAllConfig({ ...base, ...config })).blocks);

  // Latin marker words after each term check the order.
  const outline = [
    markEntry(['البصرة a'], 4),
    markEntry(['بغداد b'], 2),
    markEntry(['بدر c'], 9),
    markEntry(['أحمد d'], 1),
    markEntry(['إبراهيم e'], 7),
    markEntry(['آدم f'], 3),
    markEntry(['الكوفة g'], 5),
    markEntry(['كتاب h'], 6),
    markEntry(['١٠٠١ ليلة i'], 8),
    markEntry(['الجاحظ j'], 2, { see: 'البصرة a' }),
    markEntry(['الجاحظ j'], 10),
  ];

  it('ignores the article, folds the hamza forms, groups under the base letter, Arabic commas', () => {
    expect(build({ locale: 'ar' }, outline)).toEqual([
      '[أرقام] ١٠٠١ ليلة i، 9',
      // ابراهيم, احمد, ادم: the hamza seats sort as bare alif.
      '[ا] إبراهيم e، 8',
      'أحمد d، 2',
      'آدم f، 4',
      '[ب] بدر c، 10',
      'البصرة a، 5',
      'بغداد b، 3',
      '[ج] الجاحظ j، 11. انظر البصرة a',
      '[ك] كتاب h، 7',
      'الكوفة g، 6',
    ]);
  });

  it('keeps the article when `ignoreArticle` is off', () => {
    const out = build({ locale: 'ar', index: { ignoreArticle: false } }, outline);
    expect(out.filter((l) => l.startsWith('['))).toEqual(['[أرقام] ١٠٠١ ليلة i، 9', '[ا] إبراهيم e، 8', '[ب] بدر c، 10', '[ك] كتاب h، 7']);
    // The article words file under ا, after the hamza forms (ا then ل).
    expect(out.slice(1, 7)).toEqual(['[ا] إبراهيم e، 8', 'أحمد d، 2', 'آدم f، 4', 'البصرة a، 5', 'الجاحظ j، 11. انظر البصرة a', 'الكوفة g، 6']);
  });

  it('sorts an entry with its own key by that key, article and all', () => {
    const out = build({ locale: 'ar' }, [markEntry(['البصرة a'], 4, { sort: 'البصرة' }), markEntry(['بدر c'], 9), markEntry(['أحمد d'], 1)]);
    expect(out).toEqual(['[ا] أحمد d، 2', 'البصرة a، 5', '[ب] بدر c، 10']);
  });

  it('separates two cross-references with the Arabic semicolon', () => {
    const out = build({ locale: 'ar' }, [markEntry(['البصرة a'], 4), markEntry(['الكوفة g'], 5), markEntry(['بدر c'], 1, { seeAlso: 'البصرة a' }), markEntry(['بدر c'], 1, { seeAlso: 'الكوفة g' })]);
    expect(out[0]).toBe('[ب] بدر c، 2. انظر أيضًا البصرة a؛ الكوفة g');
  });

  it('resolves its defaults from the index language', () => {
    const body = resolveBodyTextConfig(undefined);
    const ar = resolveIndexConfig(undefined, body, 'ar-EG');
    expect([ar.separator, ar.locatorSeparator, ar.see.italic, ar.ignoreArticle]).toEqual(['، ', '، ', false, true]);
    const fa = resolveIndexConfig(undefined, body, 'fa');
    expect([fa.separator, fa.see.italic, fa.ignoreArticle]).toEqual(['، ', false, false]);
    const en = resolveIndexConfig(undefined, body, 'en');
    expect([en.separator, en.locatorSeparator, en.see.italic, en.ignoreArticle]).toEqual([', ', ', ', true, false]);
    expect(resolveIndexConfig(undefined, body).ignoreArticle).toBe(false);
    // The index's own language wins over the document's.
    expect(resolveIndexConfig({ locale: 'ar' }, body, 'en').ignoreArticle).toBe(true);
    expect(resolveIndexConfig({ locale: 'en' }, body, 'ar').separator).toBe(', ');
    // Explicit values stay.
    const set = resolveIndexConfig({ separator: ' ', ignoreArticle: false, see: { italic: true } }, body, 'ar');
    expect([set.separator, set.locatorSeparator, set.ignoreArticle, set.see.italic]).toEqual([' ', '، ', false, true]);
    expect(resolveIndexConfig({ ignoreArticle: 'yes' as never }, body, 'ar').ignoreArticle).toBe(true);
    // Its default depends on the language: kept when set.
    expect(stripIndexDefaults({ ignoreArticle: true })).toEqual({ ignoreArticle: true });
    expect(stripIndexDefaults({ ignoreArticle: false })).toEqual({ ignoreArticle: false });
  });
});
