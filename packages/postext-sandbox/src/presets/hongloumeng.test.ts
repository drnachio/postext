/* The 紅樓夢 showcase bundle (apps/web/public/presets/hongloumeng) as the
   Sandbox opens it: the Checks panel has nothing to say about its design. */
import { describe, expect, it } from 'vitest';
import { parseMarkdown, type PostextConfig } from 'postext';
import { computeWarnings } from '../warnings/compute';
import { hasLatinEmphasis, missingUsedVariants } from '../controls/fontLoader';
import { fontsToCustomFonts } from './manifest';
import type { PresetFontFamilySpec } from './types';

// Loaded through a dynamic import (the package has no Node typings).
const BUNDLE = '../../../../apps/web/public/presets/hongloumeng/';
const manifest = ((await import(/* @vite-ignore */ new URL(`${BUNDLE}preset.json`, import.meta.url).href)) as {
  default: { config: PostextConfig; localized: Record<string, { config?: PostextConfig }>; fonts: PresetFontFamilySpec[]; chapters: Record<string, { file: string }[]> };
}).default;

/** The text of every chapter file of an edition. */
const chaptersOf = (lang: string): Promise<string[]> => Promise.all(manifest.chapters[lang]!.map(async ({ file }) =>
  ((await import(/* @vite-ignore */ `${new URL(`${BUNDLE}${file}`, import.meta.url).href}?raw`)) as { default: string }).default));

/** An edition's config: its top-level keys replace the base ones. */
const configOf = (lang: string): PostextConfig => ({ ...manifest.config, ...(manifest.localized[lang]?.config ?? {}) });

const CHAPTER_ONE: Record<string, string> = {
  // The vertical edition: the plate on its own page before the opener.
  'zh-Hant': '# 甄士隱夢幻識通靈 {style="plate" plate="plate-001"}\n\n:::pagebreak\n\n:::numbering{format="cjk-decimal" startAt=1}\n\n# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n\n此開卷第一回也。\n\n## 【紅樓夢引子】 {style="song"}\n\n:::paragraphs{style="verse"}\n開闢鴻濛，誰為情種？\n:::\n\n## 憶菊　蘅蕪君 {style="poem" title="憶菊" by="蘅蕪君"}\n\n:::paragraphs{style="verse"}\n悵望西風抱悶思，蓼紅葦白斷腸時。\n:::\n',
  'zh-Hans': '# 甄士隐梦幻识通灵 \\\\ 贾雨村风尘怀闺秀 {plate="plate-001"}\n\n此开卷第一回也。\n\n## 【红楼梦引子】 {style="song"}\n\n:::paragraphs{style="verse"}\n开辟鸿蒙，谁为情种？\n:::\n\n## 忆菊　蘅芜君 {style="poem" title="忆菊" by="蘅芜君"}\n\n:::paragraphs{style="verse"}\n怅望西风抱闷思，蓼红苇白断肠时。\n:::\n',
  en: '# Chen Shih-yin, in a vision \\\\ Chia Yü-ts’un {plate="plate-001" zh="甄士隱夢幻識通靈　賈雨村風塵懷閨秀"}\n\nThis is the opening section.',
};

describe('hongloumeng in the Sandbox', () => {
  it('has nothing to say about a chapter, its styles and its design', () => {
    // A chapter without front matter, before the book's metadata is known:
    // no slot of the design may ask for {title} or {author} (the Chinese
    // editions have no part pages, and their part slot is empty), and the
    // styles a chapter names exist (the verse, the poem heads of ch. 38).
    for (const lang of ['zh-Hant', 'zh-Hans', 'en']) {
      const warnings = computeWarnings({ markdown: CHAPTER_ONE[lang]!, config: configOf(lang), doc: null }).map((w) => JSON.stringify(w.payload));
      expect(warnings, lang).toEqual([]);
    }
  });

  it('ships every variant the Chinese designs ask of their faces', async () => {
    // The body family is asked for no italics where `*…*` sets dots and
    // holds no Latin: the Chinese editions emphasise none.
    const { families } = fontsToCustomFonts('hongloumeng', manifest.fonts);
    for (const [lang, names] of [['zh-Hant', ['Noto Serif TC', 'LXGW WenKai TC', 'Noto Sans TC']], ['zh-Hans', ['Noto Serif SC', 'LXGW WenKai', 'Noto Sans SC']]] as const) {
      const chapters = await chaptersOf(lang);
      expect(chapters.length).toBeGreaterThan(120);
      // Emphasis needs a `*` or a `_`: only the files holding one are parsed.
      const latinEmphasis = chapters.some((md) => /[*_]/.test(md) && hasLatinEmphasis(parseMarkdown(md)));
      expect(latinEmphasis, lang).toBe(false);
      for (const name of names) {
        const family = families.find((f) => f.name === name)!;
        expect(missingUsedVariants(family, configOf(lang), { latinEmphasis }), `${lang} ${name}`).toEqual([]);
      }
    }
  }, 60_000);

  it('ships every variant the English design asks of EB Garamond', () => {
    const { families } = fontsToCustomFonts('hongloumeng', manifest.fonts);
    const garamond = families.find((f) => f.name === 'EB Garamond')!;
    expect(missingUsedVariants(garamond, configOf('en'))).toEqual([]);
  });
});
