import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../pipeline/build.js';
import { createMeasurementCache, clearMeasurementCache, parseFontString } from '../measure/index.js';
import { resolveAllConfig } from '../pipeline/config.js';
import { createHeadingLevelResolver } from '../pipeline/headingStyles.js';
import { renderToHtml } from '../html-backend.js';
import { collectConfigWarnings } from '../configWarnings.js';
import { configFeatureFamilies, configFontFamilies, collectFontUsage } from '../fonts/usage.js';
import { prepareFonts } from '../fonts/prepare.js';
import { declareFeatureFaces, rememberFaceSource } from '../fonts/featureFaces.js';
import {
  baseFontFamily,
  featureFamily,
  featureFamilyParts,
  featureFontCss,
  figureFeatures,
  fontFeatureSettings,
  fontVariantNumeric,
  setFigureStyleFamilies,
  withFigureStyle,
} from '../fonts/figureStyle.js';
import { stripBodyTextDefaults, stripCaptionStyleDefaults, stripHeadingsDefaults, stripParagraphStylesDefaults, stripTableStyleDefaults } from '../defaults/index.js';
import type { FontFaceLike, FontFaceSetLike } from '../fonts/faces.js';
import type { PostextConfig } from '../types.js';
import type { VDTDocument } from '../vdt.js';

// A canvas whose figures are narrower in a family set with `onum` (5 px)
// than in any other (7 px): the widths tell which face measured them.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const onum = (parseFontString(this.font)?.family ?? '').endsWith('@onum');
    let w = 0;
    for (const ch of s) w += /\d/.test(ch) && onum ? 5 : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

beforeEach(() => clearMeasurementCache());

const build = (md: string, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md }, { layout: { layoutType: 'single' }, headings: { balancing: { enabled: false } }, ...cfg }, createMeasurementCache());

describe('feature families (#1237)', () => {
  it('name a family with the features of a figure style', () => {
    expect(figureFeatures('oldstyle')).toEqual(['onum']);
    expect(figureFeatures('lining-tabular')).toEqual(['lnum', 'tnum']);
    expect(figureFeatures('oldstyle-proportional')).toEqual(['onum', 'pnum']);
    expect(figureFeatures('default')).toEqual([]);
    expect(figureFeatures('roman' as never)).toEqual([]);
    expect(withFigureStyle('Lora', 'oldstyle')).toBe('Lora@onum');
    expect(withFigureStyle('Lora', 'tabular')).toBe('Lora@tnum');
    expect(withFigureStyle('Lora', undefined)).toBe('Lora');
    // A style's own figures replace the ones its family carries.
    expect(withFigureStyle('Lora@onum', 'lining-tabular')).toBe('Lora@lnum+tnum');
    expect(withFigureStyle('Lora@onum', 'default')).toBe('Lora');
    expect(withFigureStyle('Lora@onum', undefined)).toBe('Lora@onum');
    // A stack sets its first family; a quoted name is unquoted; a generic
    // family names no face to set features in.
    expect(withFigureStyle("'EB Garamond', Georgia, serif", 'oldstyle')).toBe('EB Garamond@onum');
    expect(withFigureStyle('"Optima 105"', 'oldstyle')).toBe('Optima 105@onum');
    expect(withFigureStyle('serif', 'oldstyle')).toBe('serif');
    // A family the host cannot declare with features keeps its own figures.
    setFigureStyleFamilies((family) => family !== 'Palatino');
    try {
      expect(withFigureStyle('Palatino', 'oldstyle')).toBe('Palatino');
      expect(withFigureStyle('Lora', 'oldstyle')).toBe('Lora@onum');
    } finally {
      setFigureStyleFamilies(undefined);
    }
    expect(withFigureStyle('Palatino', 'oldstyle')).toBe('Palatino@onum');
    expect(featureFamilyParts('Lora@lnum+tnum')).toEqual({ family: 'Lora', features: ['lnum', 'tnum'] });
    expect(featureFamilyParts('"Lora@onum"')).toEqual({ family: 'Lora', features: ['onum'] });
    // A family whose name holds an @ that is not followed by features is
    // a family like any other.
    expect(featureFamilyParts('Studio@Home')).toEqual({ family: 'Studio@Home', features: [] });
    expect(baseFontFamily('Lora@onum')).toBe('Lora');
    expect(featureFamily('Lora@onum', ['tnum', 'lnum'])).toBe('Lora@lnum+tnum');
    expect(fontFeatureSettings(['lnum', 'tnum'])).toBe('"lnum" 1, "tnum" 1');
    expect(fontVariantNumeric(['onum', 'tnum'])).toBe('oldstyle-nums tabular-nums');
  });

  it('are what a style resolves to, and travel with the family a style takes', () => {
    const resolved = resolveAllConfig({
      bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' },
      paragraphStyles: [{ id: 'plain' }, { id: 'dates', figureStyle: 'lining-tabular' }, { id: 'sans', fontFamily: 'Inter' }],
      tableStyle: { figureStyle: 'lining-tabular' },
      tableStyles: [{ id: 'own', figureStyle: 'default' }, { id: 'inherits' }],
      captionStyle: {},
      headings: { fontFamily: 'Inter', figureStyle: 'lining', levels: [{ level: 2, figureStyle: 'oldstyle' }, { level: 3, fontFamily: 'Lora' }] },
      headingStyles: [{ id: 'quiet', figureStyle: 'oldstyle-proportional' }],
      header: { elements: [{ kind: 'text', id: 'folio', placement: { anchor: { to: 'container', edge: 'top' } }, content: '{page}', fontFamily: 'Lora', figureStyle: 'oldstyle', fontSize: { value: 8, unit: 'pt' } }] },
    });
    expect(resolved.bodyText.fontFamily).toBe('Lora@onum');
    expect(resolved.paragraphStyles.map((s) => s.fontFamily)).toEqual(['Lora@onum', 'Lora@lnum+tnum', 'Inter']);
    expect(resolved.tableStyle.bodyFontFamily).toBe('Lora@lnum+tnum');
    expect(resolved.tableStyle.headerFontFamily).toBe('Lora@lnum+tnum');
    // A named table style is laid over the document's.
    expect(resolved.tableStyles!.map((s) => s.bodyFontFamily)).toEqual(['Lora', 'Lora@lnum+tnum']);
    expect(resolved.captionStyle.fontFamily).toBe('Lora@onum');
    // Unordered lists take the body's family, with its figures.
    expect(resolved.unorderedLists.fontFamily).toBe('Lora@onum');
    expect(resolved.headings.levels.map((l) => l.fontFamily).slice(0, 3)).toEqual(['Inter@lnum', 'Inter@onum', 'Lora@lnum']);
    // A heading style's figures, over its level's family.
    const level = createHeadingLevelResolver(resolved).forLevel(3, 'quiet')!;
    expect(level.fontFamily).toBe('Lora@onum+pnum');
    expect(resolved.header.elements[0]!.kind === 'text' && resolved.header.elements[0]!.fontFamily).toBe('Lora@onum');
  });

  it('are kept when a configuration is stripped of its defaults, and an unknown value is reported', () => {
    expect(stripBodyTextDefaults({ figureStyle: 'oldstyle' })).toEqual({ figureStyle: 'oldstyle' });
    expect(stripParagraphStylesDefaults([{ id: 'p', figureStyle: 'tabular' }])).toEqual([{ id: 'p', figureStyle: 'tabular' }]);
    expect(stripTableStyleDefaults({ figureStyle: 'lining-tabular' })).toEqual({ figureStyle: 'lining-tabular' });
    expect(stripCaptionStyleDefaults({ figureStyle: 'lining' })).toEqual({ figureStyle: 'lining' });
    expect(stripHeadingsDefaults({ figureStyle: 'lining', levels: [{ level: 1, figureStyle: 'oldstyle' }] })).toEqual({
      figureStyle: 'lining',
      levels: [{ level: 1, figureStyle: 'oldstyle' }],
    });
    const warnings = collectConfigWarnings({ bodyText: { figureStyle: 'old-style' as never }, tableStyle: { figureStyle: 'tabular' } });
    expect(warnings).toEqual([{ kind: 'unknownConfigValue', path: 'bodyText.figureStyle', value: 'old-style', used: 'default' }]);
  });

  it('measure a style apart: its font strings carry the features, its figures their widths', () => {
    const md = 'In 1984 and 2024.\n\n:::paragraphs{style="dates"}\nIn 1984 and 2024.\n:::\n';
    const doc = build(md, { bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' }, paragraphStyles: [{ id: 'dates', figureStyle: 'lining-tabular' }] });
    const paras = doc.blocks.filter((b) => b.type === 'paragraph');
    expect(parseFontString(paras[0]!.fontString)!.family).toBe('Lora@onum');
    expect(parseFontString(paras[1]!.fontString)!.family).toBe('Lora@lnum+tnum');
    const width = (i: number) => paras[i]!.lines[0]!.segments!.reduce((sum, s) => sum + s.width, 0);
    // Eight figures, 2 px narrower each in the old-style face.
    expect(width(1) - width(0)).toBeCloseTo(16, 5);
  });

  it('set the base family with font-variant-numeric in HTML', () => {
    const doc = build('Page 12 of 340.', { bodyText: { fontFamily: 'EB Garamond', figureStyle: 'oldstyle-tabular' } });
    const html = renderToHtml(doc);
    expect(html).toContain("'EB Garamond';font-variant-numeric:oldstyle-nums tabular-nums");
    expect(html).not.toContain('@onum');
    expect(featureFontCss("font:400 16px 'Lora@onum';color:#000")).toBe("font:400 16px 'Lora';font-variant-numeric:oldstyle-nums;color:#000");
    expect(featureFontCss('font:400 16px &#39;Lora@lnum+tnum&#39;&quot;')).toBe('font:400 16px &#39;Lora&#39;;font-variant-numeric:lining-nums tabular-nums&quot;');
    expect(featureFontCss('mail me@onum.org')).toBe('mail me@onum.org');
    // Read in one pass: long runs of what a declaration could start with.
    for (const css of [`font:${'font:!'.repeat(50_000)}@`, `font:'${"'!".repeat(50_000)}@`, `font:${'&#39;'.repeat(50_000)}@`]) {
      const start = performance.now();
      expect(featureFontCss(css)).toBe(css);
      expect(performance.now() - start).toBeLessThan(500);
    }
  });

  it('are listed with the faces a host loads, in the weights and slants of their base family', () => {
    const cfg: PostextConfig = {
      bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' },
      tableStyle: { figureStyle: 'lining-tabular' },
      captionStyle: { fontFamily: 'Inter', figureStyle: 'lining' },
    };
    expect(configFeatureFamilies(cfg).sort()).toEqual(['Inter@lnum', 'Lora@lnum+tnum', 'Lora@onum']);
    expect(configFontFamilies(cfg)).toEqual(expect.arrayContaining(['Lora', 'Lora@onum', 'Lora@lnum+tnum', 'Inter@lnum']));
    const usage = collectFontUsage(cfg);
    expect(usage.get('Lora@onum')).toEqual(expect.arrayContaining([{ weight: 700, style: 'italic' }, { weight: 400, style: 'normal' }]));
    expect(configFeatureFamilies({ bodyText: { fontFamily: 'Lora' } })).toEqual([]);
  });
});

class FakeFace implements FontFaceLike {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  featureSettings?: string;
  status = 'unloaded';
  constructor(family: string, public source: unknown, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.weight = String(descriptors?.weight ?? '400');
    this.style = String(descriptors?.style ?? 'normal');
    this.unicodeRange = descriptors?.unicodeRange;
    this.featureSettings = descriptors?.featureSettings;
  }
  async load(): Promise<FontFaceLike> {
    this.status = 'loaded';
    return this;
  }
}

class FakeFontSet implements FontFaceSetLike {
  faces: FakeFace[] = [];
  [Symbol.iterator](): Iterator<FontFaceLike> {
    return this.faces[Symbol.iterator]();
  }
  add(face: FontFaceLike): this {
    this.faces.push(face as FakeFace);
    return this;
  }
  async load(font: string): Promise<FontFaceLike[]> {
    const want = parseFontString(font);
    const mine = this.faces.filter((f) => f.family.toLowerCase() === want?.family.toLowerCase());
    for (const f of mine) await f.load();
    return mine;
  }
}

describe('feature faces (#1237)', () => {
  it('are declared from the resolver\'s files of the base family, with the features', async () => {
    const fontSet = new FakeFontSet();
    const asked: string[] = [];
    const report = await prepareFonts('Page 12.', { bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle' } }, {
      fontSet,
      FontFace: FakeFace,
      watch: false,
      glyphProbe: false,
      resolve: (family, weight, style) => {
        asked.push(`${family} ${weight} ${style}`);
        return new Uint8Array([1, 2, 3]);
      },
    });
    // The headings' face (Open Sans) is asked too; Lora only by its name.
    expect(new Set(asked.filter((a) => a.startsWith('Lora')))).toEqual(new Set(['Lora 400 normal', 'Lora 700 normal', 'Lora 400 italic', 'Lora 700 italic']));
    const twins = fontSet.faces.filter((f) => f.family === 'Lora@onum');
    expect(twins.map((f) => `${f.weight} ${f.style} ${f.featureSettings}`).sort()).toEqual([
      '400 italic "onum" 1', '400 normal "onum" 1', '700 italic "onum" 1', '700 normal "onum" 1',
    ]);
    expect(report.missing).toEqual([]);
  });

  it('are declared from the files of the base family\'s faces the set holds, each once', () => {
    const fontSet = new FakeFontSet();
    const bytes = new Uint8Array([1, 2, 3]);
    const base = new FakeFace('Lora', bytes, { weight: '400', style: 'normal' });
    rememberFaceSource(base, bytes, { weight: '400', style: 'normal' });
    fontSet.add(base);
    expect(declareFeatureFaces(fontSet, 'Lora@lnum+tnum', FakeFace).map((f) => (f as FakeFace).featureSettings)).toEqual(['"lnum" 1, "tnum" 1']);
    expect(declareFeatureFaces(fontSet, 'Lora@lnum+tnum', FakeFace)).toEqual([]);
    expect(declareFeatureFaces(fontSet, 'Lora', FakeFace)).toEqual([]);
  });
});
