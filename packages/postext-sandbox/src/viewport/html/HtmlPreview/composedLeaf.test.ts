// #1045: the HTML viewer lays composed pages out on the print leaf and
// shows each whole, scaled to the viewer's width.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument, VDTPage } from 'postext';
import { composedPageScale, fitPagesToContent, isComposedLeaf } from './pageGeometry.js';
import { buildHtmlConfigOverride, hasComposedPages } from './configOverride.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

const leafPage = (over: Partial<VDTPage> = {}): VDTPage => ({
  index: 0,
  width: 1191,
  height: 1587,
  contentArea: { x: 0, y: 0, width: 1191, height: 1587 },
  columns: [],
  floats: [],
  composed: { template: 't', frames: [] } as unknown as VDTPage['composed'],
  ...over,
}) as VDTPage;

describe('composed pages on the leaf', () => {
  it('scales a leaf to the viewer’s width, never above its own size', () => {
    expect(composedPageScale(leafPage(), 845)).toBeCloseTo(845 / 1191, 6);
    expect(composedPageScale(leafPage(), 1600)).toBeUndefined();
    expect(composedPageScale(leafPage({ composed: undefined }), 845)).toBeUndefined();
  });

  it('tells a composed page from a comic page and a page of the flow', () => {
    expect(isComposedLeaf(leafPage())).toBe(true);
    expect(isComposedLeaf(leafPage({ composed: undefined }))).toBe(false);
    expect(isComposedLeaf(leafPage({ comic: {} as VDTPage['comic'] }))).toBe(false);
  });

  it('keeps a leaf whole in the vertical scroll: its height is the leaf’s', () => {
    const doc = { pages: [leafPage()] } as unknown as VDTDocument;
    fitPagesToContent(doc, 24, { keepComposed: true });
    expect(doc.pages[0]!.height).toBe(1587);
    fitPagesToContent(doc, 24);
    expect(doc.pages[0]!.height).toBe(24);
  });

  it('asks the engine for the print leaf when the book has composed pages', () => {
    expect(hasComposedPages('# A\n\n::::page{template="t"}\n::::')).toBe(true);
    expect(hasComposedPages(':::page{split="2"}\n:::')).toBe(false);
    const base: PostextConfig = { page: { width: mm(210), height: mm(280), margins: { top: mm(18), bottom: mm(18), left: mm(14), right: mm(12), mirror: true } } };
    const opts = { fontScale: 1, columnMode: 'single' as const, pageWidthPx: 750, layoutType: 'single' as const, viewportHeightPx: 800, locale: 'es', optimalLineBreaking: false };
    expect(buildHtmlConfigOverride(base, opts).composedViewerLeaf).toBeUndefined();
    const leaf = buildHtmlConfigOverride(base, { ...opts, composedLeaf: true }).composedViewerLeaf!;
    expect(leaf.width).toEqual(mm(210));
    expect(leaf.height).toEqual(mm(280));
    expect(leaf.margins).toMatchObject({ top: mm(18), left: mm(14), right: mm(12), mirror: true });
  });
});
