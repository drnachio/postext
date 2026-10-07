import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { isComicSpread, parseComicFence } from '../../comics';
import type { VDTComicPage, VDTDocument, VDTPage } from '../../vdt';
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

const resources: Resource[] = [
  { id: 'vista', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'vista-file', format: 'png', width: 4000, height: 1500 } },
];

/** A spread: a wide panel across the top of both pages, three panels
 *  under it (the middle one across the spine). */
const spread = ':::page{spread split="40 / * [* | * | *]"}\n::panel{art=vista}\ncaption: The valley.\n::panel\n::panel\n::panel\n:::';

const comicPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.comic);
const trimOf = (doc: VDTDocument, page: VDTPage) => ({ x: doc.trimOffset, width: page.width - 2 * doc.trimOffset });

describe(':::page{spread}', () => {
  const config: PostextConfig = { page: { sizePreset: '17x24' } };

  it('reads the spread flag', () => {
    const src = (attrs: string) => parseComicFence(`:::page{${attrs}}\n::panel\n:::`, 0)!.source;
    expect(isComicSpread(src('spread'))).toBe(true);
    expect(isComicSpread(src('spread=false'))).toBe(false);
    expect(isComicSpread(src('split="*"'))).toBe(false);
  });

  it('opens on a verso, a blank before it at the start of a book, and lays one split over both pages', () => {
    const doc = buildDocument({ markdown: `${spread}\n\nAfter the spread.`, resources }, config);
    const pages = comicPages(doc);
    expect(pages).toHaveLength(2);
    const [left, right] = pages as [VDTPage, VDTPage];
    // Page 1 stands alone: a parity blank; the spread takes pages 2 and 3.
    expect(doc.pages[0]!.blankForParity).toBe(true);
    expect(doc.pages[0]!.role).toBe('blank');
    expect(left.index).toBe(1);
    expect(right.index).toBe(2);
    expect(left.role).toBe('comic');
    expect(right.role).toBe('comic');
    expect(left.comic!.spread).toBe('left');
    expect(right.comic!.spread).toBe('right');
    // The text after it opens the next page.
    expect(doc.pages[3]!.columns.some((c) => c.blocks.length > 0)).toBe(true);
    expect(doc.pages).toHaveLength(4);

    // Inner margins dropped: each half of the frame runs to the spine.
    const trim = trimOf(doc, left);
    const lf = left.comic!.frame;
    const rf = right.comic!.frame;
    expect(lf.x).toBeCloseTo(left.contentArea.x, 3);
    expect(lf.x + lf.width).toBeCloseTo(trim.x + trim.width, 3);
    expect(rf.x).toBeCloseTo(trim.x, 3);
    expect(rf.x + rf.width).toBeCloseTo(right.contentArea.x + right.contentArea.width, 3);

    // Panels by reading order: 0 (top, across), 1 (left), 2 (across the
    // spine), 3 (right).
    const indexes = (c: VDTComicPage) => c.panels.map((p) => p.index);
    expect(indexes(left.comic!)).toEqual([0, 1, 2]);
    expect(indexes(right.comic!)).toEqual([0, 2, 3]);
    // A panel across the spine is cut past the sheet's edge on each page
    // (no border along the spine), and its picture is drawn on both.
    const topL = left.comic!.panels[0]!;
    const topR = right.comic!.panels[0]!;
    expect(topL.bbox.x + topL.bbox.width).toBeGreaterThan(left.width);
    expect(topR.bbox.x).toBeLessThan(0);
    expect(topL.art?.resourceId).toBe('vista');
    expect(topR.art?.resourceId).toBe('vista');
    // The same picture, its box shifted by the width of a page.
    expect(topL.art!.box.width).toBeCloseTo(topR.art!.box.width, 3);
    expect(topL.art!.box.x - topR.art!.box.x).toBeCloseTo(trim.width, 3);
    expect(topL.radius).toBe(0);
    // A panel on one side keeps its whole outline.
    const p1 = left.comic!.panels[1]!;
    expect(p1.bbox.x + p1.bbox.width).toBeLessThan(trim.x + trim.width);
  });

  it('gives each page the split lines on it, with the split value range', () => {
    const md = spread;
    const doc = buildDocument({ markdown: md, resources }, config);
    const [left, right] = comicPages(doc) as [VDTPage, VDTPage];
    const trim = trimOf(doc, left);
    const rowsL = left.comic!.splitters.filter((s) => s.axis === 'rows');
    const rowsR = right.comic!.splitters.filter((s) => s.axis === 'rows');
    // The line between the tiers crosses the spine: half on each page.
    expect(rowsL).toHaveLength(1);
    expect(rowsR).toHaveLength(1);
    expect(Math.max(rowsL[0]!.a.x, rowsL[0]!.b.x)).toBeCloseTo(trim.x + trim.width, 3);
    expect(Math.min(rowsR[0]!.a.x, rowsR[0]!.b.x)).toBeCloseTo(trim.x, 3);
    // The two column lines of the bottom tier: one on each page.
    expect(left.comic!.splitters.filter((s) => s.axis === 'columns')).toHaveLength(1);
    expect(right.comic!.splitters.filter((s) => s.axis === 'columns')).toHaveLength(1);
    for (const s of [...left.comic!.splitters, ...right.comic!.splitters]) {
      expect(md.slice(s.sourceStart, s.sourceEnd)).toBe('40 / * [* | * | *]');
    }
  });

  it('opens on the next page when it is already a verso', () => {
    const doc = buildDocument({ markdown: `Page one.\n\n${spread}`, resources }, config);
    const [left, right] = comicPages(doc) as [VDTPage, VDTPage];
    expect(left.index).toBe(1);
    expect(right.index).toBe(2);
    expect(doc.pages.some((p) => p.blankForParity)).toBe(false);
  });

  it('pads to a verso after an even page', () => {
    const doc = buildDocument({ markdown: `Page one.\n\n:::pagebreak\n\nPage two.\n\n${spread}`, resources }, config);
    const [left] = comicPages(doc) as [VDTPage];
    expect(left.index).toBe(3);
    expect(doc.pages[2]!.blankForParity).toBe(true);
  });

  it('counts pages as printed in a chapter laid out after others', () => {
    // Page 1 of this chapter is page 2 of the book: a verso.
    const doc = buildDocument({ markdown: spread, resources, continuation: { pageIndexOffset: 1 } }, config);
    const pages = comicPages(doc);
    expect(pages[0]!.index).toBe(0);
    expect(doc.pages.some((p) => p.blankForParity)).toBe(false);
    // Page 3 of the book stands as a recto: a blank, then pages 4 and 5.
    const odd = buildDocument({ markdown: spread, resources, continuation: { pageIndexOffset: 2 } }, config);
    expect(comicPages(odd)[0]!.index).toBe(1);
    expect(odd.pages[0]!.blankForParity).toBe(true);
  });

  it('starts on the right page of a right-bound book, read right to left', () => {
    const doc = buildDocument({ markdown: `نص.\n\n${spread}`, resources }, { ...config, locale: 'ar' });
    expect(doc.config.page.binding).toBe('right');
    const [verso, recto] = comicPages(doc) as [VDTPage, VDTPage];
    // The verso (page 2) is the right page of the open book.
    expect(verso.index).toBe(1);
    expect(verso.comic!.spread).toBe('right');
    expect(recto.comic!.spread).toBe('left');
    expect(verso.comic!.direction).toBe('rtl');
    // Reading order from the right: the top panel, then the bottom-right
    // panel on the verso, the bottom-left one on the recto.
    expect(verso.comic!.panels.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(recto.comic!.panels.map((p) => p.index)).toEqual([0, 2, 3]);
    // The verso's frame runs from the spine (its left edge) to its outer
    // margin.
    const trim = trimOf(doc, verso);
    expect(verso.comic!.frame.x).toBeCloseTo(trim.x, 3);
    expect(recto.comic!.frame.x + recto.comic!.frame.width).toBeCloseTo(trim.x + trim.width, 3);
  });

  it('bleeds through the outer edges only', () => {
    const md = ':::page{spread split="*" bleed}\n::panel{art=vista}\n:::';
    const doc = buildDocument({ markdown: md, resources }, { ...config, page: { ...config.page, cutLines: { enabled: true, bleed: { value: 3, unit: 'mm' } } } });
    const [left, right] = comicPages(doc) as [VDTPage, VDTPage];
    const bleed = (3 / 25.4) * doc.config.page.dpi;
    const trim = trimOf(doc, left);
    const l = left.comic!.panels[0]!.bbox;
    const r = right.comic!.panels[0]!.bbox;
    // Head, foot and fore edges: out to the bleed.
    expect(l.x).toBeCloseTo(trim.x - bleed, 1);
    expect(l.y).toBeCloseTo(doc.trimOffset - bleed, 1);
    expect(r.x + r.width).toBeCloseTo(trim.x + trim.width + bleed, 1);
    expect(r.y + r.height).toBeCloseTo(right.height - doc.trimOffset + bleed, 1);
  });

  it('two spreads in a row take four pages, no blank between', () => {
    const doc = buildDocument({ markdown: `Page one.\n\n${spread}\n\n${spread}`, resources }, config);
    const pages = comicPages(doc);
    expect(pages.map((p) => p.index)).toEqual([1, 2, 3, 4]);
    expect(pages.map((p) => p.comic!.spread)).toEqual(['left', 'right', 'left', 'right']);
  });
});
