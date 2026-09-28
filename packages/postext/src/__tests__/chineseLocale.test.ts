import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  canonicalLocaleTag,
  cjkRegionOf,
  DOCUMENT_LANGUAGES,
  hyphenationLocaleFor,
  isCjkLanguage,
  localeScript,
  renderLangOf,
  sameContentLocale,
  stringsKeyOf,
} from '../locale';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { defaultTableContinuationStrings } from '../defaults/tableStyle';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { stripConfigDefaults } from '../defaults';
import { resolveAllConfig, resolvedLocale } from '../pipeline/config';
import { expandIndexDirectives } from '../pipeline/indexDirective';
import { buildDocument } from '../pipeline';
import { parseMarkdown } from '../parse';
import { renderToHtml } from '../html-backend';
import type { OutlineEntry, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

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

afterEach(() => {
  vi.restoreAllMocks();
});

/** The opening of 红楼梦, chapter 1 (程乙本). */
const HLM_HANT = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';

describe('Chinese locale tags', () => {
  // [tag, script, region, strings key]
  const TAGS: [string, string, string, string][] = [
    ['zh', 'Hans', 'mainland', 'zh-hans'],
    ['zh-Hans', 'Hans', 'mainland', 'zh-hans'],
    ['zh-CN', 'Hans', 'mainland', 'zh-hans'],
    ['zh-SG', 'Hans', 'mainland', 'zh-hans'],
    ['zh-Hans-CN', 'Hans', 'mainland', 'zh-hans'],
    ['zh-Hant', 'Hant', 'taiwan', 'zh-hant'],
    ['zh-TW', 'Hant', 'taiwan', 'zh-hant'],
    ['zh-Hant-TW', 'Hant', 'taiwan', 'zh-hant'],
    ['zh-HK', 'Hant', 'hongkong', 'zh-hant'],
    ['zh-MO', 'Hant', 'hongkong', 'zh-hant'],
    ['zh-Hant-HK', 'Hant', 'hongkong', 'zh-hant'],
    // Any case, `_` or `-`.
    ['ZH-hant', 'Hant', 'taiwan', 'zh-hant'],
    ['zh_tw', 'Hant', 'taiwan', 'zh-hant'],
    ['zh_Hant_HK', 'Hant', 'hongkong', 'zh-hant'],
    ['zh-cn', 'Hans', 'mainland', 'zh-hans'],
  ];

  it('reads the script, the region and the strings key', () => {
    for (const [tag, script, region, key] of TAGS) {
      expect([localeScript(tag), cjkRegionOf(tag), stringsKeyOf(tag)], tag).toEqual([script, region, key]);
    }
  });

  it('keeps the bare language for every other tag', () => {
    expect(stringsKeyOf('es-ES')).toBe('es');
    expect(stringsKeyOf('en-us')).toBe('en');
    expect(stringsKeyOf('pt_BR')).toBe('pt');
    expect(cjkRegionOf('ja')).toBeUndefined();
    expect(cjkRegionOf('en')).toBeUndefined();
    expect(localeScript('')).toBeUndefined();
    expect(localeScript('not a tag!')).toBeUndefined();
  });

  it('knows the languages set without hyphenation', () => {
    for (const tag of ['zh', 'zh-Hant', 'ZH_tw', 'ja', 'ja-JP', 'ko', 'ko-KR']) expect(isCjkLanguage(tag), tag).toBe(true);
    for (const tag of ['en', 'es', 'yi', '', undefined]) expect(isCjkLanguage(tag), String(tag)).toBe(false);
  });

  it('matches content languages by language and, for Chinese, script', () => {
    expect(sameContentLocale('zh-TW', 'zh-Hant')).toBe(true);
    expect(sameContentLocale('zh-HK', 'zh-hant')).toBe(true);
    expect(sameContentLocale('zh', 'zh-Hans')).toBe(true);
    expect(sameContentLocale('zh-CN', 'zh_hans')).toBe(true);
    expect(sameContentLocale('zh-Hans', 'zh-Hant')).toBe(false);
    expect(sameContentLocale('zh-TW', 'zh')).toBe(false);
    expect(sameContentLocale('es', 'es-MX')).toBe(true);
    expect(sameContentLocale('es', 'en')).toBe(false);
    expect(sameContentLocale('sr-Latn', 'sr-Cyrl')).toBe(false);
  });

  it('writes tags in canonical case', () => {
    expect(canonicalLocaleTag('zh-hant-tw')).toBe('zh-Hant-TW');
    expect(canonicalLocaleTag('zh_Hans')).toBe('zh-Hans');
    expect(canonicalLocaleTag('en-us')).toBe('en-US');
    expect(canonicalLocaleTag('')).toBeUndefined();
  });

  it('lists the document languages with built-in strings', () => {
    expect(DOCUMENT_LANGUAGES.map((l) => l.tag)).toEqual(['en-us', 'es', 'fr', 'de', 'it', 'pt', 'ca', 'nl', 'zh-Hans', 'zh-Hant', 'zh-Hant-HK']);
    expect(DOCUMENT_LANGUAGES.slice(-3).map((l) => l.name)).toEqual(['中文（简体）', '中文（繁體）', '中文（香港）']);
  });
});

describe('Chinese built-in strings', () => {
  it('resource types in each script, numbered 1-1', () => {
    for (const [tag, fig] of [['zh-Hans', '图'], ['zh-CN', '图'], ['zh', '图'], ['zh-Hant', '圖'], ['zh-TW', '圖'], ['zh-HK', '圖']] as const) {
      const [figure, table] = defaultResourceTypes(tag);
      expect([figure!.name, figure!.namePlural, figure!.shortLabel, figure!.captionPrefix], tag).toEqual([fig, fig, fig, fig]);
      expect([table!.name, table!.shortLabel, table!.captionPrefix], tag).toEqual(['表', '表', '表']);
      expect(figure!.numberingTemplate).toBe('{h1}-{n}');
      expect(table!.numberingTemplate).toBe('{h1}-{n}');
    }
    // Other languages keep the dotted template.
    expect(defaultResourceTypes('ja')[0]!.numberingTemplate).toBe('{h1}.{n}');
    expect(defaultResourceTypes('ja')[0]!.name).toBe('Figure');
  });

  it('continuation strings of tables and boxes', () => {
    expect(defaultTableContinuationStrings('zh-Hans')).toEqual({ continuedSuffix: '（续）', continuesMarker: '接下页' });
    expect(defaultTableContinuationStrings('zh-TW')).toEqual({ continuedSuffix: '（續）', continuesMarker: '接下頁' });
    const hant = resolveAllConfig({ locale: 'zh-Hant', calloutStyles: [{ id: 'note' }] });
    expect(hant.tableStyle.continuedSuffix).toBe('（續）');
    expect(hant.calloutStyles.find((c) => c.id === 'note')!.continuesMarker).toBe('接下頁');
  });

  it('the document language falls back to the hyphenation tag as written', () => {
    const resolved = resolveAllConfig({ bodyText: { hyphenation: { locale: 'zh-Hant' } } });
    expect(resolvedLocale(resolved)).toBe('zh-Hant');
    expect(resolved.tableStyle.continuedSuffix).toBe('（續）');
  });

  const markEntry = (path: string[], pageIndex: number, extra: Partial<NonNullable<OutlineEntry['indexMark']>> = {}): OutlineEntry => ({
    kind: 'indexMark', level: 0, title: path.join('!'), number: '', numbered: false, listed: false,
    indexMark: { index: '', path, sourceStart: pageIndex * 100 + path.length, ...extra },
    pageIndex, pageLabel: String(pageIndex + 1), pageFormat: 'decimal',
  });
  const expanded = (config: PostextConfig, outline: OutlineEntry[]) =>
    expandIndexDirectives(parseMarkdown(':::index'), outline, resolveAllConfig(config)).blocks
      .filter((b) => b.index)
      .map((b) => `${b.index!.group ? `[${b.index!.group}] ` : ''}${b.text}`);

  it('index cross-references and group heads', () => {
    const outline = [
      markEntry(['賈寶玉'], 1), markEntry(['寶玉'], 2, { see: '賈寶玉' }), markEntry(['林黛玉'], 3, { seeAlso: '賈寶玉' }),
      markEntry(['#'], 4), markEntry(['1792'], 5),
    ];
    const hant = expanded({ locale: 'zh-Hant' }, outline);
    expect(hant.some((t) => t.includes('見 賈寶玉'))).toBe(true);
    expect(hant.some((t) => t.includes('另見 賈寶玉'))).toBe(true);
    expect(hant.some((t) => t.startsWith('[符號]'))).toBe(true);
    expect(hant.some((t) => t.startsWith('[數字]'))).toBe(true);
    const hans = expanded({ locale: 'zh-Hans' }, [markEntry(['宝玉'], 2, { see: '贾宝玉' }), markEntry(['贾宝玉'], 1), markEntry(['#'], 4), markEntry(['1792'], 5)]);
    expect(hans.some((t) => t.includes('见 贾宝玉'))).toBe(true);
    expect(hans.some((t) => t.startsWith('[符号]'))).toBe(true);
    expect(hans.some((t) => t.startsWith('[数字]'))).toBe(true);
    // Other languages keep 0–9.
    expect(expanded({ locale: 'en' }, [markEntry(['1792'], 5)])).toEqual(['[0–9] 1792, 6']);
  });
});

describe('hyphenation in Chinese, Japanese and Korean documents', () => {
  it('is off by default and never warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const tag of ['zh-Hans', 'zh-Hant-TW', 'ja', 'ko-KR']) {
      const body = resolveBodyTextConfig(undefined, tag);
      expect(body.hyphenation.enabled, tag).toBe(false);
      expect(hyphenationLocaleFor(tag)).toBe('en-us');
    }
    // A Chinese hyphenation language, even switched on, has no patterns.
    expect(resolveBodyTextConfig({ hyphenation: { enabled: true, locale: 'zh' } }).hyphenation.enabled).toBe(false);
    expect(resolveBodyTextConfig({ hyphenation: { enabled: true } }, 'zh-Hans').hyphenation.enabled).toBe(false);
    buildDocument({ markdown: HLM_HANT }, { locale: 'zh-Hant' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('runs for the Latin words when turned on with a language', () => {
    const body = resolveBodyTextConfig({ hyphenation: { enabled: true, locale: 'en-us' } }, 'zh-Hans');
    expect(body.hyphenation.enabled).toBe(true);
    expect(body.hyphenation.locale).toBe('en-us');
    // Other languages keep their default.
    expect(resolveBodyTextConfig(undefined, 'es').hyphenation.enabled).toBe(true);
    expect(resolveBodyTextConfig(undefined, undefined).hyphenation.enabled).toBe(true);
  });

  it('keeps an explicit hyphenation setting when defaults are stripped', () => {
    const config: PostextConfig = { locale: 'zh-Hans', bodyText: { hyphenation: { enabled: true, locale: 'en-us' } } };
    expect(stripConfigDefaults(config)?.bodyText?.hyphenation).toEqual({ enabled: true, locale: 'en-us' });
    // A Latin document still strips it.
    expect(stripConfigDefaults({ locale: 'es', bodyText: { hyphenation: { enabled: true } } })?.bodyText).toBeUndefined();
  });
});

describe('lang in the output', () => {
  const docOf = (config: PostextConfig): VDTDocument => buildDocument({ markdown: HLM_HANT }, config);

  it('the HTML root declares a Chinese document language, script and region kept', () => {
    expect(renderToHtml(docOf({ locale: 'zh-hant-tw' }))).toContain('<div class="pt-doc" lang="zh-Hant-TW"');
    expect(renderToHtml(docOf({ locale: 'zh-Hans' }))).toContain('<div class="pt-doc" lang="zh-Hans"');
    expect(renderLangOf({ bodyText: { hyphenation: { tag: 'ja-JP' } } })).toBe('ja-JP');
  });

  it('other documents print as before', () => {
    expect(renderToHtml(docOf({ locale: 'es' }))).toContain('<div class="pt-doc" data-mode=');
    expect(renderLangOf({ locale: 'en-us' })).toBeUndefined();
  });

  it('the canvas paints in the document language', () => {
    const doc = docOf({ locale: 'zh-Hant' });
    const set: string[] = [];
    const ctx = new Proxy({ lang: '' } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => ({ width: 0 })),
      set: (t, k, v) => { if (k === 'lang') set.push(v as string); t[k as string] = v; return true; },
      has: (t, k) => k in t || k === 'lang',
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    return import('../canvas-backend').then(({ renderPageToCanvas }) => {
      renderPageToCanvas(doc.pages[0]!, doc, canvas);
      expect(set).toEqual(['zh-Hant']);
    });
  });
});
