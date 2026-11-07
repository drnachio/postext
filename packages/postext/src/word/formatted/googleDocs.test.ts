import { describe, it, expect } from 'vitest';
import type { DisplayItem, DisplayLine, DisplayPage, DisplayRun } from '../../paint/displayList/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { WORDML_NAMESPACES } from '../ooxml/constants.js';
import { MetricsCache } from './metrics.js';
import { HOLDER, emitRun, leadChip } from './runs.js';
import { growth, textItemRuns } from './text.js';
import { pageXml } from './page.js';
import { tableRuns } from './tables.js';
import { layerRuns, roomBelow } from './layers.js';
import { floatingTables, floatsXml, FLOW_LINE } from './floats.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;
type TableItem = Extract<DisplayItem, { kind: 'table' }>;

function context(): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const SERIF = '400 12px "Lora"';
const run = (text: string, x: number, width: number, extra: Partial<DisplayRun> = {}): DisplayRun => ({ text, x, width, fontString: SERIF, color: '#000000', textStart: 0, ...extra });

function lineOf(runs: DisplayRun[], over: Partial<DisplayLine> = {}): DisplayLine {
  const text = runs.map((r) => r.text).join('');
  return { text, x: 10, width: 200, baseline: 40, lineHeight: 14, align: 'left', runs, map: text.split('').map((_, i) => i), ...over };
}

const textItem = (lines: DisplayLine[], role: TextItem['role'] = 'body'): TextItem => ({ kind: 'text', role, bbox: { x: 10, y: 26, width: 200, height: 18 }, lines });

function table(rect = { x: 40, y: 200, width: 200, height: 30 }, cellExtra: Partial<TableItem['cells'][number]> = {}): TableItem {
  return {
    kind: 'table', rect, columnEdges: [0, rect.width], rowEdges: [0, rect.height],
    cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, rect, item: null, ...cellExtra }],
  };
}

describe('Google Docs fidelity of the formatted writer (#1444)', () => {
  it('writes a blank’s answer as unpainted no-break spaces (F13)', () => {
    const line = lineOf([run('Paris', 10, 60, { blank: true })]);
    const out = emitRun(context(), line.runs[0]!, line);
    expect(out.text).toBe(HOLDER.repeat(5));
    expect(JSON.stringify(out)).not.toContain('Paris');
    expect(out.rPr).not.toContain('noProof');
  });

  it('sets a contents row’s wide gap as a tab to a right stop (F10)', async () => {
    const line = lineOf([run('Chapter', 10, 50), run(' ', 60, 100, { space: true }), run('12', 160, 14)]);
    const xml = (await textItemRuns(context(), textItem([line]))).find((r) => r.includes('name="ptx body'))!;
    expect(xml).toMatch(/<w:tabs><w:tab w:val="right" w:pos="\d+"\/><\/w:tabs>/);
    expect(xml).toContain('<w:tab/>');
    expect(xml).not.toContain('<w:t xml:space="preserve"> </w:t>');
    // An ordinary space stays a space.
    const plain = lineOf([run('Chapter', 10, 50), run(' ', 60, 4, { space: true }), run('12', 64, 14)]);
    const px = (await textItemRuns(context(), textItem([plain]))).find((r) => r.includes('name="ptx body'))!;
    expect(px).not.toContain('<w:tab/>');
    // A centred or right-aligned line keeps its wide space as spacing.
    for (const align of ['center', 'right'] as const) {
      const xml = (await textItemRuns(context(), textItem([{ ...line, align }]))).find((r) => r.includes('name="ptx body'))!;
      expect(xml).not.toContain('<w:tab/>');
      expect(xml).not.toContain('<w:tabs>');
    }
  });

  it('gives title boxes room to grow, body boxes none (F3)', async () => {
    const line = lineOf([run('Title', 10, 50)]);
    const cy = async (role: TextItem['role']): Promise<number> => {
      const xml = (await textItemRuns(context(), textItem([line], role))).find((r) => r.includes(`name="ptx ${role}`))!;
      return Number(/<wp:extent cx="\d+" cy="(\d+)"/.exec(xml)![1]);
    };
    expect(await cy('heading')).toBe(2 * (await cy('body')));
  });

  it('grows a title box only into the free room under it (F3)', async () => {
    const line = lineOf([run('Title', 10, 50)]);
    const cy = async (growRoom?: number): Promise<number> => {
      const xml = (await textItemRuns(context(), textItem([line], 'heading'), growRoom === undefined ? {} : { growRoom })).find((r) => r.includes('name="ptx heading'))!;
      return Number(/<wp:extent cx="\d+" cy="(\d+)"/.exec(xml)![1]);
    };
    const free = await cy();
    expect(await cy(0)).toBeLessThan(free);
    expect(await cy(0)).toBeGreaterThan(free / 2 - 2);
    expect(growth({ y: 10, height: 20 }, 100)).toBe(20);
    expect(growth({ y: 10, height: 20 }, 35)).toBe(5);
    expect(growth({ y: 10, height: 20 }, 20)).toBe(0);
    // The room ends at the next item below that shares the width; a band
    // the title sits on and an item beside it do not count.
    const title = { x: 10, y: 10, width: 100, height: 20 };
    const below = { x: 50, y: 45, width: 100, height: 20 };
    const band = { x: 0, y: 0, width: 400, height: 300 };
    const beside = { x: 200, y: 35, width: 50, height: 50 };
    expect(roomBelow(title, [title, band, beside, below], 600)).toBe(15);
    expect(roomBelow(title, [title, band, beside], 600)).toBe(570);
    expect(roomBelow(title, [title, { x: 50, y: 20, width: 20, height: 40 }], 600)).toBe(0);
  });

  it('measures a line from inside the chip that opens it', () => {
    const chip = run('A', 10, 20, { padStart: 6, padEnd: 4, inline: { kind: 'chip', widthPx: 20, heightPx: 14, box: { dx: 0, width: 20, ascent: 10, descent: 4, fill: '#eee' } } });
    expect(leadChip(lineOf([chip]))).toEqual({ run: chip, lone: true });
    expect(leadChip(lineOf([chip, run(' text', 30, 40)]))).toEqual({ run: chip, lone: false });
    expect(leadChip(lineOf([chip, run(' text', 30, 40)], { align: 'center' }))).toBeUndefined();
    expect(leadChip(lineOf([run('x', 10, 7), chip]))).toBeUndefined();
  });

  it('fills a shaded cell holding chips with a shape under them', async () => {
    const chip = run('B', 50, 20, { inline: { kind: 'chip', widthPx: 20, heightPx: 14, box: { dx: 0, width: 20, ascent: 10, descent: 4, stroke: '#000000', strokeWidthPx: 1 } } });
    const t = table({ x: 10, y: 20, width: 200, height: 30 }, { background: '#ffeecc', item: textItem([lineOf([chip])], 'cell') });
    const runs = await tableRuns(context(), t);
    const box = runs.findIndex((r) => r.includes('name="ptx table'));
    expect(runs[box]).not.toContain('<w:shd');
    const fill = runs.findIndex((r) => r.includes('FFEECC'));
    expect(fill).toBeGreaterThanOrEqual(0);
    expect(fill).toBeLessThan(box);
  });

  it('floats a page’s table at its place, sending what lies under it behind the text (F2)', async () => {
    const page: DisplayPage = {
      index: 0, width: 400, height: 600, dpi: 72,
      items: [
        { kind: 'rect', rect: { x: 30, y: 190, width: 220, height: 50 }, fill: '#123456' },
        { kind: 'rect', rect: { x: 300, y: 10, width: 50, height: 50 }, fill: '#654321' },
        table(),
      ],
    };
    const xml = await pageXml(context(), page, false);
    expect(xmlProblems(`<w:document ${WORDML_NAMESPACES}><w:body>${xml}</w:body></w:document>`)).toEqual([]);
    expect(xml).toContain('w:vertAnchor="page" w:horzAnchor="page" w:tblpX="800" w:tblpY="4000"');
    expect(xml).toContain('<w:tblInd w:w="800" w:type="dxa"/>');
    expect(xml).not.toContain('name="ptx table');
    // The anchor paragraph, a spacer, the table, the closing paragraph
    // holding the section.
    expect(xml.indexOf('<w:tbl>')).toBeGreaterThan(xml.indexOf('</w:p>'));
    expect(xml.indexOf('<w:sectPr>')).toBeGreaterThan(xml.indexOf('</w:tbl>'));
    const shapes = [...xml.matchAll(/<wp:anchor [^>]*behindDoc="(\d)"[^]*?<\/wp:anchor>/g)];
    expect(shapes.find((m) => m[0].includes('123456'))![1]).toBe('1');
    expect(shapes.find((m) => m[0].includes('654321'))![1]).toBe('0');
  });

  it('keeps tables that would not fit the flow in text boxes', () => {
    const page: DisplayPage = { index: 0, width: 400, height: 600, dpi: 72, items: [table({ x: 10, y: 10, width: 100, height: 400 }), table({ x: 10, y: 300, width: 100, height: 290 }), table({ x: 10, y: 20, width: 100, height: 30 }, {})] };
    page.items[2] = { ...(page.items[2] as TableItem), rotate: 90 };
    const floating = floatingTables(page);
    expect(floating.has(page.items[0]!)).toBe(true);
    expect(floating.has(page.items[1]!)).toBe(false);
    expect(floating.has(page.items[2]!)).toBe(false);
    const spacers = [...floatsXml([{ xml: '<T/>', x: 0, y: 4000, height: 600 }, { xml: '<U/>', x: 0, y: 1000, height: 600 }]).matchAll(/w:line="(\d+)"/g)].map((m) => Number(m[1]));
    expect(spacers).toEqual([1000 - FLOW_LINE, 4000 - (1000 + 600)]);
  });

  it('sends earlier drawings behind the text through what overlaps them', () => {
    const r = (id: string): string => `<wp:anchor behindDoc="0">${id}</wp:anchor>`;
    const out = layerRuns([
      { runs: [r('far')], rect: { x: 0, y: 0, width: 10, height: 10 } },
      { runs: [r('chain')], rect: { x: 5, y: 5, width: 30, height: 10 } },
      { runs: [r('under')], rect: { x: 30, y: 5, width: 30, height: 30 } },
      { runs: [], rect: { x: 40, y: 20, width: 50, height: 50 }, table: true },
      { runs: [r('over')], rect: { x: 40, y: 20, width: 50, height: 50 } },
      { runs: [r('apart')], rect: { x: 200, y: 200, width: 5, height: 5 } },
    ]);
    expect(out.map((x) => x.includes('behindDoc="1"'))).toEqual([true, true, true, false, false]);
  });

  it('keeps text boxes in front, and does not chain through them', () => {
    const r = (id: string): string => `<wp:anchor behindDoc="0">${id}</wp:anchor>`;
    const out = layerRuns([
      { runs: [r('before-text')], rect: { x: 0, y: 0, width: 20, height: 10 } },
      { runs: [r('text')], rect: { x: 10, y: 5, width: 40, height: 30 }, text: true },
      { runs: [], rect: { x: 40, y: 20, width: 50, height: 50 }, table: true },
    ]);
    expect(out.map((x) => x.includes('behindDoc="1"'))).toEqual([false, false]);
  });
});
