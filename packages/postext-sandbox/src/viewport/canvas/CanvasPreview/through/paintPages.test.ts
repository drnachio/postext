import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageImageSource, RenderPageOptions, VDTDieCut, VDTDocument, VDTPage, VDTPathCommand } from 'postext';

// The Canvas viewer's paint with die-cuts (#1567): the source each holed
// page is handed for `beneath`, the hidden pages painted for it, and the
// repaint chain. The painter is replaced by one that records its calls and
// asks for every page its holes show, as the engine's composite does.

interface Painted { page: number; canvas: FakeCanvas; opts: RenderPageOptions; beneath: (CanvasImageSource | undefined)[] }
const paints: Painted[] = [];

vi.mock('postext', async (importOriginal) => {
  const real = await importOriginal<typeof import('postext')>();
  return {
    ...real,
    composedPagePaintKey: (page: VDTPage) => `k${page.index}`,
    renderPageToCanvas: (page: VDTPage, doc: VDTDocument, canvas: FakeCanvas, opts: RenderPageOptions & { beneath?: PageImageSource }) => {
      const scale = opts.scale ?? 1;
      canvas.width = Math.round(page.width * scale);
      canvas.height = Math.round(page.height * scale);
      const beneath = opts.beneath ? real.seeThrough(doc, doc.pages.indexOf(page)).map((l) => (l.pageIndex >= 0 ? opts.beneath!(l.pageIndex) : undefined)) : [];
      paints.push({ page: page.index, canvas, opts, beneath });
    },
  };
});

class FakeCanvas {
  width = 1;
  height = 1;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  hidden = false;
}
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => {
    const c = new FakeCanvas();
    c.hidden = true;
    return c;
  },
};

const { createThroughState, paintPages, evictHidden, hiddenBytes, styleCutCanvas } = await import('./paintPages.js');
const { createPaintedPages } = await import('../pageReuse.js');

const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
  { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
];
const cut = (...holes: VDTPathCommand[][]): VDTDieCut => ({ holes, sources: holes.map(() => 'd'), wrapGapPx: holes.map(() => 0) });
const docOf = (cuts: (VDTDieCut | undefined)[]) => ({
  pageIndexOffset: 0,
  pages: cuts.map((dieCut, index) => ({ index, width: 400, height: 600, ...(dieCut ? { dieCut } : {}) }) as unknown as VDTPage),
}) as unknown as VDTDocument;
const hole = rect(100, 100, 200, 200);

function viewer(doc: VDTDocument, visible: number[]) {
  const canvasMap = new Map<number, HTMLCanvasElement>();
  doc.pages.forEach((_, i) => canvasMap.set(i, new FakeCanvas() as unknown as HTMLCanvasElement));
  return {
    doc,
    canvasMap,
    rendered: new Set<number>(),
    stale: new Set<number>(),
    visible: new Set(visible),
    painted: createPaintedPages(),
    through: createThroughState(),
  };
}

beforeEach(() => {
  paints.length = 0;
});

describe('paintPages', () => {
  it('paints a book without holes as before: no beneath, no hidden page', () => {
    const v = viewer(docOf([undefined, undefined, undefined]), [0, 1]);
    expect(paintPages(v, [0, 1], { scale: 1 })).toBe(2);
    expect(paints.map((p) => p.page)).toEqual([0, 1]);
    expect(paints.every((p) => !('beneath' in p.opts))).toBe(true);
    expect(v.through.hidden.size).toBe(0);
  });

  it('hands a holed page the canvas on screen of the page beneath, painted first', () => {
    const doc = docOf([cut(hole), undefined, undefined]);
    const v = viewer(doc, [0, 1, 2]);
    paintPages(v, [0, 1, 2], { scale: 1 });
    // Page 2 (beneath recto 0) is painted before page 0.
    expect(paints.map((p) => p.page).indexOf(2)).toBeLessThan(paints.map((p) => p.page).indexOf(0));
    const zero = paints.find((p) => p.page === 0)!;
    expect(zero.beneath).toEqual([v.canvasMap.get(2)]);
    expect(v.through.hidden.size).toBe(0);
  });

  it('paints a page beneath that is not on screen into a hidden canvas, at half scale, once', () => {
    const doc = docOf([cut(hole), undefined, cut(hole), undefined, undefined]);
    const v = viewer(doc, [0]);
    paintPages(v, [0], { scale: 0.8 });
    const hidden = paints.filter((p) => p.canvas.hidden);
    expect(hidden.map((p) => p.page).sort()).toEqual([2, 4]);
    expect(hidden.every((p) => p.opts.scale === 0.4)).toBe(true);
    // The hidden page 2 has a hole too: it was painted with what it shows.
    expect(hidden.find((p) => p.page === 2)!.beneath).toHaveLength(1);
    expect(hiddenBytes(v.through)).toBe(2 * 160 * 240 * 4);
    paints.length = 0;
    paintPages(v, [0], { scale: 0.8 });
    expect(paints.map((p) => p.page)).toEqual([0]);
  });

  it('does not hand over a stale canvas, nor a proofed one', () => {
    const doc = docOf([cut(hole), undefined, undefined]);
    const v = viewer(doc, [0, 2]);
    paintPages(v, [2], { scale: 1 });
    v.stale.add(2);
    paints.length = 0;
    paintPages(v, [0], { scale: 1 });
    expect((paints.find((p) => p.page === 0)!.beneath[0] as unknown as FakeCanvas).hidden).toBe(true);
    paints.length = 0;
    v.stale.clear();
    paintPages(v, [0], { scale: 1, printPreview: {} as never });
    const zero = paints.find((p) => p.page === 0)!;
    expect((zero.beneath[0] as unknown as FakeCanvas).hidden).toBe(true);
    // The hidden copy is painted without the proof.
    expect(paints.find((p) => p.canvas.hidden)!.opts.printPreview).toBeUndefined();
  });

  it('repaints what shows a page when it repaints: in view now, else stale', () => {
    // A tunnel 0 → 2 → 4.
    const doc = docOf([cut(hole), undefined, cut(hole), undefined, undefined]);
    const v = viewer(doc, [0, 2, 4]);
    paintPages(v, [0, 2, 4], { scale: 1 });
    paints.length = 0;
    paintPages(v, [4], { scale: 1 });
    expect(paints.map((p) => p.page)).toEqual([4, 2, 0]);
    // Page 0 out of view: it is marked stale and forgotten instead.
    v.visible.delete(0);
    paints.length = 0;
    paintPages(v, [4], { scale: 1 });
    expect(paints.map((p) => p.page)).toEqual([4, 2]);
    expect(v.stale.has(0)).toBe(true);
  });

  it('keys a holed page by the pages it shows', () => {
    const doc = docOf([cut(hole), undefined, undefined]);
    const v = viewer(doc, [0, 2]);
    const opts = { scale: 1 };
    paintPages(v, [0, 2], opts);
    expect(v.painted.same(0, doc.pages[0]!, opts, '2:k2')).toBe(true);
    expect(v.painted.same(0, doc.pages[0]!, opts, '2:changed')).toBe(false);
    expect(v.painted.same(0, doc.pages[0]!, opts, undefined)).toBe(false);
  });

  it('frees hidden pages first, farthest from the reader', () => {
    const doc = docOf([cut(hole), undefined, cut(hole), undefined, undefined]);
    const v = viewer(doc, [0]);
    paintPages(v, [0], { scale: 1 });
    expect(evictHidden(v.through, 0)).toBe(true);
    expect([...v.through.hidden.keys()]).toEqual([2]);
    expect(evictHidden(v.through, 0)).toBe(true);
    expect(evictHidden(v.through, 0)).toBe(false);
  });
});

describe('styleCutCanvas', () => {
  it('drops the white background of a cut page and gives it back', () => {
    const c = new FakeCanvas() as unknown as HTMLCanvasElement;
    styleCutCanvas(c, { dieCut: cut(hole) } as unknown as VDTPage);
    expect(c.style.backgroundColor).toBe('transparent');
    styleCutCanvas(c, { dieCut: { ...cut(), outline: [rect(0, 0, 380, 600)] } } as unknown as VDTPage);
    expect(c.style.filter).toContain('drop-shadow');
    expect(c.style.boxShadow).toBe('none');
    styleCutCanvas(c, {} as VDTPage);
    expect(c.style.backgroundColor).toBe('#ffffff');
    expect(c.style.filter).toBe('');
  });
});
