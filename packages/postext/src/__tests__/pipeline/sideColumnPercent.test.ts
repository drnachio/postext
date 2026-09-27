import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { SIDE_COLUMN_MIN_SHARE } from '../../pipeline/config';
import { collectConfigWarnings } from '../../configWarnings';
import { createMeasurementCache } from '../../measure';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults/layout';
import type { VDTDocument, VDTPage } from '../../vdt';
import type { LayoutConfig, PostextConfig } from '../../types';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const MD = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the column.`).join('\n\n');

/** A 120 mm page with 10 mm margins: a 100 mm measure, and the default
 *  7.5 mm gutter — 7.5 % of it. */
const config = (layout: LayoutConfig, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(100), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  layout,
  ...extra,
});
const build = (cfg: PostextConfig, markdown = MD): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());
const oneAndHalf = (sideColumnPercent: number): PostextConfig => config({ layoutType: 'oneAndHalf', sideColumnPercent });

/** Main and side column widths of a page, as shares of its measure (%). */
function shares(page: VDTPage): { main: number; side: number } {
  const [main, side] = page.columns;
  const content = page.contentArea.width;
  return { main: (main!.bbox.width / content) * 100, side: (side!.bbox.width / content) * 100 };
}

describe('layout.sideColumnPercent bounds (EF-48)', () => {
  it('lays out any value that leaves both columns some width exactly as written', () => {
    for (const percent of [3, 14, 33, 50, 60, 85]) {
      const doc = build(oneAndHalf(percent));
      const { main, side } = shares(doc.pages[0]!);
      expect(side).toBeCloseTo(percent, 6);
      expect(main).toBeCloseTo(100 - percent - 7.5, 6);
      expect(doc.configWarnings).toBeUndefined();
    }
  });

  it('clamps a value that would leave a column with no width: each column keeps 1 % of the measure', () => {
    expect(SIDE_COLUMN_MIN_SHARE).toBe(1);
    for (const percent of [0, -10]) {
      const { main, side } = shares(build(oneAndHalf(percent)).pages[0]!);
      expect(side).toBeCloseTo(1, 6);
      expect(main).toBeCloseTo(100 - 1 - 7.5, 6);
    }
    for (const percent of [92, 100, 120]) {
      const { main, side } = shares(build(oneAndHalf(percent)).pages[0]!);
      expect(main).toBeCloseTo(1, 6);
      expect(side).toBeCloseTo(100 - 7.5 - 1, 6);
    }
  });

  it('reports each clamp once on doc.configWarnings, never on the page-bound warnings', () => {
    const doc = buildDocument({ markdown: Array(8).fill(MD).join('\n\n') }, oneAndHalf(-5), createMeasurementCache());
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(doc.configWarnings).toEqual([
      { kind: 'sideColumnPercentClamped', path: 'layout.sideColumnPercent', value: '-5', used: '1' },
    ]);
    expect(doc.warnings).toBeUndefined();
    // The same list without laying anything out.
    expect(collectConfigWarnings(oneAndHalf(-5))).toEqual(doc.configWarnings);
    expect(collectConfigWarnings(oneAndHalf(120))).toEqual([
      { kind: 'sideColumnPercentClamped', path: 'layout.sideColumnPercent', value: '120', used: '91.5' },
    ]);
  });

  it("checks a heading style's own layout on its own page margins", () => {
    // A 70 mm measure (30 mm inner margin): 85 % would leave the main column
    // 70 × (100 − 85) % − 7.5 mm = 3 mm, so it stands; 95 % would not.
    const style = (sideColumnPercent: number): PostextConfig => config({ layoutType: 'double' }, {
      headingStyles: [
        { id: 'plain' },
        { id: 'notes', margins: { left: mm(30), right: mm(20) }, layout: { layoutType: 'oneAndHalf', sideColumnPercent } },
      ],
    });
    const md = `# Notes {style="notes"}\n\n${MD}`;
    const fits = build(style(85), md);
    expect(fits.configWarnings).toBeUndefined();
    expect(shares(fits.pages[0]!).side).toBeCloseTo(85, 6);
    const clamped = build(style(95), md);
    // 7.5 mm of a 70 mm measure is 10.71 % of it.
    const used = 100 - (7.5 / 70) * 100 - 1;
    expect(clamped.configWarnings).toEqual([
      { kind: 'sideColumnPercentClamped', path: 'headingStyles[1].layout.sideColumnPercent', value: '95', used: String(Math.round(used * 100) / 100) },
    ]);
    expect(shares(clamped.pages[0]!).main).toBeCloseTo(1, 6);
  });

  it('reads a numeric string as its number; a value that is not a number takes the default', () => {
    const numeric = build(oneAndHalf('30' as unknown as number));
    expect(shares(numeric.pages[0]!).side).toBeCloseTo(30, 6);
    expect(numeric.configWarnings).toBeUndefined();
    const garbage = build(oneAndHalf('wide' as unknown as number));
    expect(shares(garbage.pages[0]!).side).toBeCloseTo(33, 6);
    expect(garbage.configWarnings).toEqual([
      { kind: 'sideColumnPercentClamped', path: 'layout.sideColumnPercent', value: 'wide', used: '33' },
    ]);
  });

  it('stays silent for a layout that has no side column, and for no config', () => {
    expect(build(config({ layoutType: 'double', sideColumnPercent: 120 })).configWarnings).toBeUndefined();
    expect(collectConfigWarnings(undefined)).toEqual([]);
    expect(collectConfigWarnings({})).toEqual([]);
  });

  it('resolve and strip keep the value as written (the warning reports the clamp)', () => {
    expect(resolveLayoutConfig({ sideColumnPercent: 120 }).sideColumnPercent).toBe(120);
    expect(stripLayoutDefaults({ sideColumnPercent: 120 })).toEqual({ sideColumnPercent: 120 });
  });
});
