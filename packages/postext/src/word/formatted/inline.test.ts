import { describe, it, expect } from 'vitest';
import type { DisplayItem, DisplayLine, DisplayPage, DisplayRun } from '../../paint/displayList/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { WORDML_NAMESPACES } from '../ooxml/constants.js';
import { MetricsCache } from './metrics.js';
import { chipBoxRuns, swatchShapeRuns } from './inlineShapes.js';
import { textItemRuns } from './text.js';
import { pageRuns } from './page.js';
import { emu } from './units.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

function context(): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const wrap = (inner: string): string => `<w:document ${WORDML_NAMESPACES}><w:body><w:p>${inner}</w:p></w:body></w:document>`;
const offsets = (xml: string): number[] => [...xml.matchAll(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/g)].map((m) => Number(m[1]));

function lineOf(runs: DisplayRun[], over: Partial<DisplayLine> = {}): DisplayLine {
  const text = runs.map((r) => r.text).join('');
  return { text, x: 10, width: 200, baseline: 40, lineHeight: 14, align: 'left', runs, map: text.split('').map((_, i) => i), ...over };
}

const SERIF = '400 12px "Lora"';
const MONO = '400 11px "Geist Mono"';

describe('inline chips and swatches in the formatted writer (#1406)', () => {
  const chip: DisplayRun = {
    text: 'Enter', x: 50, width: 45, fontString: MONO, color: '#aa0000', textStart: 4,
    inline: { kind: 'chip', widthPx: 45, heightPx: 14, ascentPx: 10, box: { dx: 1, width: 43, ascent: 10, descent: 4, fill: '#eeeeee', stroke: '#999999', strokeWidthPx: 1, radius: 3 } },
  };
  const swatch: DisplayRun = {
    text: '⁠', x: 120, width: 10, fontString: SERIF, color: '#000000', textStart: 9,
    inline: { kind: 'swatch', widthPx: 10, heightPx: 8, swatch: { color: '#ff0000', ink: '#00ff00', side: 8, borderWidth: 1 } },
  };
  const line = lineOf([{ text: 'See ', x: 10, width: 40, fontString: SERIF, color: '#000000', textStart: 0 }, chip, { text: 'key', x: 95, width: 25, fontString: SERIF, color: '#000000', textStart: 9 }, swatch]);

  it('draws a chip box stroked inside its edge', () => {
    const ctx = context();
    const [box] = chipBoxRuns(ctx, [line], { x: 0, y: 0 }, undefined);
    expect(box).toContain('prst="roundRect"');
    expect(box).toContain('val="EEEEEE"');
    expect(box).toContain('val="999999"');
    // Inset by half the stroke: x = 50 + 1 + 0.5, y = 40 - 10 + 0.5.
    expect(offsets(box!)).toEqual([emu(51.5, 72), emu(30.5, 72)]);
    expect(xmlProblems(wrap(box!))).toEqual([]);
  });

  it('draws a swatch in its colour, outlined in its ink, at its real shape', () => {
    const ctx = context();
    const [sq] = swatchShapeRuns(ctx, [line], { x: 0, y: 0 }, undefined);
    expect(sq).toContain('val="FF0000"');
    expect(sq).toContain('val="00FF00"');
    // Side 8 standing on the baseline, inset by half its 1 px outline.
    expect(offsets(sq!)).toEqual([emu(120.5, 72), emu(32.5, 72)]);
    expect(sq).toContain(`<wp:extent cx="${emu(7, 72)}" cy="${emu(7, 72)}"/>`);
  });

  it('puts the chip box under the text box and the chip words in their own face', async () => {
    const ctx = context();
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 10, y: 26, width: 200, height: 18 }, lines: [line] };
    const runs = await textItemRuns(ctx, item);
    const box = runs.findIndex((r) => r.includes('name="ptx box') && r.includes('EEEEEE'));
    const text = runs.findIndex((r) => r.includes('<wps:txbx>'));
    expect(box).toBeGreaterThanOrEqual(0);
    expect(box).toBeLessThan(text);
    expect(runs[text]).toContain('Geist Mono');
    expect(runs[text]).toContain('<w:color w:val="AA0000"/>');
    // The swatch drawn once, in its colour, after the text.
    const squares = runs.filter((r) => r.includes('FF0000'));
    expect(squares).toHaveLength(1);
    expect(runs.indexOf(squares[0]!)).toBeGreaterThan(text);
    for (const r of runs) expect(xmlProblems(wrap(r))).toEqual([]);
  });
});

describe('vector overlays on a formatted page (#1406)', () => {
  it('writes QR modules and play marks the display list holds', async () => {
    const ctx = context();
    const page: DisplayPage = {
      index: 0, width: 400, height: 600, dpi: 72,
      items: [
        { kind: 'rect', rect: { x: 10, y: 10, width: 200, height: 120 }, fill: '#1f1f1f' },
        { kind: 'path', bbox: { x: 90, y: 50, width: 40, height: 40 }, subpaths: [[{ op: 'M', x: 130, y: 70 }, { op: 'C', x1: 130, y1: 80, x2: 120, y2: 90, x: 110, y: 90 }, { op: 'Z' }]], fill: '#2244ccb3' },
        { kind: 'path', bbox: { x: 150, y: 60, width: 30, height: 30 }, subpaths: [[{ op: 'M', x: 152, y: 62 }, { op: 'L', x: 154, y: 62 }, { op: 'L', x: 154, y: 64 }, { op: 'L', x: 152, y: 64 }, { op: 'Z' }]], fill: '#000000' },
      ],
    };
    const runs = await pageRuns(ctx, page);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toContain('1F1F1F');
    expect(runs[1]).toContain('<a:alpha val=');
    expect(runs[2]).toContain('<a:custGeom>');
    for (const r of runs) expect(xmlProblems(wrap(r))).toEqual([]);
  });
});
