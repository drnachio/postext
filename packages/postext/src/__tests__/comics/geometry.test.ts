import { describe, it, expect } from 'vitest';
import { comicGeometry, pointInPolygon } from '../../comics/geometry';
import { parseComicSplit } from '../../comics/split';
import { comicPanelPadding, comicPageDirection, parseComicDimension } from '../../comics/layoutPage';
import { resolveComicsConfig } from '../../defaults/comics';
import { resolveAllConfig } from '../../pipeline/config';

const frame = { x: 100, y: 100, width: 1000, height: 1000 };
const bleedBox = { x: 0, y: 0, width: 1200, height: 1200 };
const r = (n: number) => Math.round(n * 100) / 100;

function geo(split: string, opts: { direction?: 'ltr' | 'rtl'; rows?: number; columns?: number; bleed?: (i: number) => ('top' | 'bottom' | 'left' | 'right')[] } = {}) {
  return comicGeometry({
    tree: parseComicSplit(split).tree,
    frame,
    bleedBox,
    direction: opts.direction ?? 'ltr',
    gutter: { rows: opts.rows ?? 0, columns: opts.columns ?? 0 },
    ...(opts.bleed ? { bleed: opts.bleed } : {}),
  });
}

describe('comicGeometry', () => {
  it('cuts the owner example into four cells in reading order', () => {
    const { cells, lines } = geo('30 [30 | 20 | *] / *');
    expect(cells.map((c) => [c.bbox.x, c.bbox.y, c.bbox.width, c.bbox.height].map(r))).toEqual([
      [100, 100, 300, 300],
      [400, 100, 200, 300],
      [600, 100, 500, 300],
      [100, 400, 1000, 700],
    ]);
    expect(cells.every((c) => c.rect)).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ path: [], boundary: 0, axis: 'rows', startPercent: 30, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } });
    expect(lines[1]).toMatchObject({ path: [0], boundary: 0, axis: 'columns', parent: { x: 100, y: 100, width: 1000, height: 300 }, min: 5, max: 45 });
  });

  it('takes half of each gutter off both sides of a line, rows and columns apart', () => {
    const { cells, lines } = geo('30 [30 | 20 | *] / *', { rows: 40, columns: 20 });
    // The tier line at 400 leaves 20 px on each side; column lines 10 px.
    expect(r(cells[0]!.bbox.height)).toBe(280);
    expect(r(cells[3]!.bbox.y)).toBe(420);
    expect(r(cells[0]!.bbox.width)).toBe(290);
    expect(r(cells[1]!.bbox.x)).toBe(410);
    expect(r(cells[1]!.bbox.width)).toBe(180);
    expect(lines[0]!.gutter).toBe(40);
    expect(lines[1]!.gutter).toBe(20);
  });

  it('lays the columns out from the right when the page reads right to left', () => {
    const ltr = geo('50 [30 | *] / *');
    const rtl = geo('50 [30 | *] / *', { direction: 'rtl' });
    expect(r(ltr.cells[0]!.bbox.x)).toBe(100);
    expect(r(rtl.cells[0]!.bbox.x)).toBe(800);
    expect(r(rtl.cells[0]!.bbox.width)).toBe(300);
    expect(r(rtl.cells[1]!.bbox.x)).toBe(100);
    // Tiers never mirror.
    expect(r(rtl.cells[2]!.bbox.y)).toBe(600);
    expect(rtl.lines[1]!.a.x).toBeCloseTo(800, 6);
  });

  it('slants a line and keeps its gutter across it', () => {
    const { cells, lines } = geo('* [40~60 | *] / 35', { columns: 20 });
    const first = cells[0]!;
    expect(first.rect).toBe(false);
    expect(lines[1]).toMatchObject({ axis: 'columns', startPercent: 40, endPercent: 60 });
    // The line runs from x=500 at the top of the tier to x=700 at its foot
    // (the tier is 650 tall); the first cell ends 10 px across it.
    const line = lines[1]!;
    const dx = line.b.x - line.a.x;
    const dy = line.b.y - line.a.y;
    const len = Math.hypot(dx, dy);
    for (const p of first.polygon) {
      const cross = ((p.x - line.a.x) * dy - (p.y - line.a.y) * dx) / len;
      // Every vertex on the start side, at least 10 px away.
      expect(Math.abs(cross)).toBeGreaterThanOrEqual(10 - 1e-6);
    }
    // Mirrored, the slant mirrors too.
    const rtl = geo('* [40~60 | *] / 35', { direction: 'rtl' });
    expect(rtl.lines[1]!.a.x).toBeCloseTo(700, 6);
    expect(rtl.lines[1]!.b.x).toBeCloseTo(500, 6);
  });

  it('runs a bleeding panel out to the bleed box on the frame sides it touches', () => {
    const { cells } = geo('30 [30 | 20 | *] / *', { rows: 20, bleed: (i) => (i === 3 ? ['top', 'bottom', 'left', 'right'] : []) });
    const last = cells[3]!;
    expect(last.touches.sort()).toEqual(['bottom', 'left', 'right']);
    expect([last.bbox.x, last.bbox.width, last.bbox.y + last.bbox.height].map(r)).toEqual([0, 1200, 1200]);
    // Its inner side keeps the gutter.
    expect(r(last.bbox.y)).toBe(410);
    // The others stay in the frame.
    expect(r(cells[0]!.bbox.x)).toBe(100);
  });

  it('tells whether a point is inside a cell', () => {
    const { cells } = geo('* [40~60 | *] / 35');
    expect(pointInPolygon(cells[0]!.polygon, { x: 150, y: 150 })).toBe(true);
    expect(pointInPolygon(cells[0]!.polygon, { x: 900, y: 150 })).toBe(false);
  });
});

describe('panel padding and reading direction', () => {
  it('reads pad like CSS, start and end following the direction', () => {
    const cell = { width: 400, height: 200 };
    expect(comicPanelPadding('0 12%', cell, 'ltr', 96)).toEqual({ top: 0, right: 48, bottom: 0, left: 48 });
    expect(comicPanelPadding('10px 20px 30px 40px', cell, 'ltr', 96)).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
    expect(comicPanelPadding('10px 20px 30px 40px', cell, 'rtl', 96)).toEqual({ top: 10, right: 40, bottom: 30, left: 20 });
    expect(comicPanelPadding('nonsense', cell, 'ltr', 96)).toBeUndefined();
    expect(parseComicDimension('4mm')).toEqual({ value: 4, unit: 'mm' });
    expect(parseComicDimension('3')).toEqual({ value: 3, unit: 'mm' });
  });

  it("reads auto as right to left in a right-to-left document, else as the art's direction", () => {
    const page = { attrs: {} };
    const en = resolveAllConfig({ locale: 'en' });
    const ar = resolveAllConfig({ locale: 'ar' });
    const ja = resolveAllConfig({ locale: 'ja', layout: { writingMode: 'vertical-rl' } });
    const western = resolveComicsConfig(undefined, 'ja');
    const manga = resolveComicsConfig({ artDirection: 'rtl' }, 'en');
    expect(comicPageDirection(page, western, en)).toBe('ltr');
    expect(comicPageDirection(page, western, ja)).toBe('ltr');
    expect(comicPageDirection(page, western, ar)).toBe('rtl');
    expect(comicPageDirection(page, manga, en)).toBe('rtl');
    expect(comicPageDirection({ attrs: { direction: 'ltr' } }, manga, en)).toBe('ltr');
    expect(comicPageDirection(page, resolveComicsConfig({ readingDirection: 'rtl' }), en)).toBe('rtl');
  });
});
