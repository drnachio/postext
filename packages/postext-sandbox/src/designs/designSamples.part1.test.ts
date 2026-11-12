// The shipped designs on the guide (#1523, #1532): with their own parts, the
// guide paints no more solid pages than alone. The guide's running heads
// paint its blank versos in the part's colour, which only works with its
// own breaks (chapters on versos), so a design that replaces the headings
// leaves the guide its breaks. See designSamples.harness.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDesign, initMathEngine, type Design } from 'postext';
import { guideBook, layOut, moreSolidPages, shippedDesigns, solidPages, stubCanvas, type SampleBook, type SolidCount } from './designSamples.harness.js';

stubCanvas();

describe('the shipped designs on the guide', () => {
  let guide: SampleBook;
  let alone: SolidCount;
  let designs: { id: string; design: Design }[];
  beforeAll(async () => {
    await initMathEngine();
    guide = await guideBook();
    designs = await shippedDesigns();
    alone = solidPages(layOut(guide, guide.config));
  }, 120_000);

  it('ships four designs, and the guide alone paints its cover, its part divider and the verso facing it', () => {
    expect(designs.map((d) => d.id)).toEqual(['magazine', 'manual', 'novel', 'two-colour']);
    expect(alone.blank?.solid).toBeGreaterThan(0);
    expect(alone.part?.solid).toBeGreaterThan(0);
  });

  it('keeps the guide\'s breaks under each design, and paints no page more', () => {
    for (const { id, design } of designs) {
      const config = applyDesign(guide.config, design);
      expect(config.headings?.levels?.find((l) => l.level === 1)?.breakBefore, id).toEqual({ enabled: true, parity: 'even' });
      expect(moreSolidPages(alone, solidPages(layOut(guide, config))), id).toEqual([]);
    }
  }, 300_000);
});
