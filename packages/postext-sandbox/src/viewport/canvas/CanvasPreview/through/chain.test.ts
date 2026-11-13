import { describe, expect, it } from 'vitest';
import type { VDTDieCut, VDTDocument, VDTPage, VDTPathCommand } from 'postext';
import { hiddenScale, paintOrder, throughChain, throughPaintKey } from './chain.js';

// The see-through chain of the Canvas viewer (#1567): which pages a holed
// page shows, the order they are painted in and what repaints with what.

const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
  { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
];
const cut = (...holes: VDTPathCommand[][]): VDTDieCut => ({ holes, sources: holes.map(() => 'd'), wrapGapPx: holes.map(() => 0) });
const docOf = (cuts: (VDTDieCut | undefined)[], pageIndexOffset = 0) => ({
  pageIndexOffset,
  pages: cuts.map((dieCut, index) => ({ index, width: 400, height: 600, ...(dieCut ? { dieCut } : {}) }) as unknown as VDTPage),
}) as unknown as VDTDocument;

/** A tunnel book: every page of `n` cut with a hole a little smaller than
 *  the one before it, centred, so each shows every page under it. */
const tunnel = (n: number) => docOf(Array.from({ length: n }, (_, i) => {
  const r = 180 - i * 3;
  return cut(rect(200 - r, 300 - r, 2 * r, 2 * r));
}));

describe('throughChain', () => {
  it('is undefined for a book without holes', () => {
    expect(throughChain(docOf([undefined, undefined, { holes: [], outline: [rect(0, 0, 300, 600)], sources: [], wrapGapPx: [] }]))).toBeUndefined();
  });

  it('a recto shows the rectos after it, a verso the versos before it', () => {
    const chain = throughChain(tunnel(8))!;
    expect(chain.seen.get(0)).toEqual([2, 4, 6]);
    expect(chain.seen.get(5)).toEqual([3, 1]);
    expect(chain.seen.get(6)).toEqual([]);
    expect(chain.dependents.get(4)).toEqual([2, 0]);
    expect(chain.dependents.get(1)).toEqual([3, 5, 7]);
  });

  it('a chapter that starts on a verso pairs its pages the other way', () => {
    const chain = throughChain(docOf([cut(rect(10, 10, 50, 50)), undefined, cut(rect(10, 10, 50, 50)), undefined], 1))!;
    // Page 0 is a verso: nothing before it in this document.
    expect(chain.seen.get(0)).toEqual([]);
    expect(chain.seen.get(2)).toEqual([0]);
  });

  it('stops where the holes stop lining up, and follows what the pages beneath show', () => {
    // Page 0 shows page 2; page 2's other hole, off page 0's, shows page 4.
    const doc = docOf([cut(rect(0, 0, 50, 50)), undefined, cut(rect(300, 500, 50, 50), rect(0, 300, 10, 10)), undefined, undefined]);
    const chain = throughChain(doc)!;
    expect(chain.seen.get(0)).toEqual([2]);
    expect(chain.seen.get(2)).toEqual([4]);
    expect(chain.reach.get(0)).toEqual([2, 4]);
    expect(chain.dependents.get(4)).toEqual([2, 0]);
  });

  it('walks a 20-leaf tunnel to its end', () => {
    const chain = throughChain(tunnel(40))!;
    expect(chain.seen.get(0)).toHaveLength(19);
    expect(chain.dependents.get(38)).toHaveLength(19);
  });
});

describe('paintOrder', () => {
  it('paints every page after the pages it shows', () => {
    const doc = tunnel(8);
    const chain = throughChain(doc)!;
    const order = paintOrder(doc, [0, 1, 2, 3, 4, 5, 6, 7], chain);
    for (const [i, seen] of chain.reach) for (const j of seen) expect(order.indexOf(j)).toBeLessThan(order.indexOf(i));
  });
  it('leaves the order alone without a chain', () => {
    expect(paintOrder(docOf([undefined, undefined]), [1, 0], undefined)).toEqual([1, 0]);
  });
});

describe('throughPaintKey', () => {
  const doc = docOf([cut(rect(0, 0, 50, 50)), undefined, cut(rect(0, 0, 50, 50)), undefined, undefined]);
  const chain = throughChain(doc);
  it('carries the keys of the pages a page shows', () => {
    expect(throughPaintKey(doc, 0, chain, (p) => `k${p.index}`)).toBe('2:k2/4:k4');
  });
  it("changes when a page beneath does", () => {
    const a = throughPaintKey(doc, 0, chain, (p) => `k${p.index}`);
    const b = throughPaintKey(doc, 0, chain, (p) => (p.index === 4 ? 'new' : `k${p.index}`));
    expect(a).not.toBe(b);
  });
  it("is '' for a page that shows nothing, undefined when a page beneath has no key", () => {
    expect(throughPaintKey(doc, 1, chain, () => 'k')).toBe('');
    expect(throughPaintKey(doc, 0, chain, () => undefined)).toBeUndefined();
  });
});

describe('hiddenScale', () => {
  it('is half the bitmap scale, within bounds', () => {
    expect(hiddenScale(1)).toBe(0.5);
    expect(hiddenScale(0.4)).toBe(0.35);
    expect(hiddenScale(0.2)).toBe(0.2);
  });
});
