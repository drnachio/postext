// The designs of the sample books on the guide (#1523, #1532): with every
// part, and with every part but the running heads (the guide keeps its
// blank-page band), the guide paints no more solid pages than alone. See
// designSamples.harness.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDesign, extractDesign, initMathEngine, type DesignPart } from 'postext';
import { guideBook, layOut, moreSolidPages, presetBooks, solidPages, stubCanvas, type SampleBook, type SolidCount } from './designSamples.harness.js';

stubCanvas();

describe('the sample books\' designs on the guide', () => {
  let guide: SampleBook;
  let alone: SolidCount;
  beforeAll(async () => {
    await initMathEngine();
    guide = await guideBook(3);
    alone = solidPages(layOut(guide, guide.config));
  }, 120_000);

  it('paints no page more, with or without the design\'s running heads', async () => {
    const found: string[] = [];
    for (const book of await presetBooks(0)) {
      const design = extractDesign(book.design);
      const butRunning: DesignPart[] = design.parts.filter((p) => p !== 'running');
      for (const parts of [design.parts, butRunning]) {
        const config = applyDesign(guide.config, design, parts);
        try {
          for (const more of moreSolidPages(alone, solidPages(layOut(guide, config)))) found.push(`${book.id} (${parts.length} parts): ${more}`);
        } catch (e) {
          found.push(`${book.id} (${parts.length} parts): ${String(e)}`);
        }
      }
    }
    expect(found).toEqual([]);
  }, 600_000);
});
