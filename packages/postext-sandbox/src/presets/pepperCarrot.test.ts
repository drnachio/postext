/* The Pepper&Carrot showcase bundle (apps/web/public/presets/pepper-carrot)
   as the Sandbox opens it: episode 8 in seven editions, each a title page,
   six comic pages and the credits, whose scripts name only pictures, panel
   styles and balloon styles the bundle has, and whose faces carry every
   variant the editions ask of them. */
import { describe, expect, it } from 'vitest';
import { parseComicFence, parseMarkdown, type PostextConfig, type Resource } from 'postext';
import { pickBundleView, type BundleManifest } from 'postext/bundle';
import { computeWarnings } from '../warnings/compute';
import { hasLatinEmphasis, missingUsedVariants } from '../controls/fontLoader';
import { fontsToCustomFonts } from './manifest';
import type { PresetFontFamilySpec } from './types';

// Loaded through a dynamic import (the package has no Node typings).
const BUNDLE = '../../../../apps/web/public/presets/pepper-carrot/';
const manifest = ((await import(/* @vite-ignore */ new URL(`${BUNDLE}preset.json`, import.meta.url).href)) as {
  default: {
    locale: string;
    locales: string[];
    openLocale?: string;
    config: PostextConfig;
    localized: Record<string, { config?: Partial<PostextConfig>; resources?: { id: string; altText?: string }[] }>;
    fonts: PresetFontFamilySpec[];
    resources: (Resource & { file: string; width: number; height: number })[];
    chapters: Record<string, { title: string; file: string }[]>;
  };
}).default;

const EDITIONS = ['en', 'es', 'ca', 'fr', 'ja', 'zh-Hans', 'ar'];

const configOf = (locale: string): PostextConfig => ({ ...manifest.config, ...(manifest.localized[locale]?.config ?? {}) });

const chapters = (locale: string): Promise<{ file: string; md: string }[]> => Promise.all(manifest.chapters[locale]!.map(async ({ file }) => ({
  file,
  md: ((await import(/* @vite-ignore */ `${new URL(`${BUNDLE}${file}`, import.meta.url).href}?raw`)) as { default: string }).default,
})));

describe('pepper-carrot in the Sandbox', () => {
  it('carries seven editions, opens in the reader’s language and shows the whole book', () => {
    expect(manifest.locale).toBe('en');
    expect(manifest.locales).toEqual(EDITIONS);
    expect(manifest.openLocale).toBeUndefined();
    expect(Object.keys(manifest.chapters)).toEqual(EDITIONS);
    for (const locale of EDITIONS) {
      expect(manifest.chapters[locale]!.map((c) => c.file.replace(/^chapters\/[^/]+\//, ''))).toEqual(['00-title.md', '01-episode-8.md', '02-credits.md']);
      expect(configOf(locale).locale).toBe(locale);
      expect(pickBundleView(manifest as unknown as BundleManifest, locale)?.canvasScope).toBe('book');
    }
  });

  it('letters Japanese in columns and reads Arabic right to left, on the art’s own frame', () => {
    const comics = manifest.config.comics!;
    expect(comics.readingDirection).toBe('auto');
    expect(comics.lettering?.fontSize).toEqual({ value: 9, unit: 'pt' });
    expect(comics.frame?.margins?.top).toEqual({ value: 8.47, unit: 'mm' });
    expect(comics.panelStyles?.map((s) => s.id)).toEqual(['rounded']);
    expect(comics.balloonStyles?.find((s) => s.id === 'writing')).toMatchObject({ shape: 'none', halo: { value: 1.4, unit: 'pt' } });
    expect(comics.cast?.find((c) => c.id === 'monster')?.fill?.hex).toBe('#0f0f0f');
    expect(configOf('ja').comics?.lettering?.writingMode ?? 'auto').toBe('auto');
  });

  it('names only pictures and styles the bundle has, six pages of panels per edition', async () => {
    const ids = new Set(manifest.resources.map((r) => r.id));
    const panelStyles = new Set((manifest.config.comics?.panelStyles ?? []).map((s) => s.id));
    for (const locale of EDITIONS) {
      const styles = new Set((configOf(locale).headingStyles ?? []).map((s) => s.id));
      const all = await chapters(locale);
      const comic = all.find(({ file }) => file.endsWith('01-episode-8.md'))!.md;
      expect([...comic.matchAll(/^:::page\{/gm)].length, locale).toBe(6);
      const arts = [...comic.matchAll(/::panel\{art=([\w-]+)/g)].map((m) => m[1]!);
      expect(arts.length, locale).toBe(21);
      for (const id of arts) expect(ids, id).toContain(id);
      for (const [, id] of comic.matchAll(/style=([\w-]+)/g)) expect(panelStyles, id).toContain(id);
      for (const { md } of all) for (const [, id] of md.matchAll(/^# .* \{style="([^"]+)"/gm)) expect(styles, id).toContain(id);
    }
  });

  it('gives every panel a safe area, and the crowded ones faces no balloon covers', () => {
    const panels = manifest.resources.filter((r) => /^e08p\d\d-\d$/.test(r.id));
    expect(panels).toHaveLength(21);
    for (const p of panels) expect(p.safeArea, p.id).toBeDefined();
    const faces = panels.flatMap((p) => (p.anchors ?? []).filter((a) => a.face).map(() => p.id));
    expect(faces).toEqual(expect.arrayContaining(['e08p03-2', 'e08p04-1', 'e08p06-1']));
  });

  it('describes every panel and the cover in the edition’s language', async () => {
    const english = new Map(manifest.resources.map((r) => [r.id, r.altText]));
    for (const locale of EDITIONS) {
      const comic = (await chapters(locale)).find(({ file }) => file.endsWith('01-episode-8.md'))!.md;
      const panels = [...comic.matchAll(/^:::page\{/gm)].flatMap((m) => parseComicFence(comic, m.index)!.source.panels);
      expect(panels, locale).toHaveLength(21);
      for (const { attrs } of panels) {
        const alt = attrs.alt ?? '';
        expect(alt.length, `${locale} ${attrs.art}`).toBeGreaterThan(8);
        // The English edition repeats the pictures' own alt text; the others translate it.
        if (locale === 'en') expect(alt).toBe(english.get(attrs.art!));
        else expect(alt, `${locale} ${attrs.art}`).not.toBe(english.get(attrs.art!));
      }
      const cover = manifest.localized[locale]?.resources?.find((r) => r.id === 'e08-cover')?.altText;
      if (locale === 'en') expect(cover).toBeUndefined();
      else expect(cover && cover !== english.get('e08-cover'), locale).toBe(true);
    }
  });

  it('has nothing to say about any edition', async () => {
    // The pictures as the bundle loader declares them: a bitmap per file.
    const resources = manifest.resources.map(({ file, width, height, ...r }) => ({
      ...r,
      bitmap: { fileId: file, format: 'jpeg', width, height },
    })) as unknown as Resource[];
    for (const locale of EDITIONS) {
      // The title page leads with the book's front matter (title, author).
      const markdown = (await chapters(locale)).map(({ md }) => md).join('\n\n');
      const warnings = computeWarnings({ markdown, config: configOf(locale), doc: null, resources }).map((w) => JSON.stringify(w.payload));
      expect(warnings, locale).toEqual([]);
    }
  });

  it('ships every variant each edition asks of its faces', async () => {
    const { families } = fontsToCustomFonts('pepper-carrot', manifest.fonts);
    for (const locale of EDITIONS) {
      const config = configOf(locale);
      const latinEmphasis = (await chapters(locale)).some(({ md }) => /[*_]/.test(md) && hasLatinEmphasis(parseMarkdown(md)));
      for (const family of families) expect(missingUsedVariants(family, config, { latinEmphasis }), `${locale} ${family.name}`).toEqual([]);
    }
  });
});
