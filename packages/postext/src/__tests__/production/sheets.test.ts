import { describe, it, expect } from 'vitest';
import {
  buildCover,
  coverDesignFor,
  coverSource,
  expandCatalogueText,
  withCatalogue,
  type BuiltCover,
} from '../../production/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { buildDocument } from '../../pipeline/index.js';
import type { CoverConfig, PostextConfig } from '../../types.js';

// A hardcover's sheets each with a design and a text of their own, and a
// collection's catalogue set on the endpapers (#1673).

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const green = { hex: '#1f3a2c', model: 'hex' as const };
const cream = { hex: '#f2e8d5', model: 'hex' as const };
const collection = {
  name: 'Novelas ejemplares',
  isbn: '978-84-0000-200-8',
  volume: 'casamiento',
  catalogue: [
    { id: 'gitanilla', title: 'La gitanilla', resource: 'pic-1' },
    { id: 'amante', title: 'El amante liberal' },
    { id: 'casamiento', title: 'El casamiento engañoso', resource: 'pic-3' },
    { id: 'coloquio', title: 'El coloquio de los perros', resource: 'pic-4' },
  ],
};
const cover: CoverConfig = {
  background: { hex: '#202020', model: 'hex' },
  image: { resourceId: 'art', area: 'front' },
  sheets: {
    case: { background: green },
    endpapers: {
      background: cream,
      elements: [{ id: 'series', kind: 'catalogue', zone: 'flyleaf', x: 10, y: 10, width: 100, height: 60, columns: 2, gap: 4, stroke: { color: green, width: 0.5 } }],
    },
    endpaperBack: { background: green },
  },
};
const config: PostextConfig = {
  page: { sizePreset: 'custom', width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } },
  production: {
    collection,
    versions: [{ id: 'hc', name: 'Cartoné', binding: 'case-flat', flaps: true, isbn: '978-0-306-40615-7' }],
  },
  cover,
  locale: 'es',
} as PostextConfig;
const metadata = { title: 'El casamiento engañoso', author: 'Miguel de Cervantes' };
const markdown = [
  ':::frame{slot="back"}', 'Un alférez sale del hospital.', ':::',
  ':::frame{slot="front" sheet="case"}', 'MDC', ':::',
  ':::frame{slot="flyleaf" sheet="endpapers"}', '::catalogue{numbers="I"}', ':::',
].join('\n');

const build = (sheet?: 'jacket' | 'endpaperFront' | 'endpaperBack') => buildCover({ config, version: 'hc', pages: 200, markdown, metadata, sheet }) as BuiltCover;
const decoration = (b: BuiltCover) => (b.config.pageTemplates!.find((t) => t.id === 'postext-cover')!.decoration?.elements ?? []) as { kind?: string; resourceId?: string }[];
const words = (b: BuiltCover) => {
  const page = buildDocument(b.content, b.config).pages[0]!;
  return [...(page.floats ?? [])].flatMap((x) => x.lines.map((l) => l.text)).join(' | ');
};

describe('a design per sheet', () => {
  it('takes a sheet’s own design, the most particular of its names, else the book’s', () => {
    expect(coverDesignFor(cover, ['case', 'cover'])!.background).toEqual(green);
    expect(coverDesignFor(cover, ['jacket'])!.image?.resourceId).toBe('art');
    expect(coverDesignFor(cover, ['jacket'])).not.toHaveProperty('sheets');
    expect(coverDesignFor(cover, ['endpaperBack', 'endpapers'])!.background).toEqual(green);
    expect(coverDesignFor(cover, ['endpaperFront', 'endpapers'])!.background).toEqual(cream);
    expect(coverDesignFor(undefined, ['cover'])).toBeUndefined();
  });

  it('paints the jacket with the book’s design and the cloth case with its own', () => {
    const jacket = build('jacket');
    const casing = build();
    expect(decoration(jacket).some((e) => e.kind === 'image' && e.resourceId === 'art')).toBe(true);
    expect(decoration(casing).some((e) => e.kind === 'image' && e.resourceId === 'art')).toBe(false);
    // The barcode stays on the jacket.
    expect(jacket.content.resources!.some((r) => r.id === 'postext-cover-isbn')).toBe(true);
    expect(casing.content.resources!.some((r) => r.id === 'postext-cover-isbn')).toBe(false);
  });
});

describe('the cover’s text per sheet', () => {
  it('lets a frame for one sheet take its slot there, and leaves it out elsewhere', () => {
    const casing = words(build());
    expect(casing).toContain('MDC');
    expect(casing).not.toContain('Miguel de Cervantes · ');
    const jacket = words(build('jacket'));
    expect(jacket).not.toContain('MDC');
    expect(jacket).toContain('El casamiento engañoso');
    expect(jacket).toContain('Un alférez sale del hospital.');
  });

  it('reports a sheet no version has, and counts no other sheet’s frame as a repeat', () => {
    const slots = ['back', 'spine', 'front'];
    const src = ':::frame{slot="front" sheet="case"}\nA\n:::\n:::frame{slot="front" sheet="jacket"}\nB\n:::\n:::frame{slot="front"}\nC\n:::\n:::frame{slot="back" sheet="slipcase"}\nD\n:::';
    const onCase = coverSource(src, slots, {}, ['case', 'cover']);
    expect(onCase.issues).toEqual([expect.objectContaining({ kind: 'coverFrameSheetUnknown', sheet: 'slipcase' })]);
    expect(onCase.markdown).toContain('A');
    expect(onCase.markdown).not.toMatch(/\bB\b|\bC\b|\bD\b/);
    const softcover = coverSource(src, slots, {}, ['cover']);
    expect(softcover.markdown).toMatch(/\bC\b/);
    expect(softcover.markdown).not.toMatch(/\bA\b|\bB\b/);
  });
});

describe('the catalogue', () => {
  it('sets the titles as numbered lines, the book’s own in its style, a part of them', () => {
    const md = expandCatalogueText('::catalogue{numbers="I" first=2 last=3}', collection, 'es');
    expect(md).toBe(':::paragraphs{style="cover-catalogue"}\nII El amante liberal\n:::\n\n:::paragraphs{style="cover-catalogue-current"}\nIII El casamiento engañoso\n:::');
    expect(expandCatalogueText('::catalogue{numbers="none"}', collection)).toContain('\nLa gitanilla\n');
    expect(expandCatalogueText('::catalogue', undefined)).toBe('');
  });

  it('lays the titles’ pictures out in a grid, the book’s own outlined', () => {
    const design = withCatalogue(cover.sheets!.endpapers, collection)!;
    const els = design.elements!;
    expect(els.filter((e) => e.kind === 'image').map((e) => [e.resourceId, e.x, e.y])).toEqual([
      ['pic-1', 10, 10],
      ['pic-3', 10, 42],
      ['pic-4', 62, 42],
    ]);
    expect(els.find((e) => e.kind === 'box')).toMatchObject({ x: 10, y: 42, width: 48, height: 28, stroke: { width: 0.5 } });
    expect(els.some((e) => e.kind === 'catalogue')).toBe(false);
  });

  it('sets both on the front endpaper', () => {
    const front = build('endpaperFront');
    expect(decoration(front).filter((e) => e.kind === 'image' && /^pic-/.test(e.resourceId ?? ''))).toHaveLength(3);
    const text = words(front);
    expect(text).toContain('I La gitanilla');
    expect(text).toContain('III El casamiento engañoso');
    expect(front.issues.filter((i) => i.kind.startsWith('coverSlot') || i.kind === 'coverFrameSheetUnknown')).toEqual([]);
  });
});

describe('text read from the metadata and the catalogue', () => {
  it('prints its punctuation as written, with no backslash', () => {
    const title = 'The Spanish-English Lady: *one* (1613), 5$ & [more] — user@mail';
    const text = words(buildCover({ config, version: 'hc', pages: 200, metadata: { title }, sheet: 'jacket' }) as BuiltCover);
    expect(text).not.toContain('\\');
    expect(text).toContain('Spanish-English Lady: *one* (1613), 5$');
    expect(expandCatalogueText('::catalogue{numbers="none"}', { name: 'Novelas', catalogue: [{ id: 'x', title: 'The Spanish-English Lady' }] })).toContain('\nThe Spanish-English Lady\n');
  });
});

describe('the checks', () => {
  it('report a sheet no version has, a catalogue’s bad numbers and a volume not in the catalogue', () => {
    const bad = {
      ...config,
      cover: { sheets: { slipcase: {}, case: { sheets: {}, elements: [{ id: 'c', kind: 'catalogue', zone: 'front', x: 0, y: 0, width: 10, height: 10, columns: 0, gap: -1 }] } } },
      production: { ...config.production, collection: { ...collection, volume: 'quijote' } },
    } as unknown as PostextConfig;
    const paths = collectConfigWarnings(bad).map((w) => w.path);
    expect(paths).toEqual(expect.arrayContaining([
      'cover.sheets.slipcase',
      'cover.sheets.case.sheets',
      'cover.sheets.case.elements[0].columns',
      'cover.sheets.case.elements[0].gap',
      'production.collection.volume',
    ]));
    expect(collectConfigWarnings(config).filter((w) => w.path?.startsWith('cover') || w.path?.startsWith('production'))).toEqual([]);
  });
});
