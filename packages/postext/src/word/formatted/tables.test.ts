import { describe, it, expect } from 'vitest';
import { createDocxPackage } from '../ooxml/package.js';
import { MetricsCache } from './metrics.js';
import { bordersXml } from './tables.js';
import type { WriterContext } from './types.js';

const ctx = {
  pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [],
  docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
  warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
} as WriterContext;

/** The sides a cell's borders stroke. */
function sides(xml: string): string[] {
  return [...xml.matchAll(/<w:(top|left|bottom|right) w:val="single"/g)].map((m) => m[1]!);
}

describe('formatted Word table rules (#1444)', () => {
  const inner = { top: false, left: false, bottom: false, right: false };
  const corner = { top: true, left: true, bottom: false, right: false };
  const table = { borderColor: '#9a978f', borderWidthPx: 1 };

  it('strokes the edges the table style rules, as the PDF draws them', () => {
    expect(sides(bordersXml(ctx, table, inner))).toEqual(['top', 'left', 'bottom', 'right']);
    expect(sides(bordersXml(ctx, { ...table, rules: 'grid' }, inner))).toEqual(['top', 'left', 'bottom', 'right']);
    // Horizontal rules: the top and bottom of every row, no verticals.
    const h = bordersXml(ctx, { ...table, rules: 'horizontal' }, corner);
    expect(sides(h)).toEqual(['top', 'bottom']);
    expect(h).toContain('<w:left w:val="nil"/>');
    // The frame: only the sides on the table's edge.
    expect(sides(bordersXml(ctx, { ...table, rules: 'outer' }, corner))).toEqual(['top', 'left']);
    expect(sides(bordersXml(ctx, { ...table, rules: 'outer' }, inner))).toEqual([]);
    expect(sides(bordersXml(ctx, { ...table, rules: 'none' }, corner))).toEqual([]);
    expect(sides(bordersXml(ctx, { ...table, borderWidthPx: 0 }, corner))).toEqual([]);
  });
});
