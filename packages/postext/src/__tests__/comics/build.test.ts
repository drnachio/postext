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

  it('lays out a document without comics as before', () => {
    const plain = '# Title\n\nOne paragraph.\n\n:::pagebreak\n\nAnother.\n';
    const doc = buildDocument({ markdown: plain }, config);
    expect(doc.pages.every((p) => p.comic === undefined && p.role !== 'comic')).toBe(true);
    expect(doc.config.comics).toBeUndefined();
  });
});
