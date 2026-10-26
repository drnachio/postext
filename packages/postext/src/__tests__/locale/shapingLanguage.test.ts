import { describe, it, expect, beforeEach } from 'vitest';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { buildDocument } from '../../pipeline/index.js';
import { clearMeasurementCache } from '../../measure/index.js';
import { getMeasureLanguage, measureLanguageKey, measureTextWidth, setMeasureLanguage, withMeasureLanguage } from '../../measure/canvas.js';
import { pretextLanguageState } from '../../measure/pretextLanguage.js';
import { renderLangOf, shapingLanguageOf, shapingTagOf } from '../../hyphenation/locale.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTLineSegment } from '../../vdt.js';

const resolveConfig = (config: PostextConfig) => resolveAllConfig(config);

// #764: a 2D context has a language (`ctx.lang`, Chrome 136 and later) and
// a font answers with other glyphs under one. Left alone a context made on
// a page takes the page's language and one made in a worker none, so a
// document had one layout on a page in its own language, another on a page
// in any other, and that second one in a layout worker. A document has
// its language set on every context the engine measures with, the
// plain-paragraph breaker's own included, and declared
// (`bodyText.shapingLanguage: 'document'`, the default from postext 1.30,
// #770), unless it asks for the host's (`'host'`), as up to postext 1.28.
// The document's was the default in 1.29.0 too, whose canvas painted in
// the host's all the same; 1.29.1 and 1.29.2 went back to the host's.

/** The language of the page that hosts the layout: what a context left at
 *  `inherit` measures in. Empty: a worker, which has none. */
let host = 'en';
/** Every language a measure was taken in, and how many were taken. */
const measuredIn = new Set<string>();
let measures = 0;

const primary = (lang: string): string => lang.toLowerCase().split('-')[0]!;
/** Advances, in ems, of a face that draws by language as the measured
 *  ones do: `Song` (Noto Serif SC) sets its digits 0.471 em wide in
 *  Chinese and 0.55 em in any other language; `Fira` (Fira Sans) sets the
 *  Catalan `l·l` with its dot tucked in, and keeps `f` and `i` apart in
 *  Turkish. A face named `Plain` draws one way. */
function advance(ch: string, font: string, lang: string): number {
  const language = primary(lang);
  if (ch === ' ' || ch === '\u00A0') return 0.25;
  if (font.includes('Song')) {
    if (/[0-9]/.test(ch)) return language === 'zh' ? 0.471 : 0.55;
    if (/\p{Script=Han}/u.test(ch) || ch === '\u3002' || ch === '\uFF0C') return 1;
  }
  if (font.includes('Fira')) {
    if (ch === '\u00B7') return language === 'ca' ? 0.1 : 0.3;
    if (ch === 'f') return language === 'tr' ? 0.36 : 0.3;
  }
  return 0.5;
}

/** A context as a current Chrome makes it: a language of its own,
 *  `inherit` until someone sets one. */
class Context2D {
  private shorthand = '10px Body';
  lang = 'inherit';
  direction = 'ltr';
  letterSpacing = '0px';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  fillStyle = '';
  get font(): string {
    return this.shorthand;
  }
  set font(value: string) {
    this.shorthand = value;
  }
  measureText(s: string): { width: number } {
    const lang = this.lang === 'inherit' ? host : this.lang;
    measuredIn.add(this.lang === 'inherit' ? `host:${host}` : this.lang);
    measures++;
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.shorthand)?.[1] ?? '10');
    let width = 0;
    for (const ch of s) width += advance(ch, this.shorthand, lang) * size;
    return { width };
  }
}
const contexts: Context2D[] = [];
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = Context2D;
globals.OffscreenCanvas = class {
  getContext(): Context2D {
    const ctx = new Context2D();
    contexts.push(ctx);
    return ctx;
  }
};

beforeEach(() => {
  host = 'en';
  clearMeasurementCache();
  measuredIn.clear();
  measures = 0;
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (family: string, locale: string | undefined, extra: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(220), height: pt(600), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...(locale ? { locale } : {}),
  ...extra,
  // The documents of these tests name no language to be shaped in, so
  // they are shaped in their own, unless a test says otherwise.
  bodyText: { fontFamily: family, fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, ...extra.bodyText },
});
const OWN = { shapingLanguage: 'document' as const };
const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg);
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const layout = (doc: VDTDocument): unknown => paragraphs(doc).map((b) => b.lines.map((l) => [l.text.trim(), +l.bbox.width.toFixed(3)]));
const segmentsOf = (doc: VDTDocument): VDTLineSegment[] => paragraphs(doc).flatMap((b) => b.lines.flatMap((l) => l.segments ?? []));

// A paragraph with no formatting (the plain-paragraph breaker measures it
// on a context of its own) and one with a bold word (the engine's).
const CHINESE = 'In 2016 the strip ran 2516 times and 1024 of them in 2025 again.\n\nIn **2016** the strip ran 2516 times and 1024 of them in 2025 again.\n';
const CATALAN = 'El col\u00B7legi va instal\u00B7lar la pel\u00B7l\u00EDcula de la til\u00B7la al sal\u00F3 gran.\n\nEl **col\u00B7legi** va instal\u00B7lar la pel\u00B7l\u00EDcula de la til\u00B7la al sal\u00F3 gran.\n';

describe('the language a document is shaped in (#764)', () => {
  it('is its own by default: the locale, else the hyphenation language, in canonical form', () => {
    for (const bodyText of [{}, OWN]) {
      expect(shapingLanguageOf({ locale: 'zh-hans', bodyText })).toBe('zh-Hans');
      expect(shapingLanguageOf({ locale: 'CA', bodyText })).toBe('ca');
      expect(shapingLanguageOf({ bodyText: { hyphenation: { locale: 'en-us' }, ...bodyText } })).toBe('en-US');
      // A document with no locale resolves to the hyphenation default.
      expect(shapingLanguageOf(resolveConfig({ bodyText }))).toBe('en-US');
      expect(shapingLanguageOf(resolveConfig({ locale: 'tr', bodyText }))).toBe('tr');
      // A locale that is no tag: no language at all, the same on every host.
      expect(shapingLanguageOf({ locale: 'not a tag!', bodyText })).toBe('');
    }
    expect(shapingLanguageOf({ locale: 'ca' })).toBe('ca');
    expect(shapingLanguageOf(resolveConfig({}))).toBe('en-US');
    expect(shapingTagOf('EN-us')).toBe('en-US');
    expect(shapingTagOf(' klingon! ')).toBe('klingon!');
  });

  it('is the host\'s when the document asks for it, as up to postext 1.28', () => {
    const pinned = { shapingLanguage: 'host' as const };
    expect(shapingLanguageOf({ locale: 'zh-Hans', bodyText: pinned })).toBeUndefined();
    expect(shapingLanguageOf({ locale: 'ca', bodyText: pinned })).toBeUndefined();
    expect(shapingLanguageOf(resolveConfig({ bodyText: pinned }))).toBeUndefined();
    expect(shapingLanguageOf(resolveConfig({ locale: 'tr', bodyText: pinned }))).toBeUndefined();
    expect(shapingLanguageOf({ locale: 'not a tag!', bodyText: pinned })).toBeUndefined();
  });

  it('every document declares it; one shaped in the host\'s only when Chinese, Japanese, Korean or right to left', () => {
    for (const bodyText of [undefined, OWN]) {
      expect(renderLangOf({ locale: 'ca', ...(bodyText ? { bodyText } : {}) })).toBe('ca');
      expect(renderLangOf({ locale: 'en-us', ...(bodyText ? { bodyText } : {}) })).toBe('en-US');
      expect(renderLangOf({ locale: 'zh-Hant-TW', ...(bodyText ? { bodyText } : {}) })).toBe('zh-Hant-TW');
      expect(renderLangOf({ locale: 'ar-EG', ...(bodyText ? { bodyText } : {}) })).toBe('ar-EG');
    }
    const pinned = { bodyText: { shapingLanguage: 'host' as const } };
    expect(renderLangOf({ locale: 'ca', ...pinned })).toBeUndefined();
    expect(renderLangOf({ locale: 'en-us', ...pinned })).toBeUndefined();
    expect(renderLangOf({ locale: 'zh-Hant-TW', ...pinned })).toBe('zh-Hant-TW');
    expect(renderLangOf({ locale: 'ar-EG', ...pinned })).toBe('ar-EG');
  });

  it('is resolved only when it is the host\'s', () => {
    expect('shapingLanguage' in resolveConfig({}).bodyText).toBe(false);
    expect('shapingLanguage' in resolveConfig({ bodyText: OWN }).bodyText).toBe(false);
    expect(resolveConfig({ bodyText: { shapingLanguage: 'host' } }).bodyText.shapingLanguage).toBe('host');
  });
});

describe('one layout on every host (#764)', () => {
  const hosts = ['en', 'zh', 'ja', 'ca', 'tr', ''];

  it('a Chinese document: the same lines on a page in any language and in a worker', () => {
    const seen = hosts.map((lang) => {
      host = lang;
      clearMeasurementCache();
      return JSON.stringify(layout(build(CHINESE, config('Song', 'zh-Hans'))));
    });
    expect(new Set(seen).size).toBe(1);
    // Both paragraphs, the plain one and the formatted one, in the Chinese
    // forms: `2016` is 18.84 px wide, not 22.
    host = 'en';
    clearMeasurementCache();
    const doc = build(CHINESE, config('Song', 'zh-Hans'));
    const year = segmentsOf(doc).filter((s) => s.text === '2016');
    expect(year.length).toBe(2);
    for (const seg of year) expect(seg.width).toBeCloseTo(18.84, 6);
    // And the plain paragraph breaks as the formatted one does.
    const [plain, rich] = paragraphs(doc);
    expect(plain!.lines.map((l) => l.text.trim())).toEqual(rich!.lines.map((l) => l.text.trim()));
    expect(pretextLanguageState()).toBe('followed');
  });

  it('nothing is measured in the host\'s language', () => {
    host = 'en';
    build(CHINESE, config('Song', 'zh-Hans'));
    expect([...measuredIn]).toEqual(['zh-Hans']);
    measuredIn.clear();
    clearMeasurementCache();
    build(CATALAN, config('Fira', 'ca'));
    expect([...measuredIn]).toEqual(['ca']);
    // A document with no locale is an English one.
    measuredIn.clear();
    clearMeasurementCache();
    build(CATALAN, config('Fira', undefined));
    expect([...measuredIn]).toEqual(['en-US']);
    // One that names its own language is measured as one that names none.
    measuredIn.clear();
    clearMeasurementCache();
    build(CATALAN, config('Fira', 'ca', { bodyText: OWN }));
    expect([...measuredIn]).toEqual(['ca']);
    // And one that asks for the host's is measured in the host's.
    measuredIn.clear();
    clearMeasurementCache();
    build(CATALAN, config('Fira', 'ca', { bodyText: { shapingLanguage: 'host' } }));
    expect([...measuredIn]).toEqual(['host:en']);
  });

  it('a Catalan and a Turkish document take the forms of their language on an English page', () => {
    host = 'en';
    const catalan = build(CATALAN, config('Fira', 'ca'));
    // `col·legi`: seven letters at 5 px and the dot at 1.
    for (const seg of segmentsOf(catalan).filter((s) => s.text === 'col\u00B7legi')) expect(seg.width).toBeCloseTo(36, 6);
    host = 'ca';
    clearMeasurementCache();
    expect(layout(build(CATALAN, config('Fira', 'ca')))).toEqual(layout(catalan));
    host = 'en';
    clearMeasurementCache();
    const turkish = build('Bu ofis fikir ve fiyat listesi.\n', config('Fira', 'tr'));
    expect(segmentsOf(turkish).find((s) => s.text === 'fikir')!.width).toBeCloseTo(23.6, 6);
  });

  it('with the host\'s language asked for, each host has its layout, as up to 1.28', () => {
    const pinned = config('Song', 'zh-Hans', { bodyText: { shapingLanguage: 'host' } });
    const on = (lang: string): string => {
      host = lang;
      clearMeasurementCache();
      measuredIn.clear();
      const out = JSON.stringify(layout(build(CHINESE, pinned)));
      expect([...measuredIn]).toEqual([`host:${lang}`]);
      return out;
    };
    const english = on('en');
    const chinese = on('zh');
    const worker = on('');
    expect(chinese).not.toBe(english);
    expect(worker).toBe(english);
    // The page in the document's language is what the rule now gives everywhere.
    host = 'en';
    clearMeasurementCache();
    expect(JSON.stringify(layout(build(CHINESE, config('Song', 'zh-Hans'))))).toBe(chinese);
  });

  it('a document shaped in the host\'s language after one shaped in its own gets its contexts back', () => {
    host = 'en';
    build(CHINESE, config('Song', 'zh-Hans'));
    clearMeasurementCache();
    measuredIn.clear();
    build(CHINESE, config('Song', 'zh-Hans', { bodyText: { shapingLanguage: 'host' } }));
    expect([...measuredIn]).toEqual(['host:en']);
    // The build leaves the language as it found it.
    expect(getMeasureLanguage()).toBeUndefined();
  });

  it('a face that draws one way under every language is laid out as before', () => {
    const lay = (cfg: PostextConfig): string => {
      clearMeasurementCache();
      return JSON.stringify(layout(build(CHINESE, cfg)));
    };
    expect(lay(config('Plain', 'zh-Hans'))).toBe(lay(config('Plain', 'zh-Hans', { bodyText: { shapingLanguage: 'host' } })));
  });
});

describe('the widths of each language (#764)', () => {
  it('are kept apart, and kept: going back to a language measures nothing again', () => {
    const SONG = '10px Song';
    expect(withMeasureLanguage('zh-Hans', () => measureTextWidth('2016', SONG))).toBeCloseTo(18.84, 6);
    expect(withMeasureLanguage('en', () => measureTextWidth('2016', SONG))).toBeCloseTo(22, 6);
    const before = measures;
    expect(withMeasureLanguage('zh-Hans', () => measureTextWidth('2016', SONG))).toBeCloseTo(18.84, 6);
    expect(withMeasureLanguage('en', () => measureTextWidth('2016', SONG))).toBeCloseTo(22, 6);
    expect(measures).toBe(before);
    // The host's language is another one still.
    host = 'zh';
    expect(measureTextWidth('2016', SONG)).toBeCloseTo(18.84, 6);
    expect(measures).toBe(before + 1);
  });

  it('a whole document laid out again in its language measures nothing, another language in between or not', () => {
    const chinese = config('Song', 'zh-Hans');
    const first = JSON.stringify(layout(build(CHINESE, chinese)));
    build(CATALAN, config('Fira', 'ca'));
    const before = measures;
    expect(JSON.stringify(layout(build(CHINESE, chinese)))).toBe(first);
    expect(measures).toBe(before);
  });

  it('a cache key says the language, and nothing for the host\'s', () => {
    expect(measureLanguageKey()).toBe('');
    expect(withMeasureLanguage('ca', () => measureLanguageKey())).toContain('ca');
    expect(withMeasureLanguage('', () => measureLanguageKey())).not.toBe('');
    setMeasureLanguage(undefined);
  });
});

describe('a run that names its language (#764)', () => {
  const MIXED = 'In **2016** it ran, :ltr[dated 2016]{lang=en} and so on.\n';

  it('is measured in it, in a document shaped in its own language', () => {
    const doc = build(MIXED, config('Song', 'zh-Hans'));
    const years = segmentsOf(doc).filter((s) => s.text === '2016');
    expect(years.map((s) => [s.lang, +s.width.toFixed(2)])).toEqual([[undefined, 18.84], ['en', 22]]);
    expect([...measuredIn].sort()).toEqual(['en', 'zh-Hans']);
  });

  it('and in the host\'s with the rest of a document shaped in the host\'s', () => {
    host = 'zh';
    const doc = build(MIXED, config('Song', 'zh-Hans', { bodyText: { shapingLanguage: 'host' } }));
    const years = segmentsOf(doc).filter((s) => s.text === '2016');
    expect(years.map((s) => +s.width.toFixed(2))).toEqual([18.84, 18.84]);
    expect([...measuredIn]).toEqual(['host:zh']);
  });
});

/** A canvas that records the language each text was painted in. */
function paintedLanguages(doc: VDTDocument): { text: string; lang: string }[] {
  const seen: { text: string; lang: string }[] = [];
  const state: Record<string, unknown> = { font: '10px Body', lang: 'inherit', direction: 'ltr', textAlign: 'left', textBaseline: 'alphabetic', letterSpacing: '0px', fillStyle: '' };
  const measure = new Context2D();
  const api: Record<string, unknown> = {
    measureText(s: string) {
      measure.font = state.font as string;
      measure.lang = state.lang as string;
      return measure.measureText(s);
    },
    fillText(text: string) {
      seen.push({ text, lang: state.lang as string });
    },
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
    has(target, key) { return typeof key === 'string' && (key in api || key in target); },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return seen;
}

describe('the outputs paint what was measured (#764)', () => {
  it('the canvas: every document in its language, a run in its own', () => {
    const catalan = paintedLanguages(build(CATALAN, config('Fira', 'ca')));
    expect(catalan.length).toBeGreaterThan(0);
    expect(new Set(catalan.map((p) => p.lang))).toEqual(new Set(['ca']));
    const mixed = paintedLanguages(build('In **2016** it ran, :ltr[dated 2016]{lang=en} and so on.\n', config('Song', 'zh-Hans')));
    const years = mixed.filter((p) => p.text === '2016').map((p) => p.lang);
    expect(years).toEqual(['zh-Hans', 'en']);
    // The context has the document's again after the run.
    expect(mixed[mixed.length - 1]!.lang).toBe('zh-Hans');
  });

  it('the canvas of a document shaped in the host\'s language is left in the host\'s, whatever the document\'s', () => {
    // It was measured in the host's language, so it is painted in it. Up
    // to postext 1.29.1 a Chinese, Japanese, Korean or right-to-left one
    // had its own set on the context, which a real context dropped at the
    // first `save()` of the page: its columns were painted in the host's.
    const pinned = { bodyText: { shapingLanguage: 'host' as const } };
    expect(new Set(paintedLanguages(build(CATALAN, config('Fira', 'ca', pinned))).map((p) => p.lang))).toEqual(new Set(['inherit']));
    const chinese = paintedLanguages(build('In **2016** it ran, :ltr[dated 2016]{lang=en} and so on.\n', config('Song', 'zh-Hans', pinned)));
    expect(new Set(chinese.map((p) => p.lang))).toEqual(new Set(['inherit']));
  });

  it('the HTML: the root and every page say the language', () => {
    const html = renderToHtml(build(CATALAN, config('Fira', 'ca')));
    expect(html).toMatch(/^<div class="pt-doc" lang="ca"/);
    expect(html).toMatch(/<div class="pt-page"[^>]* lang="ca"/);
    expect(renderToHtml(build(CATALAN, config('Fira', undefined)))).toMatch(/^<div class="pt-doc" lang="en-US"/);
    expect(renderToHtml(build(CATALAN, config('Fira', 'ca', { bodyText: OWN })))).toBe(html);
    const hosted = renderToHtml(build(CATALAN, config('Fira', 'ca', { bodyText: { shapingLanguage: 'host' } })));
    expect(hosted).toMatch(/^<div class="pt-doc" data-mode/);
    expect(hosted).not.toContain(' lang="');
  });
});
