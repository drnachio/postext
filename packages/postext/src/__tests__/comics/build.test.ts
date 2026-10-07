import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const picture = (id: string, width: number, height: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `file-${id}`, format: 'png', width, height },
  ...extra,
});

const resources: Resource[] = [
  picture('p1-wide', 3000, 1000, { safeArea: { x: 0.3, y: 0, width: 0.4, height: 1 } }),
  picture('p1-door', 1000, 1500),
  picture('p1-ana', 1000, 1000, { anchors: [{ id: 'ana', x: 0.05, y: 0.5 }], safeArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 } }),
  picture('p1-street', 2000, 1000),
];

const markdown = `---
title: Comic
---
# Chapter

Some text before the comic.

:::page{split="30 [30 | 20 | *] / *" gutter=4mm}
::panel{art=p1-wide}
caption: Lyon, 1943.
ana: Did you hear that?
::panel{art=p1-door focus="70% 40%"}
sfx{at="62% 40%" rotate=-8}: KRAK
::panel{art=p1-ana}
ana{thought}: Nothing, he says…
::panel{art=p1-street bleed}
caption{at=bottom-end}: Three streets away.
:::

:::page{split="* [40~55 | *] / 35"}
::panel{art=p1-door}
ben: Run!
::panel{art=missing}
::panel{art=p1-street}
:::

Text after the comic pages.
`;

describe('comic pages in the build', () => {
  const config: PostextConfig = { page: { sizePreset: '17x24' } };

  it('gives each :::page a page of its own, with its panels and split lines', () => {
    const doc = buildDocument({ markdown, resources }, config);
    const comics = doc.pages.filter((p) => p.comic);
    expect(comics).toHaveLength(2);
    const [a, b] = comics as [typeof comics[0], typeof comics[0]];
    expect(b.index).toBe(a.index + 1);
    // Text before and after: on pages of their own.
    expect(a.index).toBeGreaterThan(0);
    expect(doc.pages.length).toBe(b.index + 2);
    expect(doc.pages[b.index + 1]!.columns.some((c) => c.blocks.length > 0)).toBe(true);
    for (const p of comics) {
      expect(p.role).toBe('comic');
      expect(p.columns.every((c) => c.blocks.length === 0)).toBe(true);
      expect(p.header).toBeUndefined();
      expect(p.footer).toBeUndefined();
    }
    expect(a.comic!.panels.map((p) => p.art?.resourceId)).toEqual(['p1-wide', 'p1-door', 'p1-ana', 'p1-street']);
    expect(a.comic!.splitters).toHaveLength(3);
    expect(a.comic!.splitters.map((s) => [s.path, s.boundary, s.axis])).toEqual([
      [[], 0, 'rows'],
      [[0], 0, 'columns'],
      [[0], 1, 'columns'],
    ]);
    // The split value's source range, in the whole markdown.
    const s0 = a.comic!.splitters[0]!;
    expect(markdown.slice(s0.sourceStart, s0.sourceEnd)).toBe('30 [30 | 20 | *] / *');
    expect(markdown.slice(a.comic!.sourceStart, a.comic!.sourceStart + 7)).toBe(':::page');
    expect(a.comic!.balloons).toEqual([]);
    // The last panel bleeds: past the frame to the trim (no cut lines).
    const last = a.comic!.panels[3]!;
    expect(last.bbox.y + last.bbox.height).toBeCloseTo(doc.pages[0]!.height, 3);
    expect(last.bbox.x).toBeCloseTo(0, 3);
    // Second page: slanted line, missing art set empty.
    expect(b.comic!.panels).toHaveLength(3);
    expect(b.comic!.panels[1]!.art).toBeUndefined();
    expect(b.comic!.panels[0]!.polygon.length).toBe(4);
    expect(b.comic!.panels[0]!.radius).toBe(0);
  });

  it('reports the comic warnings on their page', () => {
    const doc = buildDocument({ markdown, resources }, config);
    const kinds = (doc.contentWarnings ?? []).map((w) => w.kind);
    expect(kinds).toContain('comicUnknownArt');
    expect(kinds).toContain('comicAnchorOutsideSafeArea');
    const unknown = doc.contentWarnings!.find((w) => w.kind === 'comicUnknownArt')!;
    expect(unknown.pageIndex).toBe(doc.pages.findIndex((p) => p.comic) + 1);
  });

  it('keeps running heads on comic pages when the config asks', () => {
    // The default footer prints the folio on every other page.
    const before = buildDocument({ markdown, resources }, config);
    expect(before.pages.find((p) => !p.comic)!.footer).toBeDefined();
    const doc = buildDocument({ markdown, resources }, { ...config, comics: { runningHeads: true } });
    const page = doc.pages.find((p) => p.comic)!;
    expect(page.footer).toBeDefined();
    // Comic pages count in the numbering either way.
    expect(page.pageLabel).toBe(String(page.index + 1));
  });

  it('leaves no empty page after a comic page that ends the document', () => {
    const md = 'Text.\n\n:::page\n::panel\nana: Hi\n:::\n';
    const doc = buildDocument({ markdown: md, resources }, config);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[1]!.comic).toBeDefined();
    // A comic page first: it takes page 1.
    const first = buildDocument({ markdown: ':::page\n::panel\n:::\n\nText.', resources }, config);
    expect(first.pages[0]!.comic).toBeDefined();
    expect(first.pages).toHaveLength(2);
    // A page break between two comic pages opens no blank page.
    const two = buildDocument({ markdown: ':::page\n::panel\n:::\n\n:::pagebreak\n\n:::page\n::panel\n:::', resources }, config);
    expect(two.pages.map((p) => p.role)).toEqual(['comic', 'comic']);
  });

  it('stacks the panels of a page without a split in equal tiers', () => {
    const doc = buildDocument({ markdown: ':::page{gutter=0}\n::panel\n::panel\n::panel\n:::', resources }, config);
    const comic = doc.pages[0]!.comic!;
    expect(comic.panels).toHaveLength(3);
    const h = comic.frame.height / 3;
    comic.panels.forEach((p, i) => expect(p.bbox.y).toBeCloseTo(comic.frame.y + i * h, 3));
    // The splitters point at where a split attribute would go.
    expect(comic.splitters).toHaveLength(2);
    expect(comic.splitters[0]!.sourceStart).toBe(comic.splitters[0]!.sourceEnd);
  });

  it('reads the panels from the right in a right-to-left document, and mirrors art when asked', () => {
    const md = ':::page{split="* [30 | *]"}\n::panel{art=p1-door}\n::panel{art=p1-ana mirror=false}\n:::';
    const ltr = buildDocument({ markdown: md, resources }, config).pages[0]!.comic!;
    const rtl = buildDocument({ markdown: md, resources }, { ...config, locale: 'ar', comics: { mirrorArt: true } }).pages[0]!.comic!;
    expect(ltr.direction).toBe('ltr');
    expect(rtl.direction).toBe('rtl');
    expect(rtl.panels[0]!.bbox.x).toBeGreaterThan(rtl.panels[1]!.bbox.x);
    expect(ltr.panels[0]!.bbox.x).toBeLessThan(ltr.panels[1]!.bbox.x);
    expect(rtl.panels[0]!.art!.mirrored).toBe(true);
    expect(rtl.panels[1]!.art!.mirrored).toBe(false);
    expect(ltr.panels[0]!.art!.mirrored).toBe(false);
  });

  it('pads a panel inside its cell and lays an inset panel over the one before', () => {
    const md = ':::page{split="* [* | *]" gutter=0}\n::panel{pad="0 10%"}\n::panel\n::panel{inset="50% 50% 40% 40%"}\n:::';
    const comic = buildDocument({ markdown: md, resources }, config).pages[0]!.comic!;
    expect(comic.panels).toHaveLength(3);
    const half = comic.frame.width / 2;
    expect(comic.panels[0]!.bbox.x).toBeCloseTo(comic.frame.x + half * 0.1, 3);
    expect(comic.panels[0]!.bbox.width).toBeCloseTo(half * 0.8, 3);
    const second = comic.panels[1]!;
    const inset = comic.panels[2]!;
    expect(inset.bbox.x).toBeCloseTo(second.bbox.x + second.bbox.width * 0.5, 3);
    expect(inset.bbox.width).toBeCloseTo(second.bbox.width * 0.4, 3);
  });

  it('warns about the split, the panel count, stray text, styles and letterboxed panels', () => {
    const md = [
      'Text.',
      '',
      ':::page{split="30 / 40 | *"}',
      'Stray.',
      '::panel{art=p1-wide}',
      'ana{wisper}: Hi',
      '::panel',
      '::panel',
      '::panel',
      ':::',
      '',
      ':::page{split="* [10 | *]"}',
      '::panel{art=p1-wide}',
      '::panel',
      ':::',
    ].join('\n');
    const doc = buildDocument({ markdown: md, resources }, config);
    const warnings = doc.contentWarnings ?? [];
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toEqual(expect.arrayContaining(['comicSplitSyntax', 'comicPanelCount', 'comicStrayText', 'comicUnknownBalloonStyle', 'comicPanelLetterbox']));
    const comicPages = doc.pages.filter((p) => p.comic).map((p) => p.index);
    for (const w of warnings) expect(comicPages).toContain(w.pageIndex);
    const letterbox = warnings.find((w) => w.kind === 'comicPanelLetterbox')!;
    expect(letterbox.pageIndex).toBe(comicPages[1]);
    const stray = warnings.find((w) => w.kind === 'comicStrayText')!;
    expect(md.slice(stray.sourceStart!, stray.sourceEnd!)).toBe('Stray.');
  });

  it('lays a comic page out on the sheet in a vertical document', () => {
    const md = '本文。\n\n:::page{split="* [* | *]"}\n::panel\n::panel\nアナ：はい\n:::';
    const doc = buildDocument({ markdown: md, resources }, { ...config, locale: 'ja', layout: { writingMode: 'vertical-rl' } });
    const page = doc.pages.find((p) => p.comic)!;
    const { frame } = page.comic!;
    // Inside the sheet, portrait like the page.
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.x + frame.width).toBeLessThan(page.width);
    expect(frame.y + frame.height).toBeLessThan(page.height);
    expect(frame.height).toBeGreaterThan(frame.width);
    // A Western comic in Japanese still reads left to right.
    expect(page.comic!.direction).toBe('ltr');
    expect(page.comic!.panels[0]!.bbox.x).toBeLessThan(page.comic!.panels[1]!.bbox.x);
  });

  it('lays out a document without comics as before', () => {
    const plain = '# Title\n\nOne paragraph.\n\n:::pagebreak\n\nAnother.\n';
    const doc = buildDocument({ markdown: plain }, config);
    expect(doc.pages.every((p) => p.comic === undefined && p.role !== 'comic')).toBe(true);
    expect(doc.config.comics).toBeUndefined();
  });
});
