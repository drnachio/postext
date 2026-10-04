import { describe, expect, it } from "vitest";
import { resolveFolioConfig, type FolioPaperConfig } from "postext";
import { paperSpec } from "./paper";

/** A block of `pages` pages (pages / 2 leaves), in mm. */
const blockMm = (paper: FolioPaperConfig, pages: number) => (pages / 2) * paperSpec(resolveFolioConfig({ paper }).paper).caliperMm;

describe("paperSpec: a block's thickness", () => {
  // Mill data sheets and printers' pages-per-inch tables.
  it("matches printers' PPI tables for uncoated offset", () => {
    // 60 lb (≈ 90 g/m²) uncoated text runs about 440 pages per inch.
    expect(blockMm({ type: "uncoated" }, 440)).toBeCloseTo(25.4, -0.5);
    // 1,000 pages of it: about 5.6 cm.
    expect(blockMm({ type: "uncoated" }, 1000)).toBeCloseTo(56, 0);
  });

  it("follows the sheet's bulk (caliper = grammage × bulk)", () => {
    // Holmen Book Cream 70 g/m², bulk 1.8: 126 µm a leaf.
    expect(blockMm({ type: "bookWove", grammage: 70, bulk: 1.8 }, 2)).toBeCloseTo(0.126, 3);
    // Munken Print Cream 80 g/m², bulk 1.5: 120 µm.
    expect(blockMm({ type: "bookWove", bulk: 1.5 }, 2)).toBeCloseTo(0.12, 3);
  });

  it("makes coated and bible papers thinner for their extent", () => {
    // Coated 115 g/m² sheets run about 90–115 µm.
    for (const type of ["coatedGloss", "coatedSilk", "coatedMatte"] as const) {
      const leaf = blockMm({ type }, 2);
      expect(leaf).toBeGreaterThan(0.09);
      expect(leaf).toBeLessThan(0.12);
    }
    // 2,000 pages of bible paper: a volume about 4.5 cm thick.
    expect(blockMm({ type: "bible" }, 2000)).toBeGreaterThan(40);
    expect(blockMm({ type: "bible" }, 2000)).toBeLessThan(50);
  });
});
