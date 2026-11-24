import { describe, expect, it } from 'vitest';
import { resolveLayoutConfig } from 'postext';
import { dragGuide, snapLength, spreadGap, spreadGuides, typeArea, type SpreadPage } from './spreadGeometry.js';

const MM = 2.83465;
/** 210 × 280 mm, margins 25 / 15 head and foot, 15 inner, 17 outer. */
const page = (mirror: boolean): SpreadPage => ({
  width: 210 * MM,
  height: 280 * MM,
  top: 25 * MM,
  bottom: 15 * MM,
  inner: 15 * MM,
  outer: 17 * MM,
  mirror,
});
const single = resolveLayoutConfig({ layoutType: 'single' });
const double = resolveLayoutConfig({ layoutType: 'double', gutterWidth: { value: 6, unit: 'mm' } });
const triple = resolveLayoutConfig({ layoutType: 'multiple', columnCount: 3, gutterWidth: { value: 4, unit: 'mm' } });

describe('spreadGuides', () => {
  it('gives a lone page four margins, its inner margin on the left', () => {
    const guides = spreadGuides(page(false), single);
    expect(guides.map((g) => g.part)).toEqual(['top', 'bottom', 'inner', 'outer']);
    expect(guides[0]).toMatchObject({ axis: 'y', at: 25 * MM, from: 0, to: 210 * MM });
    expect(guides[1]!.at).toBeCloseTo((280 - 15) * MM);
    expect(guides[2]!.at).toBeCloseTo(15 * MM);
    expect(guides[3]!.at).toBeCloseTo((210 - 17) * MM);
  });
  it('mirrors the margins on a spread: inner margins at the spine', () => {
    const p = page(true);
    const guides = spreadGuides(p, single);
    expect(guides).toHaveLength(8);
    const [left, right] = [guides.filter((g) => !g.spineLeft), guides.filter((g) => g.spineLeft)];
    expect(left.find((g) => g.part === 'inner')!.at).toBeCloseTo((210 - 15) * MM);
    expect(left.find((g) => g.part === 'outer')!.at).toBeCloseTo(17 * MM);
    const x = p.width + spreadGap(p.width);
    expect(right.find((g) => g.part === 'inner')!.at).toBeCloseTo(x + 15 * MM);
    expect(right.find((g) => g.part === 'outer')!.at).toBeCloseTo(x + (210 - 17) * MM);
  });
  it('adds the gutter at the second column\'s edge, and none to vertical text', () => {
    const guides = spreadGuides(page(false), double);
    const gutter = guides.find((g) => g.part === 'gutter')!;
    // Type area 178 mm: columns of 86, the second starts 15 + 86 + 6.
    expect(gutter.at).toBeCloseTo((15 + 86 + 6) * MM);
    expect(gutter.from).toBeCloseTo(25 * MM);
    expect(spreadGuides(page(false), { ...double, writingMode: 'vertical-rl' }).some((g) => g.part === 'gutter')).toBe(false);
  });
});

describe('dragGuide', () => {
  it('reads a margin off the pointer, from the page edge it is measured from', () => {
    const p = page(true);
    const guides = spreadGuides(p, single);
    const of = (part: string, spineLeft: boolean) => guides.find((g) => g.part === part && g.spineLeft === spineLeft)!;
    expect(dragGuide(of('top', false), 0, 30 * MM, p, single)).toBeCloseTo(30 * MM);
    expect(dragGuide(of('bottom', false), 0, (280 - 20) * MM, p, single)).toBeCloseTo(20 * MM);
    // Left page: the outer margin from its left edge, the inner from its right.
    expect(dragGuide(of('outer', false), 22 * MM, 0, p, single)).toBeCloseTo(22 * MM);
    expect(dragGuide(of('inner', false), (210 - 12) * MM, 0, p, single)).toBeCloseTo(12 * MM);
    const x = p.width + spreadGap(p.width);
    expect(dragGuide(of('inner', true), x + 12 * MM, 0, p, single)).toBeCloseTo(12 * MM);
    expect(dragGuide(of('outer', true), x + (210 - 22) * MM, 0, p, single)).toBeCloseTo(22 * MM);
  });
  it('keeps a type area on the page', () => {
    const p = page(false);
    const [top] = spreadGuides(p, single);
    expect(dragGuide(top!, 0, -40, p, single)).toBe(0);
    // No more than leaves a fifth of the height between head and foot.
    expect(dragGuide(top!, 0, 1e6, p, single)).toBeCloseTo(280 * MM * 0.8 - 15 * MM);
  });
  it('reads the gutter off the second column\'s edge, whatever the columns', () => {
    const p = page(false);
    for (const [layout, n] of [[double, 2], [triple, 3]] as const) {
      const gutter = spreadGuides(p, layout).find((g) => g.part === 'gutter')!;
      // Where the edge would be with a gutter of 10 mm.
      const column = (178 - (n - 1) * 10) / n;
      expect(dragGuide(gutter, (15 + column + 10) * MM, 0, p, layout)).toBeCloseTo(10 * MM);
    }
  });
});

describe('snapLength', () => {
  it('snaps to the step of the unit, or to a hundredth', () => {
    expect(snapLength(25.3 * MM, 'mm')).toBe(25.5);
    expect(snapLength(25.3 * MM, 'mm', true)).toBe(25.3);
    expect(snapLength(2.53 * 28.3465, 'cm')).toBe(2.55);
    expect(snapLength(36.4, 'pt')).toBe(36);
  });
});

describe('typeArea', () => {
  it('measures the type area, its columns and the lines it holds', () => {
    expect(typeArea(page(true), single, 12)).toMatchObject({ columns: 1 });
    const area = typeArea(page(true), double, 11.5);
    expect(area.width / MM).toBeCloseTo(178);
    expect(area.height / MM).toBeCloseTo(240);
    expect(area.columns).toBe(2);
    expect(area.columnWidth / MM).toBeCloseTo(86);
    expect(area.lines).toBe(Math.floor((240 * MM) / 11.5));
  });
});
