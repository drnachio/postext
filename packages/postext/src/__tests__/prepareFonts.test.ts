import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../pipeline/build';
import { createMeasurementCache, clearMeasurementCache, evictFontFamilies, measurementGeneration, parseFontString } from '../measure';
import { evictionsSince, measureTextWidth } from '../measure/canvas';
import { prepareFonts, configFontFaces, fontSampleText, withLoadedFonts } from '../fonts/prepare';
import { buildDocumentWithFonts } from '../fonts/buildWithFonts';
import { documentFontFaces, fontFallbacks, matchFace, type FontFaceLike, type FontFaceSetLike } from '../fonts/faces';
import { onFontsChanged, syncFontSet, watchFonts } from '../fonts/fontSet';
import { invalidateConfig, resolveAllConfig, validateConfigCache } from '../pipeline/config';
import { flowColorValues } from '../pipeline/partPalette';
import { clearRegisteredFonts, registeredFontFiles } from '../svg/fontRegistry';
import { stableStringify, hashString } from '../util/stableHash';
import type { ContentWarning } from '../vdt';
import type { DesignTextElement, PostextConfig } from '../types';

// A fake font set: a face is "there" once a loaded FontFace of its family
// answers for its weight and slant. The stub canvas measures 10 px a
// character in a loaded face, 9 in a face the browser would synthesize
// (bold or italic made from another face) and 7 in the fallback.

class FakeFace implements FontFaceLike {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  status: string = 'unloaded';
  source: unknown;
  constructor(family: string, source: unknown, descriptors?: FontFaceDescriptors) {
    this.family = family;
    this.source = source;
    this.weight = String(descriptors?.weight ?? '400');
    this.style = String(descriptors?.style ?? 'normal');
    this.unicodeRange = descriptors?.unicodeRange;
  }
  async load(): Promise<FontFaceLike> {
    this.status = 'loaded';
    return this;
  }
}

type Listener = (event: { fontfaces?: readonly FontFaceLike[] }) => void;

class FakeFontSet implements FontFaceSetLike {
  faces: FakeFace[] = [];
  listeners = new Set<Listener>();
  loads: string[] = [];
  get size(): number {
    return this.faces.length;
  }
  [Symbol.iterator](): Iterator<FontFaceLike> {
    return this.faces[Symbol.iterator]();
  }
  add(face: FontFaceLike): this {
    this.faces.push(face as FakeFace);
    return this;
  }
  async load(font: string): Promise<FontFaceLike[]> {
    this.loads.push(font);
    const want = parseFontString(font);
    if (!want) return [];
    const mine = this.faces.filter((f) => f.family.toLowerCase() === want.family.toLowerCase());
    for (const f of mine) await f.load();
    if (mine.length > 0) this.fire(mine);
    return mine;
  }
  addEventListener(_type: 'loadingdone', listener: Listener): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'loadingdone', listener: Listener): void {
    this.listeners.delete(listener);
  }
  fire(faces: readonly FontFaceLike[]): void {
    for (const l of this.listeners) l({ fontfaces: faces });
  }
}

let fonts = new FakeFontSet();

function charWidth(font: string): number {
  const f = parseFontString(font);
  if (!f) return 7;
  const loaded = [...fonts].filter((x) => x.status === 'loaded' && x.family.toLowerCase() === f.family.toLowerCase())
    .map((x) => ({ weight: [Number(x.weight), Number(x.weight)] as [number, number], style: (x.style === 'italic' ? 'italic' : 'normal') as 'normal' | 'italic', status: 'loaded' }));
  const match = matchFace(loaded, f.weight, f.style);
  return !match ? 7 : match.synthesized ? 9 : 10;
}

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * charWidth(this.font) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A face file for `family` (the resolver's answer): bytes standing in. */
const file = () => new Uint8Array([0, 1, 0, 0, 1, 2, 3]);

const designText = (content: string, fontFamily: string): DesignTextElement => ({
  kind: 'text',
  id: content,
  placement: { anchor: { to: 'container', edge: 'top' } },
  content,
  fontSize: pt(8),
  overflow: 'ellipsis-end',
  fontFamily,
});

const RICH_CONFIG: PostextConfig = {
  bodyText: { fontFamily: 'Body Serif' },
  headings: { fontFamily: 'Head Sans' },
  calloutStyles: [{ id: 'note', titleStyle: { fontFamily: 'Callout Title', fontWeight: 600 } }],
  header: { elements: [designText('{title}', 'Design Face')] },
  toc: { levels: [{ level: 1, fontFamily: 'Contents Face' }] },
};

const RICH_TEXT = ':::toc\n:::\n\n# Chapter one\n\nBody text with **bold**, *italic* and ***both*** words, many times over to fill lines. '.repeat(1)
  + 'More words to set. '.repeat(30) + '\n\n:::callout{type="note" title="Remember"}\nA note in a box.\n:::\n';

beforeEach(() => {
  fonts = new FakeFontSet();
  clearMeasurementCache();
  clearRegisteredFonts();
});

describe('font strings', () => {
  it('reads family, weight and slant back from a canvas font shorthand', () => {
    expect(parseFontString('700 37.5px Open Sans')).toEqual({ family: 'Open Sans', weight: 700, style: 'normal' });
    expect(parseFontString('italic 400 13px "Source Serif 4"')).toEqual({ family: 'Source Serif 4', weight: 400, style: 'italic' });
    expect(parseFontString('95.8px Young Serif')).toEqual({ family: 'Young Serif', weight: 400, style: 'normal' });
    expect(parseFontString('bold 12px "A, B", serif')).toEqual({ family: 'A, B', weight: 700, style: 'normal' });
    expect(parseFontString('no size')).toBeNull();
  });
});

describe('per-family eviction', () => {
  it('drops the widths of the families named and bumps the generation', () => {
    expect(measureTextWidth('abc', '16px Alpha')).toBe(21);
    expect(measureTextWidth('abc', '16px Beta')).toBe(21);
    fonts.add(Object.assign(new FakeFace('Alpha', file()), { status: 'loaded' }));
    fonts.add(Object.assign(new FakeFace('Beta', file()), { status: 'loaded' }));
    const before = measurementGeneration();
    evictFontFamilies(['alpha']);
    expect(measurementGeneration()).toBe(before + 1);
    expect(evictionsSince(before)).toEqual({ all: false, families: new Set(['alpha']) });
    // Alpha is measured again, Beta keeps its cached (stale) width.
    expect(measureTextWidth('abc', '16px Alpha')).toBe(30);
    expect(measureTextWidth('abc', '16px Beta')).toBe(21);
    clearMeasurementCache();
    expect(evictionsSince(before).all).toBe(true);
  });
});

describe('prepareFonts', () => {
  it('lists every face a configuration asks for, in a fixed order', () => {
    const faces = configFontFaces(RICH_CONFIG, RICH_TEXT);
    const keys = faces.map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? 'i' : ''}`);
    for (const k of ['Body Serif 400', 'Body Serif 700', 'Body Serif 400i', 'Body Serif 700i', 'Head Sans 400', 'Callout Title 600', 'Design Face 400', 'Contents Face 400']) {
      expect(keys).toContain(k);
    }
    expect(configFontFaces(RICH_CONFIG, RICH_TEXT)).toEqual(faces);
    // Upright before italic, light before heavy, within a family.
    expect(keys.indexOf('Body Serif 400')).toBeLessThan(keys.indexOf('Body Serif 400i'));
    expect(keys.indexOf('Body Serif 400i')).toBeLessThan(keys.indexOf('Body Serif 700'));
  });

  it('samples the characters the document sets', () => {
    const sample = fontSampleText({ markdown: 'Ἀρχή — čas', resources: [{ id: 't', kind: 'table', caption: 'Ωμέγα', table: { rows: [[{ content: 'ł' }]] } }] as never }, RICH_CONFIG);
    for (const ch of ['Ἀ', 'č', 'Ω', 'ł', '—', 'a', '0']) expect(sample).toContain(ch);
    expect(new Set(sample).size).toBe([...sample].length);
  });

  it('loads declared faces through the set and asks the resolver for the rest, adding them in order', async () => {
    fonts.add(new FakeFace('Body Serif', 'url(body.woff2)', { weight: '400', style: 'normal' }));
    const asked: string[] = [];
    const report = await prepareFonts(RICH_TEXT, RICH_CONFIG, {
      fontSet: fonts,
      FontFace: FakeFace as never,
      watch: false,
      measureWidth: null,
      resolve: async (family, weight, style) => {
        asked.push(`${family} ${weight} ${style}`);
        if (family === 'Nowhere') return null;
        // Two slices, latin then latin-ext: added in that order.
        return [{ source: file(), unicodeRange: 'U+0000-00FF' }, { source: file(), unicodeRange: 'U+0100-024F' }];
      },
    });
    expect(asked).not.toContain('Body Serif 400 normal');
    expect(asked).toContain('Body Serif 700 normal');
    expect(asked).toContain('Callout Title 600 normal');
    expect(fonts.loads.some((l) => l.includes('"Body Serif"'))).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.synthesized).toEqual([]);
    expect(report.added).toBe(2 * asked.length);
    // Slices of one face stay in the answer's order.
    const callout = fonts.faces.filter((f) => f.family === 'Callout Title');
    expect(callout.map((f) => f.unicodeRange)).toEqual(['U+0000-00FF', 'U+0100-024F']);
    // The files are registered for SVG pictures and layout workers.
    const registered = await registeredFontFiles('Callout Title', 600, 'normal');
    expect(registered.map((f) => f.unicodeRange)).toEqual(['U+0000-00FF', 'U+0100-024F']);
  });

  it('reports missing and synthesized faces', async () => {
    fonts.add(new FakeFace('Body Serif', 'url(body.woff2)', { weight: '400', style: 'normal' }));
    const report = await prepareFonts('Text *it* **b**', { bodyText: { fontFamily: 'Body Serif' }, headings: { fontFamily: 'Gone Sans' } }, {
      fontSet: fonts, watch: false, measureWidth: null,
    });
    const key = (f: { family: string; weight: number; style: string }) => `${f.family} ${f.weight} ${f.style}`;
    expect(report.loaded.map(key)).toContain('Body Serif 400 normal');
    expect(report.synthesized.map(key)).toEqual(expect.arrayContaining(['Body Serif 700 normal', 'Body Serif 400 italic', 'Body Serif 700 italic']));
    expect(report.missing.map(key)).toContain('Gone Sans 400 normal');
  });

  it('does nothing where there is no font set', async () => {
    const report = await prepareFonts('x', { bodyText: { fontFamily: 'Body Serif' } }, { fontSet: null });
    expect(report.missing).toEqual([]);
    expect(report.loaded.length).toBeGreaterThan(0);
  });
});

describe('buildDocumentWithFonts', () => {
  const resolve = async () => file();

  it('lays the document out with the real faces in one call', async () => {
    const doc = await buildDocumentWithFonts({ markdown: RICH_TEXT }, RICH_CONFIG, {
      fontSet: fonts, FontFace: FakeFace as never, resolve, watch: false, measureWidth: null, yieldBetweenPasses: async () => {},
    });
    // Every face the pages set text in is a loaded face.
    expect(fontFallbacks(documentFontFaces(doc), fonts, { measureWidth: null })).toEqual([]);
    expect(doc.contentWarnings?.filter((w) => w.kind === 'fontFallback') ?? []).toEqual([]);
    const families = new Set(documentFontFaces(doc).map((f) => f.family));
    for (const f of ['Body Serif', 'Head Sans', 'Callout Title', 'Design Face', 'Contents Face']) expect(families).toContain(f);
    // The same layout as a build with every face there from the start.
    const reference = buildDocument({ markdown: RICH_TEXT }, { ...RICH_CONFIG }, createMeasurementCache(), { fontSet: fonts });
    const widths = (d: typeof doc) => d.blocks.map((b) => b.lines.map((l) => Math.round(l.bbox.width)).join(',')).join('|');
    expect(widths(doc)).toBe(widths(reference));
  });

  it('loads a face the pages use that the configuration did not name', async () => {
    const asked: string[] = [];
    // A paragraph style naming a weight only the layout reveals is
    // covered by the configuration; a chip style face is too. Here the
    // body family is resolved only by its regular face up front.
    const docs = await withLoadedFonts(() => buildDocument({ markdown: 'Plain **bold** text.' }, { bodyText: { fontFamily: 'Late Serif' } }, undefined, { fontSet: fonts }), {
      fontSet: fonts,
      FontFace: FakeFace as never,
      watch: false,
      measureWidth: null,
      resolve: async (family, weight, style) => {
        asked.push(`${family} ${weight} ${style}`);
        return file();
      },
    });
    expect(asked).toContain('Late Serif 400 normal');
    expect(asked).toContain('Late Serif 700 normal');
    expect(fontFallbacks(documentFontFaces(docs), fonts, { measureWidth: null })).toEqual([]);
  });
});

describe('measurement caches follow the faces', () => {
  it('a host-held MeasurementCache measures with a face added after an earlier build', async () => {
    const cache = createMeasurementCache();
    const config: PostextConfig = { bodyText: { fontFamily: 'Arriving Serif' } };
    const text = { markdown: 'A paragraph of text that wraps over several lines in a narrow page. '.repeat(8) };
    const first = buildDocument(text, config, cache, { fontSet: fonts });
    const face = new FakeFace('Arriving Serif', file(), { weight: '400', style: 'normal' });
    await face.load();
    fonts.add(face);
    // No clearMeasurementCache: the next build notices the new face.
    const second = buildDocument(text, config, cache, { fontSet: fonts });
    const fresh = buildDocument(text, { ...config }, createMeasurementCache(), { fontSet: fonts });
    const lines = (d: typeof first) => d.blocks.reduce((n, b) => n + b.lines.length, 0);
    expect(lines(second)).toBe(lines(fresh));
    expect(lines(second)).toBeGreaterThan(lines(first));
  });

  it('watchFonts drops the widths of the families that arrived and tells the listeners once a frame', async () => {
    syncFontSet(fonts);
    const told: string[][] = [];
    const off = onFontsChanged((families) => told.push([...families]));
    const stop = watchFonts(fonts);
    expect(measureTextWidth('ab', '16px Watched')).toBe(14);
    const a = new FakeFace('Watched', file());
    const b = new FakeFace('Watched', file(), { weight: '700' });
    fonts.add(a);
    fonts.add(b);
    await a.load();
    await b.load();
    fonts.fire([a]);
    fonts.fire([b]);
    await new Promise((r) => setTimeout(r, 40));
    expect(told).toEqual([['watched']]);
    expect(measureTextWidth('ab', '16px Watched')).toBe(20);
    stop();
    off();
  });
});

describe('fontFallback warnings', () => {
  const kinds = (ws: readonly ContentWarning[] | undefined) => (ws ?? []).filter((w) => w.kind === 'fontFallback');

  it('reports a missing body face', () => {
    const doc = buildDocument({ markdown: 'Body text.' }, { bodyText: { fontFamily: 'Absent Serif' } }, undefined, { fontSet: fonts });
    expect(kinds(doc.contentWarnings)).toContainEqual({ kind: 'fontFallback', family: 'Absent Serif', weight: 400, style: 'normal', reason: 'missing' });
  });

  it('reports 700 italic drawn from a 400 regular as synthesized', async () => {
    const face = new FakeFace('Only Regular', file());
    await face.load();
    fonts.add(face);
    const doc = buildDocument({ markdown: 'Body ***both*** text.' }, { bodyText: { fontFamily: 'Only Regular' } }, undefined, { fontSet: fonts });
    const found = kinds(doc.contentWarnings);
    expect(found).toContainEqual({ kind: 'fontFallback', family: 'Only Regular', weight: 700, style: 'italic', reason: 'synthesized' });
    expect(found.some((w) => w.kind === 'fontFallback' && w.weight === 400 && w.style === 'normal')).toBe(false);
  });

  it('says nothing when the faces are there, or when debug.warnings.missingFont is off', async () => {
    for (const [weight, style] of [['400', 'normal'], ['700', 'normal'], ['400', 'italic'], ['700', 'italic']]) {
      const face = new FakeFace('Full Serif', file(), { weight, style });
      await face.load();
      fonts.add(face);
    }
    const there = buildDocument({ markdown: 'Body ***both*** *it* **b** text.' }, { bodyText: { fontFamily: 'Full Serif' }, headings: { fontFamily: 'Full Serif' } }, undefined, { fontSet: fonts });
    // (The built-in folio is set in its own family, not loaded here.)
    expect(kinds(there.contentWarnings).filter((w) => w.kind === 'fontFallback' && w.family === 'Full Serif')).toEqual([]);
    const off = buildDocument({ markdown: 'Body text.' }, { bodyText: { fontFamily: 'Absent Serif' }, debug: { warnings: { missingFont: false } } }, undefined, { fontSet: fonts });
    expect(kinds(off.contentWarnings)).toEqual([]);
  });

  it('is not checked where there is no font set', () => {
    const doc = buildDocument({ markdown: 'Body text.' }, { bodyText: { fontFamily: 'Absent Serif' } });
    expect(kinds(doc.contentWarnings)).toEqual([]);
  });
});

describe('a config changed in place', () => {
  it('lays the second build out at the new size', () => {
    const c: PostextConfig = { bodyText: { fontFamily: 'Body Serif', fontSize: pt(9) } };
    const text = { markdown: 'Some words to set in a paragraph. '.repeat(10) };
    const first = buildDocument(text, c, undefined, { fontSet: null });
    c.bodyText!.fontSize = pt(14);
    const second = buildDocument(text, c, undefined, { fontSet: null });
    const fresh = buildDocument(text, { bodyText: { fontFamily: 'Body Serif', fontSize: pt(14) } }, undefined, { fontSet: null });
    expect(second.blocks[0]!.fontString).toBe(fresh.blocks[0]!.fontString);
    expect(second.blocks[0]!.fontString).not.toBe(first.blocks[0]!.fontString);
  });

  it('sees a palette colour changed in place, and drops the part palette memo', () => {
    const c: PostextConfig = {
      colorPalette: [{ id: 'ink', name: 'Ink', value: { hex: '#112233', model: 'rgb' } }],
      bodyText: { color: { hex: '#112233', model: 'rgb', paletteId: 'ink' } },
    };
    const first = buildDocument({ markdown: 'Text.' }, c, undefined, { fontSet: null });
    expect(first.blocks[0]!.color).toBe('#112233');
    const memo = flowColorValues(c, { ink: '#ff0000' });
    expect(flowColorValues(c, { ink: '#ff0000' })).toBe(memo);
    c.colorPalette![0]!.value = { hex: '#445566', model: 'rgb' };
    const second = buildDocument({ markdown: 'Text.' }, c, undefined, { fontSet: null });
    expect(second.blocks[0]!.color).toBe('#445566');
    expect(flowColorValues(c, { ink: '#ff0000' })).not.toBe(memo);
  });

  it('keeps the cached resolution while the config is unchanged, and invalidateConfig drops it', () => {
    const c: PostextConfig = { bodyText: { fontFamily: 'Body Serif' } };
    const resolved = resolveAllConfig(c);
    validateConfigCache(c);
    expect(resolveAllConfig(c)).toBe(resolved);
    invalidateConfig(c);
    expect(resolveAllConfig(c)).not.toBe(resolved);
  });
});

describe('stable fingerprints', () => {
  it('give equal keys for equal content whatever the key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(stableStringify({ a: 1, fileId: 'x' }, new Set(['fileId']))).toBe('{"a":1}');
    // The Sandbox's persisted layout keys: djb2 as 8 hex digits, then the length.
    expect(hashString('abc')).toBe('0b885c8b3');
  });
});
