import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync as exists, readFileSync as readFile } from 'node:fs';
import type { DisplayItem, DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { haloRun } from './halo.js';
import { MetricsCache } from './metrics.js';
import { emitGroups, planChunks, planLines } from './paragraphs.js';
import { fitSpacing, leadChip, type FitCarry } from './runs.js';
import { pathRun, sameTurn } from './shapes.js';
import { mergeBands, roundedOutline } from './tableFills.js';
import { tableParts } from './tables.js';
import type { WriterContext } from './types.js';

type TableItem = Extract<DisplayItem, { kind: 'table' }>;
type TextItem = Extract<DisplayItem, { kind: 'text' }>;

function context(plan?: WordFontPlan): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan, lang: 'en', metrics: new MetricsCache(plan), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const box = (x: number, y: number, w: number, h: number, dir = 1): VDTPathCommand[] => (dir > 0
  ? [{ op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' }]
  : [{ op: 'M', x, y }, { op: 'L', x, y: y + h }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x: x + w, y }, { op: 'Z' }]);

const pathsIn = (xml: string): number => (xml.match(/<a:path /g) ?? []).length;

describe('formatted Word export, round three (#1444)', () => {
  it('fills overlapping subpaths that turn one way as their union (a balloon and its tail)', () => {
    const ctx = context();
    const bbox = { x: 0, y: 0, width: 30, height: 30 };
    const balloon = pathRun(ctx, { kind: 'path', bbox, subpaths: [box(0, 0, 20, 20), box(10, 10, 20, 20)], fill: '#fff' });
    expect(pathsIn(balloon)).toBe(2);
    // A ring (outside one way, hole the other) keeps its hole.
    const ring = pathRun(ctx, { kind: 'path', bbox, subpaths: [box(0, 0, 30, 30), box(10, 10, 10, 10, -1)], fill: '#000' });
    expect(pathsIn(ring)).toBe(1);
    expect(sameTurn([box(0, 0, 1, 1)])).toBe(false);
  });

  it('merges the fills of cells side by side and stacked into bands', () => {
    const cells = [0, 1, 2].flatMap((r) => [0, 1].map((c) => ({ x: c * 50, y: r * 20, width: 50, height: 20 })));
    expect(mergeBands(cells)).toEqual([{ x: 0, y: 0, width: 100, height: 60 }]);
    expect(mergeBands([{ x: 0, y: 0, width: 50, height: 20 }, { x: 60, y: 0, width: 50, height: 20 }])).toHaveLength(2);
    const outline = roundedOutline({ x: 0, y: 0, width: 100, height: 40 }, [5, 0, 0, 5]);
    expect(outline.filter((c) => c.op === 'C')).toHaveLength(2);
  });

  const cell = (row: number, col: number, background?: string): TableItem['cells'][number] => ({
    row, col, rowSpan: 1, colSpan: 1, rect: { x: 10 + col * 100, y: 10 + row * 20, width: 100, height: 20 }, item: null, ...(background ? { background } : {}),
  });
  const table = (over: Partial<TableItem>, cells: TableItem['cells']): TableItem => ({
    kind: 'table', rect: { x: 10, y: 10, width: 300, height: 40 }, columnEdges: [0, 100, 200, 300], rowEdges: [0, 20, 40], cells, borderColor: '#888888', borderWidthPx: 1, ...over,
  });

  it('draws a header band under its shaded cells, so no seam shows between them', async () => {
    const cells = [cell(0, 0, '#15171c'), cell(0, 1, '#15171c'), cell(0, 2, '#15171c'), cell(1, 0), cell(1, 1), cell(1, 2)];
    const parts = await tableParts(context(), table({ rules: 'horizontal' }, cells), true);
    expect(parts.float!.xml.match(/w:fill="15171C"/g)).toHaveLength(3);
    expect(parts.under).toHaveLength(1);
    expect(parts.under[0]).toMatch(/<a:solidFill><a:srgbClr val="15171C"/);
  });

  it('draws a rounded table\'s fills and frame as rounded shapes, its cells unshaded', async () => {
    const cells = [cell(0, 0, '#fbeff1'), cell(0, 1, '#fbeff1'), cell(0, 2, '#fbeff1'), cell(1, 0, '#fbeff1'), cell(1, 1, '#fbeff1'), cell(1, 2, '#fbeff1')];
    const parts = await tableParts(context(), table({ frameRadii: [6, 6, 6, 6] }, cells), true);
    const xml = parts.float!.xml;
    expect(xml).not.toContain('w:fill=');
    // Inner rules stay with the cells; the outer ones are the frame shape.
    expect(xml).toContain('<w:top w:val="nil"/>');
    expect(xml).toContain('<w:right w:val="single"');
    expect(parts.under).toHaveLength(2);
    expect(parts.under[0]).toContain('<a:cubicBezTo>');
    expect(parts.under[1]).toMatch(/<a:ln w="\d+">/);
  });

  it('carries what each run\'s fit floors away along the line', () => {
    const ctx = context();
    const carry: FitCarry = { tw: 0 };
    let total = 0;
    // Thirty runs of 7.33 px (146.6 twips): floored alone they lose 18 twips.
    for (let i = 0; i < 30; i++) {
      const fit = fitSpacing(ctx, 7.33, 100, 3, carry);
      carry.tw = fit.rest ?? 0;
      total += 100 + fit.each * 3 + fit.extra;
    }
    const exact = (30 * 7.33 * 1440) / 72;
    expect(total).toBeLessThanOrEqual(exact);
    expect(exact - total).toBeLessThan(1);
  });

  const run = (text: string, x: number, width: number, over: Partial<DisplayRun> = {}): DisplayRun => ({ text, x, width, fontString: '12px "Lora"', color: '#000', textStart: 0, ...over });

  it('keeps a badge\'s number inside its box on a justified line too', () => {
    const chip = run('1', 0, 16, { inline: { kind: 'chip', widthPx: 16, heightPx: 12 }, padStart: 5, padEnd: 4 });
    const words = run(' Which of these', 16, 80);
    const line: DisplayLine = { text: '1 Which of these', x: 0, width: 96, baseline: 20, lineHeight: 14, align: 'justify', runs: [chip, words], map: [] };
    expect(leadChip(line)).toEqual({ run: chip, lone: false });
  });

  it('opens a vertical line that starts with a ruby with a generated zero-width space', () => {
    const ctx = context();
    const v = (text: string, x: number, over: Partial<DisplayRun> = {}): DisplayRun => run(text, 0, 24 * text.length, over);
    const line = (runs: DisplayRun[], baseline: number): DisplayLine => {
      const text = runs.map((r) => r.text).join('');
      return { text, x: 0, width: 24 * text.length, baseline, lineHeight: 30, align: 'left', runs, map: [...text].map((_, i) => i), vertical: true };
    };
    const lines = [line([v('装幀', 0)], 30), line([v('悉', 0, { ruby: { text: 'ことごと', fontString: '6px "Lora"', position: 'over' } }), { ...v('く', 24), x: 24 }], 60)];
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 0, y: 0, width: 48, height: 70 }, lines, source: { blockKey: 'b', map: [] } };
    const plans = planLines(ctx, lines);
    const chunks = planChunks(lines, plans);
    expect(chunks).toHaveLength(1);
    const out = emitGroups(ctx, item, chunks[0]!.groups, 0, 48, { offsets: [0, 2] });
    expect(out.xml).toContain('<w:r><w:br/><w:t>​</w:t></w:r>');
    expect(out.text).toBe('装幀\n​悉く');
    expect(out.map).toEqual([0, 1, -1, -1, 0, 1]);
  });
});

const existsSync = exists as (path: URL) => boolean;
const readFileSync = readFile as (path: URL) => Uint8Array;
const loraPath = new URL('../../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url);

describe.runIf(existsSync(loraPath))('text halos as stroked glyph outlines (#1444)', () => {
  const plan: WordFontPlan = {
    faces: [{ family: 'Lora PTX', slot: 'regular', bytes: new Uint8Array(readFileSync(loraPath)) }],
    map: new Map([['Lora|400|normal', { family: 'Lora PTX', bold: false, italic: false }]]),
    warnings: [],
    altNames: new Map(),
  };
  const label = (halo?: TextItem['halo']): TextItem => {
    const r: DisplayRun = { text: 'Fontalba', x: 10, width: 60, fontString: '14px "Lora"', color: '#1d2f3f', textStart: 0 };
    const line: DisplayLine = { text: r.text, x: 10, width: 60, baseline: 30, lineHeight: 18, align: 'left', runs: [r], map: [] };
    return { kind: 'text', role: 'label', bbox: { x: 10, y: 16, width: 60, height: 18 }, lines: [line], ...(halo ? { halo } : {}) };
  };

  it('strokes the label\'s glyphs twice the halo width, round, in the halo colour, with no fill', () => {
    const xml = haloRun(context(plan), label({ color: '#ffffff', widthPx: 2 }));
    expect(xml).toMatch(/<a:ln w="50800" cap="rnd"><a:solidFill><a:srgbClr val="FFFFFF">(<\/a:srgbClr>)?<\/a:solidFill><a:round\/><\/a:ln>/);
    expect(xml).toContain('<a:quadBezTo>');
    expect(xml).toContain('</a:custGeom><a:noFill/>');
  });

  it('draws nothing without a halo or without the face', () => {
    expect(haloRun(context(plan), label())).toBe('');
    expect(haloRun(context(), label({ color: '#fff', widthPx: 2 }))).toBe('');
  });
});
