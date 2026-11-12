// The shipped designs on the sample books (#1523, #1532): each book, set in
// each design with its own parts, paints no more solid pages than alone.
// See designSamples.harness.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDesign, initMathEngine, type Design } from 'postext';
import { layOut, moreSolidPages, presetBooks, shippedDesigns, solidPages, stubCanvas } from './designSamples.harness.js';

stubCanvas();

describe('the shipped designs on the sample books', () => {
  let designs: { id: string; design: Design }[];
  beforeAll(async () => {
    await initMathEngine();
    designs = await shippedDesigns();
  }, 120_000);

  it('paints no page more in any book', async () => {
    const found: string[] = [];
    for (const book of await presetBooks(2)) {
      const alone = solidPages(layOut(book, book.config));
      for (const { id, design } of designs) {
        for (const more of moreSolidPages(alone, solidPages(layOut(book, applyDesign(book.config, design))))) found.push(`${book.id} in ${id}: ${more}`);
      }
    }
    expect(found).toEqual([]);
  }, 600_000);
});
