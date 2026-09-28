/* The 紅樓夢 showcase bundle (apps/web/public/presets/hongloumeng) as the
   Sandbox opens it: the Checks panel has nothing to say about its design. */
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { computeWarnings } from '../warnings/compute';
import { missingUsedVariants } from '../controls/fontLoader';
import { fontsToCustomFonts } from './manifest';
import type { PresetFontFamilySpec } from './types';

// Loaded through a dynamic import (the package has no Node typings).
const manifest = ((await import(/* @vite-ignore */ new URL('../../../../apps/web/public/presets/hongloumeng/preset.json', import.meta.url).href)) as {
  default: { config: PostextConfig; localized: Record<string, { config?: PostextConfig }>; fonts: PresetFontFamilySpec[] };
}).default;

/** An edition's config: its top-level keys replace the base ones. */
const configOf = (lang: string): PostextConfig => ({ ...manifest.config, ...(manifest.localized[lang]?.config ?? {}) });

const CHAPTER_ONE: Record<string, string> = {
  'zh-Hant': '# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀 {plate="plate-001"}\n\n此開卷第一回也。\n\n## 憶菊　蘅蕪君 {style="poem" title="憶菊" by="蘅蕪君"}\n\n:::paragraphs{style="verse"}\n悵望西風抱悶思，蓼紅葦白斷腸時。\n:::\n',
  'zh-Hans': '# 甄士隐梦幻识通灵 \\\\ 贾雨村风尘怀闺秀 {plate="plate-001"}\n\n此开卷第一回也。\n\n## 忆菊　蘅芜君 {style="poem" title="忆菊" by="蘅芜君"}\n\n:::paragraphs{style="verse"}\n怅望西风抱闷思，蓼红苇白断肠时。\n:::\n',
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

  it('ships every variant the English design asks of EB Garamond', () => {
    const { families } = fontsToCustomFonts('hongloumeng', manifest.fonts);
    const garamond = families.find((f) => f.name === 'EB Garamond')!;
    expect(missingUsedVariants(garamond, configOf('en'))).toEqual([]);
  });
});
