import { describe, expect, it } from 'vitest';
import { canonicalLocaleTag, matchContentLocale, sameContentLocale } from '../locale';
import { pickChapterSpecs, pickLocaleOverrides, readBundle, resolveBundleConfigLocale, resolveBundleLocale } from '../bundle';
import type { BundleManifestV2 } from '../bundle';

// #198: a book in Traditional and Simplified Chinese (plus an English
// translation) opened for a reader whose tag names a region, a script or
// neither. The language subtag alone cannot tell the two editions apart.
describe('canonicalLocaleTag', () => {
  it('canonicalises case and separators, rejects malformed tags', () => {
    expect(canonicalLocaleTag('zh-hant')).toBe('zh-Hant');
    expect(canonicalLocaleTag('ZH-tw')).toBe('zh-TW');
    expect(canonicalLocaleTag('pt_br')).toBe('pt-BR');
    expect(canonicalLocaleTag(' es ')).toBe('es');
    expect(canonicalLocaleTag('zh-hant-hk')).toBe('zh-Hant-HK');
    expect(canonicalLocaleTag('e s')).toBeNull();
    expect(canonicalLocaleTag('')).toBeNull();
    expect(canonicalLocaleTag(undefined)).toBeNull();
  });
});

describe('sameContentLocale', () => {
  it('compares the script of Chinese tags, the language of the others', () => {
    expect(sameContentLocale('zh-Hans', 'zh-Hant')).toBe(false);
    expect(sameContentLocale('zh-TW', 'zh-Hant')).toBe(true);
    expect(sameContentLocale('zh-HK', 'zh-Hant')).toBe(true);
    expect(sameContentLocale('zh', 'zh-Hans')).toBe(true);
    expect(sameContentLocale('zh-CN', 'zh-hans')).toBe(true);
    expect(sameContentLocale('zh-TW', 'zh-Hans')).toBe(false);
    expect(sameContentLocale('es-ES', 'es')).toBe(true);
    expect(sameContentLocale('pt-BR', 'pt-PT')).toBe(true);
    expect(sameContentLocale('en', 'es')).toBe(false);
    expect(sameContentLocale('sr-Latn', 'sr')).toBe(false);
  });
});

describe('matchContentLocale', () => {
  const chinese = ['zh-Hans', 'zh-Hant', 'en'];
  it('prefers the exact tag, then language + script, never the other script', () => {
    expect(matchContentLocale(chinese, 'zh-hant')).toBe('zh-Hant');
    expect(matchContentLocale(chinese, 'zh-TW')).toBe('zh-Hant');
    expect(matchContentLocale(chinese, 'zh-HK')).toBe('zh-Hant');
    expect(matchContentLocale(chinese, 'zh-Hant-TW')).toBe('zh-Hant');
    expect(matchContentLocale(chinese, 'zh')).toBe('zh-Hans');
    expect(matchContentLocale(chinese, 'zh-SG')).toBe('zh-Hans');
    expect(matchContentLocale(['zh-Hans', 'en'], 'zh-Hant')).toBeUndefined();
    expect(matchContentLocale(chinese, 'es')).toBeUndefined();
    expect(matchContentLocale(chinese, 'EN-us')).toBe('en');
  });

  it('keeps the old preferences of the other languages', () => {
    // The bare base language before a regional sibling.
    expect(matchContentLocale(['pt-BR', 'pt'], 'pt-AO')).toBe('pt');
    expect(matchContentLocale(['es-MX', 'es'], 'es-AR')).toBe('es');
    // The same region once maximised wins.
    expect(matchContentLocale(['pt', 'pt-PT'], 'pt-PT')).toBe('pt-PT');
    expect(matchContentLocale(['pt-PT', 'pt'], 'pt-BR')).toBe('pt');
    // A regional sibling rather than nothing.
    expect(matchContentLocale(['en-GB', 'es'], 'en-US')).toBe('en-GB');
    // Ties keep the candidates' order.
    expect(matchContentLocale(['es-MX', 'es-AR'], 'es-CL')).toBe('es-MX');
  });
});

const chapterMap = (...locales: string[]) => Object.fromEntries(locales.map((l) => [l, [{ title: l, file: `chapters/${l}/01.md` }]]));
const hlm: BundleManifestV2 = {
  version: 2,
  id: 'hlm',
  name: 'Hong lou meng',
  locale: 'zh-Hant',
  locales: ['zh-Hant', 'zh-Hans', 'en'],
  openLocale: 'zh-Hant',
  chapters: chapterMap('zh-Hans', 'zh-Hant', 'en'),
  localized: {
    'zh-Hans': { config: { locale: 'zh-Hans' } },
    en: { config: { locale: 'en' } },
  },
};

describe('bundle locale resolution in a Chinese book (#198)', () => {
  it('serves the edition in the script the tag names', () => {
    const served = (l: string) => resolveBundleLocale(hlm, l);
    expect(served('zh-Hant')).toBe('zh-Hant');
    expect(served('zh-hant')).toBe('zh-Hant');
    expect(served('zh-TW')).toBe('zh-Hant');
    expect(served('zh-HK')).toBe('zh-Hant');
    expect(served('zh')).toBe('zh-Hans');
    expect(served('zh-CN')).toBe('zh-Hans');
    expect(served('en-GB')).toBe('en');
    // A language the book lacks: its own locale.
    expect(served('es')).toBe('zh-Hant');
    expect(pickChapterSpecs(hlm, 'zh-TW')[0]!.file).toBe('chapters/zh-Hant/01.md');
    expect(resolveBundleConfigLocale(hlm, 'zh-SG')).toBe('zh-Hans');
  });

  it('rewords each edition with its own overrides', () => {
    expect(pickLocaleOverrides(hlm, 'zh-TW')).toBeNull();
    expect(pickLocaleOverrides(hlm, 'zh-CN')).toBe(hlm.localized!['zh-Hans']);
    expect(pickLocaleOverrides(hlm, 'en-US')).toBe(hlm.localized!.en);
    // Shared chapters: a Traditional reader never gets the Simplified wording.
    const shared: BundleManifestV2 = { ...hlm, chapters: [{ title: '', file: 'a.md' }], localized: { 'zh-Hans': { config: {} } } };
    expect(pickLocaleOverrides(shared, 'zh-TW')).toBeNull();
    expect(pickLocaleOverrides(shared, 'zh')).toBe(shared.localized!['zh-Hans']);
  });
});

describe('readBundle over a long book (#199)', () => {
  const COUNT = 120;
  const DELAY = 50;
  const han = '此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去';
  const specs = Array.from({ length: COUNT }, (_, i) => ({ title: `第${i + 1}回`, file: `chapters/zh-Hant/${String(i + 1).padStart(3, '0')}.md` }));
  const manifest: BundleManifestV2 = {
    version: 2, id: 'long', name: 'Long', locale: 'zh-Hant',
    chapters: { 'zh-Hant': specs, 'zh-Hans': specs.map((s) => ({ ...s, file: s.file.replace('zh-Hant', 'zh-Hans') })) },
  };

  it('reads the chosen locale\'s chapters concurrently, in manifest order', async () => {
    const read: string[] = [];
    let inFlight = 0;
    let peak = 0;
    const readFile = async (path: string): Promise<ArrayBuffer> => {
      read.push(path);
      inFlight++;
      peak = Math.max(peak, inFlight);
      // Later chapters answer sooner: order must come from the manifest.
      const n = Number(/(\d+)\.md$/.exec(path)?.[1] ?? 0);
      await new Promise((r) => setTimeout(r, DELAY - (n % 7) * 5));
      inFlight--;
      return new TextEncoder().encode(`# 第${n}回\n\n${han}`).buffer as ArrayBuffer;
    };
    const t0 = Date.now();
    const result = await readBundle(manifest, readFile, { locale: 'zh-TW' });
    const elapsed = Date.now() - t0;
    expect(result.locale).toBe('zh-Hant');
    expect(result.chapters.map((c) => c.file)).toEqual(specs.map((s) => s.file));
    expect(result.chapters[26]!.markdown.startsWith('# 第27回')).toBe(true);
    expect(read.every((p) => p.includes('zh-Hant'))).toBe(true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
    expect(elapsed).toBeLessThan((COUNT * DELAY) / 4);
  });

  it('rejects when a chapter file is missing', async () => {
    const readFile = async (path: string): Promise<ArrayBuffer> => {
      if (path.endsWith('060.md')) throw new Error(`missing ${path}`);
      return new TextEncoder().encode('# x').buffer as ArrayBuffer;
    };
    await expect(readBundle(manifest, readFile, { locale: 'zh-Hant' })).rejects.toThrow(/060\.md/);
  });
});
