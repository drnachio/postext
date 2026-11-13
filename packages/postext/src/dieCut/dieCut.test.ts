import { describe, it, expect } from 'vitest';
import type { ResolvedDieCutsConfig, ResolvedDieShape } from '../types.js';
import type { VDTDieCut, VDTDocument, VDTPage, VDTPathCommand } from '../vdt.js';
import { resolveDieCutsConfig } from '../defaults/dieCuts.js';
import {
  buildDieCuts, configPlacements, dieShapePath, ellipsePath, holesByPage, holesOnPage, leafOutline, leafSide,
  pageBeneath, parsePageList, pathBounds, seeThrough, shapePlacement, type DieCutMetrics,
} from './index.js';

const metrics: DieCutMetrics = { dpi: 72, trimOffset: 0, width: 400, height: 600 };
const mm = (value: number) => ({ value, unit: 'mm' as const });
const px = (value: number) => ({ value, unit: 'px' as const });

const shape = (over: Partial<ResolvedDieShape> = {}): ResolvedDieShape => ({
  id: 'porthole', shape: 'circle', x: px(50), y: px(100), width: px(80), height: px(80), radius: mm(3),
  viewBox: [1, 1], leaves: 1, wrap: { gap: px(6) }, ...over,
});

const docOf = (cuts: (VDTDieCut | undefined)[], offset = 0): Pick<VDTDocument, 'pages' | 'pageIndexOffset'> => ({
  pageIndexOffset: offset,
  pages: cuts.map((dieCut, index) => ({ index, width: 400, height: 600, ...(dieCut ? { dieCut } : {}) }) as unknown as VDTPage),
});

const box = (p: readonly VDTPathCommand[]) => {
  const b = pathBounds(p)!;
  return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
};

describe('die shapes as paths', () => {
  it('lays a rectangle, a rounded one, a circle, an ellipse and path data on the trim', () => {
    const at = { x: px(10), y: px(20), width: px(100), height: px(50) };
    expect(box(dieShapePath(shape({ ...at, shape: 'rect' }), metrics))).toEqual([10, 20, 100, 50]);
    const round = dieShapePath(shape({ ...at, shape: 'roundRect', radius: px(8) }), metrics);
    expect(round.filter((c) => c.op === 'C')).toHaveLength(4);
    expect(box(round)).toEqual([10, 20, 100, 50]);
    // A circle is the largest one the box holds, centred.
    expect(box(dieShapePath(shape({ ...at, shape: 'circle' }), metrics))).toEqual([35, 20, 50, 50]);
    const ellipse = dieShapePath(shape({ ...at, shape: 'ellipse' }), metrics);
    expect(ellipse.filter((c) => c.op === 'C')).toHaveLength(4);
    expect(box(ellipse)).toEqual([10, 20, 100, 50]);
    const star = dieShapePath(shape({ ...at, shape: 'path', d: 'M0.5 0 L1 1 L0 1 Z', viewBox: [1, 1] }), metrics);
    expect(star[0]).toEqual({ op: 'M', x: 60, y: 20 });
    expect(box(star)).toEqual([10, 20, 100, 50]);
  });

  it('measures from the trim, past the bleed and slug', () => {
    const m = { ...metrics, trimOffset: 30, width: 460, height: 660 };
    expect(box(dieShapePath(shape({ shape: 'rect' }), m))).toEqual([80, 130, 80, 80]);
    // Mirrored across the sheet: x' = sheet width − x.
    expect(box(dieShapePath(shape({ shape: 'rect' }), m, true))).toEqual([300, 130, 80, 80]);
  });

  it('a circle is four cubics through its quadrants', () => {
    const c = ellipsePath(0, 0, 100, 100);
    expect(c[0]).toEqual({ op: 'M', x: 100, y: 50 });
    expect(c[2]).toMatchObject({ op: 'C', x: 0, y: 50 });
  });
});

describe('page specs', () => {
  it('reads single pages, ranges and lists', () => {
    expect(parsePageList('5')).toEqual([5]);
    expect(parsePageList('3-6')).toEqual([3, 4, 5, 6]);
    expect(parsePageList('3, 7 ,11-12, x, 0')).toEqual([3, 7, 11, 12]);
  });
});

describe('leaves', () => {
  it('a recto shows the next recto, a verso the verso before; the ends show the board', () => {
    const doc = docOf(new Array(8).fill(undefined));
    expect(leafSide(doc, 0)).toBe('recto');
    expect(leafSide(doc, 3)).toBe('verso');
    expect(pageBeneath(doc, 2)).toBe(4);
    expect(pageBeneath(doc, 3)).toBe(1);
    expect(pageBeneath(doc, 7)).toBe(5);
    expect(pageBeneath(doc, 6)).toBe(-1);
    expect(pageBeneath(doc, 1)).toBe(-1);
    // A chapter that starts on a verso.
    expect(leafSide(docOf([undefined], 1), 0)).toBe('verso');
  });

  it('mirrors a hole on the other side of its leaf', () => {
    const p = shapePlacement(shape({ shape: 'rect' }), 2, metrics);
    const holes = holesByPage([p], 6, metrics);
    expect(holes.map((h) => h.length)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(box(holes[2]![0]!.path)).toEqual([50, 100, 80, 80]);
    expect(box(holes[3]![0]!.path)).toEqual([270, 100, 80, 80]);
    // Placed on a verso: the recto before carries the mirror.
    const v = holesByPage([shapePlacement(shape({ shape: 'rect' }), 3, metrics)], 6, metrics);
    expect(box(v[2]![0]!.path)).toEqual([270, 100, 80, 80]);
    expect(box(v[3]![0]!.path)).toEqual([50, 100, 80, 80]);
  });

  it('leaves: N goes through the next leaves, each side as its own', () => {
    const holes = holesByPage([shapePlacement(shape({ shape: 'rect', leaves: 3 }), 0, metrics)], 8, metrics);
    expect(holes.map((h) => h.length)).toEqual([1, 1, 1, 1, 1, 1, 0, 0]);
    expect(box(holes[4]![0]!.path)).toEqual(box(holes[0]![0]!.path));
    expect(box(holes[5]![0]!.path)).toEqual(box(holes[1]![0]!.path));
    expect(holesOnPage([shapePlacement(shape({ shape: 'rect', leaves: 3 }), 0, metrics)], 5, metrics)).toHaveLength(1);
  });

  it('places config pages by book page number', () => {
    const config = resolveDieCutsConfig({ shapes: [{ ...shape(), wrap: undefined }], pages: [{ pages: '3,6', die: 'porthole' }, { pages: '1', die: 'nope' }] });
    const { placements, unknown } = configPlacements(config, metrics, 10);
    expect(placements.map((p) => p.pageIndex)).toEqual([2, 5]);
    expect(unknown).toEqual(['nope']);
    // A continuation chapter four pages into the book.
    expect(configPlacements(config, metrics, 10, 4).placements.map((p) => p.pageIndex)).toEqual([1]);
  });
});

describe('leaf outline', () => {
  const config = (edges: 'fore' | 'all'): Pick<ResolvedDieCutsConfig, 'corners'> => ({ corners: { radius: px(20), edges } });
  const rounded = (path: VDTPathCommand[]) => path.filter((c) => c.op === 'C').map((c) => (c as { x: number }).x > 200 ? 'right' : 'left');
  it('rounds the fore-edge corners: right on a recto, left on a verso', () => {
    expect(rounded(leafOutline(config('fore'), metrics, 'recto')![0]!)).toEqual(['right', 'right']);
    expect(rounded(leafOutline(config('fore'), metrics, 'verso')![0]!)).toEqual(['left', 'left']);
    expect(rounded(leafOutline(config('fore'), metrics, 'recto', 'right')![0]!)).toEqual(['left', 'left']);
    expect(rounded(leafOutline(config('all'), metrics, 'verso')![0]!)).toHaveLength(4);
  });
  it('stretches an outline to the trim and mirrors it on a verso', () => {
    const outline = { outline: { d: 'M0 0 H0.5 L1 0.5 V1 H0 Z', viewBox: [1, 1] as [number, number] } };
    expect(leafOutline(outline, metrics, 'recto')![0]![1]).toEqual({ op: 'L', x: 200, y: 0 });
    expect(leafOutline(outline, metrics, 'verso')![0]![2]).toEqual({ op: 'L', x: 0, y: 300 });
  });
  it('puts the outline on every page, holes where placed', () => {
    const config = resolveDieCutsConfig({ corners: { radius: px(10) } });
    const cuts = buildDieCuts({ config, metrics, pageCount: 3, placements: [shapePlacement(shape(), 1, metrics)] });
    expect(cuts.map((c) => c?.holes.length)).toEqual([1, 1, 0]);
    expect(cuts.every((c) => c?.outline?.length === 1)).toBe(true);
    expect(cuts[1]!.sources).toEqual(['porthole']);
    expect(cuts[1]!.wrapGapPx).toEqual([6]);
    expect(buildDieCuts({ config: resolveDieCutsConfig({}), metrics, pageCount: 2, placements: [] })).toEqual([undefined, undefined]);
  });
});

describe('seeThrough', () => {
  const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
    { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
  ];
  const cut = (...holes: VDTPathCommand[][]): VDTDieCut => ({ holes, sources: holes.map(() => 'd'), wrapGapPx: holes.map(() => 0) });

  it('walks a tunnel twenty leaves deep and ends on the board', () => {
    // 44 pages; every page holds the same hole: rectos at x 50, versos mirrored.
    const cuts = Array.from({ length: 44 }, (_, i) => cut(i % 2 === 0 ? rect(50, 50, 40, 40) : rect(310, 50, 40, 40)));
    const doc = docOf(cuts);
    const layers = seeThrough(doc, 0);
    expect(layers.map((l) => l.pageIndex)).toEqual([...Array.from({ length: 21 }, (_, k) => 2 * k + 2), -1]);
    expect(layers[0]!.clips).toHaveLength(1);
    expect(layers[20]!.clips).toHaveLength(21);
    expect(seeThrough(doc, 0, 5)).toHaveLength(5);
    // From a verso the walk goes back.
    expect(seeThrough(doc, 7).map((l) => l.pageIndex)).toEqual([5, 3, 1, -1]);
  });

  it('stops on a page whose holes miss the opening', () => {
    const doc = docOf([cut(rect(50, 50, 40, 40)), undefined, cut(rect(200, 200, 40, 40)), undefined, cut(rect(50, 50, 40, 40))]);
    expect(seeThrough(doc, 0).map((l) => l.pageIndex)).toEqual([2]);
    // Holes that overlap in part narrow the opening.
    const doc2 = docOf([cut(rect(50, 50, 40, 40)), undefined, cut(rect(70, 70, 40, 40)), undefined, cut(rect(95, 95, 10, 10)), undefined, undefined]);
    expect(seeThrough(doc2, 0).map((l) => l.pageIndex)).toEqual([2, 4]);
  });

  it('is empty for a page without holes', () => {
    expect(seeThrough(docOf([undefined, undefined]), 0)).toEqual([]);
  });
});
