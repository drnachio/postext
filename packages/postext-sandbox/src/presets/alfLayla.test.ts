/* The ألف ليلة وليلة showcase bundle (apps/web/public/presets/alf-layla) as
   the Sandbox opens it: one Arabic edition, a chapter at a time, whose
   chapters name only styles and resources the bundle has. */
import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { pickBundleView, type BundleManifest } from 'postext/bundle';
import { computeWarnings } from '../warnings/compute';
import { missingUsedVariants } from '../controls/fontLoader';
import { effectiveCanvasScope } from '../book/scope';
import { fontsToCustomFonts } from './manifest';
import type { PresetFontFamilySpec } from './types';

// Loaded through a dynamic import (the package has no Node typings).
const BUNDLE = '../../../../apps/web/public/presets/alf-layla/';
const manifest = ((await import(/* @vite-ignore */ new URL(`${BUNDLE}preset.json`, import.meta.url).href)) as {
  default: {
    locale: string;
    locales: string[];
    view?: { canvasScope?: 'book' | 'chapter' };
    config: PostextConfig;
    fonts: PresetFontFamilySpec[];
    resources: { id: string }[];
    chapters: Record<string, { file: string }[]>;
  };
}).default;

const chapters = (): Promise<string[]> => Promise.all(manifest.chapters.ar!.map(async ({ file }) =>
  ((await import(/* @vite-ignore */ `${new URL(`${BUNDLE}${file}`, import.meta.url).href}?raw`)) as { default: string }).default));

// A tale chapter as markup.py writes it: the opener, a tale inside it in red,
// a night in words (the Hindawi wording kept in an attribute) and a plate.
const CHAPTER = [
  '# حكاية الصياد مع العفريت {tale="fisherman-jinni"}',
  'قالت: بلغني أيها الملك السعيد أنه كان رجل صياد.',
  '## حكاية الملك يونان والحكيم رويان {tale="yunan-ruyan"}',
  '### الليلة الرابعة {style="night" n=4 hindawi="فلما كانت الليلة ٤"}',
  '::resource{id="harvey-03"}',
  'قالت: بلغني أيها الملك السعيد أن الملك يونان قال لوزيره.',
].join('\n\n');

describe('alf-layla in the Sandbox', () => {
  it('is an Arabic book that opens a chapter at a time', () => {
    expect(manifest.locale).toBe('ar');
    expect(manifest.locales).toEqual(['ar']);
    const files = manifest.chapters.ar!.map(({ file }) => file);
    const view = pickBundleView(manifest as unknown as BundleManifest, 'ar');
    expect(effectiveCanvasScope(view?.canvasScope, files.length)).toBe('chapter');
  });

  it('has nothing to say about a tale chapter, its night headings and its plates', () => {
    const warnings = computeWarnings({ markdown: CHAPTER, config: manifest.config, doc: null, resources: manifest.resources as unknown as Resource[] }).map((w) => JSON.stringify(w.payload));
    expect(warnings).toEqual([]);
  });

  it('names only heading styles and resources the bundle has', async () => {
    const styles = new Set((manifest.config.headingStyles ?? []).map((s) => s.id));
    const paragraphStyles = new Set((manifest.config.paragraphStyles ?? []).map((s) => s.id));
    const resources = new Set(manifest.resources.map((r) => r.id));
    let nights = 0;
    for (const md of await chapters()) {
      for (const [, id] of md.matchAll(/^#{1,6} .* \{.*style="([^"]+)"/gm)) expect(styles, id).toContain(id);
      for (const [, id] of md.matchAll(/:::paragraphs\{style="([^"]+)"/g)) expect(paragraphStyles, id).toContain(id);
      for (const [, id] of md.matchAll(/::resource\{id="([^"]+)"\}/g)) expect(resources, id).toContain(id);
      nights += [...md.matchAll(/^#{2,6} الليلة .* \{style="night" n=\d+/gm)].length;
    }
    // Every night of the book, the first to the thousand and first.
    expect(nights).toBe(1001);
  });

  it('ships every variant the design asks of its faces (no italics: emphasis is bold)', () => {
    const { families } = fontsToCustomFonts('alf-layla', manifest.fonts);
    for (const name of ['Amiri', 'Aref Ruqaa']) {
      const family = families.find((f) => f.name === name)!;
      expect(missingUsedVariants(family, manifest.config), name).toEqual([]);
    }
  });
});
