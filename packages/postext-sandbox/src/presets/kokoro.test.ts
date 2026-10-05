/* The こころ showcase bundle (apps/web/public/presets/kokoro) as the Sandbox
   opens it: one Japanese edition, vertical and right-bound, laid out as a
   whole book, whose chapters name only styles and resources the bundle has
   and keep the source's readings, headings and open-ended letter. */
import { describe, expect, it } from 'vitest';
import { parseMarkdown, type PostextConfig, type Resource } from 'postext';
import { pickBundleView, type BundleManifest } from 'postext/bundle';
import { computeWarnings } from '../warnings/compute';
import { hasLatinEmphasis, missingUsedVariants } from '../controls/fontLoader';
import { effectiveCanvasScope } from '../book/scope';
import { fontsToCustomFonts } from './manifest';
import type { PresetFontFamilySpec } from './types';

// Loaded through a dynamic import (the package has no Node typings).
const BUNDLE = '../../../../apps/web/public/presets/kokoro/';
const manifest = ((await import(/* @vite-ignore */ new URL(`${BUNDLE}preset.json`, import.meta.url).href)) as {
  default: {
    locale: string;
    locales: string[];
    openLocale: string;
    view?: { canvasScope?: 'book' | 'chapter' };
    config: PostextConfig;
    fonts: PresetFontFamilySpec[];
    resources: { id: string; typeId: string }[];
    chapters: Record<string, { file: string }[]>;
  };
}).default;

const chapters = (): Promise<{ file: string; md: string }[]> => Promise.all(manifest.chapters.ja!.map(async ({ file }) => ({
  file,
  md: ((await import(/* @vite-ignore */ `${new URL(`${BUNDLE}${file}`, import.meta.url).href}?raw`)) as { default: string }).default,
})));

// A part as build.py writes it: the painting on the verso, the part page,
// an instalment (中見出し) with readings, a scene plate before its passage.
const CHAPTER = [
  '# 萩の粥図 {style="frontis-naka"}',
  ':::pagebreak',
  ':::part{number="中" title="両親と私"}\n:::',
  '## 五 {indent="5" id="naka-5"}',
  '{私|わたくし}は東京の事を考えた。',
  '::resource{id="scene-naka-5"}',
  '「旗も黒いひらひらも、風のない空気のなかにだらりと下がった」',
].join('\n\n');

describe('kokoro in the Sandbox', () => {
  it('is a Japanese book that opens in Japanese, as a whole book', () => {
    expect(manifest.locale).toBe('ja');
    expect(manifest.locales).toEqual(['ja']);
    expect(manifest.openLocale).toBe('ja');
    const files = manifest.chapters.ja!.map(({ file }) => file);
    const view = pickBundleView(manifest as unknown as BundleManifest, 'ja');
    expect(effectiveCanvasScope(view?.canvasScope, files.length)).toBe('book');
  });

  it('sets the text vertically on the character grid, the instalments 3行取り and 5字下げ', () => {
    const { config } = manifest;
    expect(config.locale).toBe('ja');
    expect(config.layout?.writingMode).toBe('vertical-rl');
    expect(config.cjk?.grid).toMatchObject({ enabled: true, charsPerLine: 41, linesPerPage: 16 });
    const section = config.headings?.levels?.find((l) => l.level === 2);
    expect(section).toMatchObject({ lineSpan: 3, indent: { value: 5, unit: 'em' }, numberingTemplate: '' });
  });

  it('has nothing to say about a part, an instalment, its readings and a scene plate', () => {
    const warnings = computeWarnings({ markdown: CHAPTER, config: manifest.config, doc: null, resources: manifest.resources as unknown as Resource[] }).map((w) => JSON.stringify(w.payload));
    expect(warnings).toEqual([]);
  });

  it('names only heading styles, paragraph styles and resources the bundle has', async () => {
    const styles = new Set((manifest.config.headingStyles ?? []).map((s) => s.id));
    const paragraphStyles = new Set((manifest.config.paragraphStyles ?? []).map((s) => s.id));
    const resources = new Set(manifest.resources.map((r) => r.id));
    for (const { md } of await chapters()) {
      for (const [, id] of md.matchAll(/^#{1,6} .* \{.*style="([^"]+)"/gm)) expect(styles, id).toContain(id);
      for (const [, id] of md.matchAll(/:::paragraphs\{style="([^"]+)"/g)) expect(paragraphStyles, id).toContain(id);
      for (const [, id] of md.matchAll(/::resource\{id="([^"]+)"\}/g)) expect(resources, id).toContain(id);
    }
    // Every picture a design draws is a resource too.
    for (const style of manifest.config.headingStyles ?? []) {
      for (const el of style.advancedDesign?.slot?.elements ?? []) {
        if (el.kind === 'image' && !el.resourceId.includes('{')) expect(resources, el.resourceId).toContain(el.resourceId);
      }
    }
  });

  it('keeps the text as Aozora gives it: 110 instalments, 4,567 readings, eleven scenes and the letter’s open quotes', async () => {
    const all = await chapters();
    const novel = all.filter(({ file }) => /\/0[1-3]-/.test(file)).map(({ md }) => md).join('\n');
    expect([...novel.matchAll(/^## [一二三四五六七八九十]+ \{indent="5" id="(kami|naka|shimo)-\d+"\}$/gm)].length).toBe(110);
    expect([...novel.matchAll(/\{[^{}|\n]+\|[^{}\n]+\}/g)].length).toBe(4567);
    expect([...novel.matchAll(/::resource\{id="scene-[a-z]+-\d+"\}/g)].length).toBe(11);
    expect([...novel.matchAll(/^:::part\{number="(上|中|下)"/gm)].map((m) => m[1])).toEqual(['上', '中', '下']);
    // Part 下 is Sensei's letter: each paragraph opens 「 and only the
    // last closes, as printed; nothing balances them.
    const shimo = all.find(({ file }) => file.endsWith('03-shimo.md'))!.md;
    expect(shimo.split('「').length - shimo.split('」').length).toBe(55);
  });

  it('prints the colophon’s credits with the JIS wave dash', async () => {
    const credits = (await chapters()).find(({ file }) => file.endsWith('902-credits.md'))!.md;
    expect(credits).toContain('4月20日〜8月11日');
    expect(credits).not.toContain('～');
    expect(credits).toContain('Generated With Diffusion Models');
  });

  it('ships every variant the design asks of its faces (no italics: nothing is emphasised in Latin letters)', async () => {
    const latinEmphasis = (await chapters()).some(({ md }) => /[*_]/.test(md) && hasLatinEmphasis(parseMarkdown(md)));
    expect(latinEmphasis).toBe(false);
    const { families } = fontsToCustomFonts('kokoro', manifest.fonts);
    for (const name of ['Shippori Mincho B1', 'Shippori Antique B1']) {
      const family = families.find((f) => f.name === name)!;
      expect(missingUsedVariants(family, manifest.config, { latinEmphasis }), name).toEqual([]);
    }
  });
});
