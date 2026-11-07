import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync as exists, readFileSync as readFile } from 'node:fs';
import type { DisplayItem, DisplayLine, DisplayPage, DisplayRun } from '../../paint/displayList/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { ligaturePieces } from './ligatures.js';
import { MetricsCache } from './metrics.js';
import { emitGroups, planChunks, planLines } from './paragraphs.js';
import { pageRuns } from './page.js';
import { emitRun } from './runs.js';
import { textItemRuns } from './text.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

const existsSync = exists as (path: URL) => boolean;
const readFileSync = readFile as (path: URL) => Uint8Array;
const loraPath = new URL('../../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url);

function context(plan?: WordFontPlan): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan, lang: 'en', metrics: new MetricsCache(plan), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const SERIF = '400 12px "Lora"';
const run = (text: string, x: number, width: number, extra: Partial<DisplayRun> = {}): DisplayRun => ({ text, x, width, fontString: SERIF, color: '#000000', textStart: 0, ...extra });

function lineOf(runs: DisplayRun[], over: Partial<DisplayLine> = {}): DisplayLine {
  const text = runs.map((r) => r.text).join('');
  return { text, x: 10, width: 300, baseline: 40, lineHeight: 14, align: 'left', runs, map: text.split('').map((_, i) => i), ...over };
}

/** posOffset x/y, extent and rot of each anchor named `name`. */
function anchors(xml: string, name: string): { x: number; y: number; cx: number; cy: number; rot: number }[] {
  const out: { x: number; y: number; cx: number; cy: number; rot: number }[] = [];
  for (const a of xml.split('<wp:anchor ').slice(1)) {
    if (!a.includes(`name="${name}`)) continue;
    const [x, y] = [...a.matchAll(/<wp:posOffset>(-?\d+)</g)].map((m) => Number(m[1]));
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(a)!;
    const rot = /<a:xfrm rot="(-?\d+)"/.exec(a);
    out.push({ x: x!, y: y!, cx: Number(ext[1]), cy: Number(ext[2]), rot: rot ? Number(rot[1]) : 0 });
  }
  return out;
}

describe.runIf(existsSync(loraPath))('formatted Word export, round four (#1444)', () => {
  const plan: WordFontPlan = {
    faces: [{ family: 'Lora PTX', slot: 'regular', bytes: new Uint8Array(readFileSync(loraPath)) }],
    map: new Map([['Lora|400|normal', { family: 'Lora PTX', bold: false, italic: false }]]),
    warnings: [],
    altNames: new Map(),
  };

  it('draws a turned item’s halo in a shape with its text box’s place, size and turn', async () => {
    const r = run('purr', 20, 40, { fontString: '400 20px "Lora"' });
    const item: TextItem = {
      kind: 'text', role: 'balloon', bbox: { x: 20, y: 20, width: 40, height: 26 }, rotate: -6,
      lines: [lineOf([r], { x: 20, width: 40, baseline: 40, lineHeight: 24 })], halo: { color: '#ffffff', widthPx: 2 },
    };
    const runs = await textItemRuns(context(plan), item);
    const xml = runs.join('');
    const [box] = anchors(xml, 'ptx balloon');
    const [halo] = anchors(xml, 'ptx path');
    expect(box).toBeDefined();
    expect(halo).toEqual(box);
    expect(halo!.rot).toBe(-360000);
    // Under its box, and drawn once: the page leaves a turned item's halo
    // to its boxes.
    expect(runs.findIndex((x) => x.includes('name="ptx path'))).toBeLessThan(runs.findIndex((x) => x.includes('name="ptx balloon')));
    const page: DisplayPage = { index: 0, width: 200, height: 200, dpi: 72, items: [item] };
    const all = (await pageRuns(context(plan), page)).join('');
    expect(anchors(all, 'ptx path')).toHaveLength(1);
  });

  it('sets the space after a chip as a tab to where the next word starts', async () => {
    const chip = run('C', 40, 9, { padStart: 4, padEnd: 4, inline: { kind: 'chip', widthPx: 17, heightPx: 14, box: { dx: 0, width: 17, ascent: 10, descent: 4, stroke: '#000000', strokeWidthPx: 1 } } });
    const line = lineOf([run('Pick', 10, 26), run(' ', 36, 4, { space: true }), { ...chip, x: 40, width: 17 }, run(' ', 57, 3, { space: true }), run('rebel', 60, 28)]);
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 10, y: 26, width: 300, height: 18 }, lines: [line], source: { blockKey: 'b', map: line.map } };
    const ctx = context(plan);
    const plans = planLines(ctx, item.lines);
    const chunks = planChunks(item.lines, plans);
    const out = emitGroups(ctx, item, chunks[0]!.groups, 10, 310, { offsets: [0] });
    // One tab, after the chip; 'rebel' closes the line, so the stop is a
    // right one at its end (78 px from the box).
    expect(out.xml.match(/<w:tab\/>/g)).toHaveLength(1);
    expect(out.xml).toContain('<w:tabs><w:tab w:val="right" w:pos="1560"/></w:tabs>');
    // With a word after it, a left stop where 'rebel' starts (50 px).
    const more = lineOf([...line.runs, run(' ', 88, 3, { space: true }), run('states', 91, 30)]);
    const wide = emitGroups(ctx, { ...item, lines: [more], source: { blockKey: 'b', map: more.map } }, planChunks([more], planLines(ctx, [more]))[0]!.groups, 10, 310, { offsets: [0] });
    expect(wide.xml).toContain('<w:tabs><w:tab w:val="left" w:pos="1000"/></w:tabs>');
    expect(out.text).toBe('Pick C\trebel');
    expect(out.map).toEqual(line.map);
    // The chip's letter keeps no gap of its own before the tab.
    const letter = /<w:r><w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">C<\/w:t><\/w:r>/.exec(out.xml)![0];
    const gap = /<w:spacing w:val="(-?\d+)"/.exec(letter);
    expect(Math.abs(Number(gap?.[1] ?? 0))).toBeLessThan(20);
  });

  it('keeps a plain space after a chip when the next word starts too close for a tab', async () => {
    // The engine set the chip's letter narrower than the face does.
    const chip = run('C', 40, 7, { inline: { kind: 'chip', widthPx: 7, heightPx: 14, box: { dx: 0, width: 7, ascent: 10, descent: 4 } } });
    const line = lineOf([run('Pick', 10, 26), run(' ', 36, 4, { space: true }), chip, run(' ', 47, 0.3, { space: true }), run('rebel', 47.3, 28)]);
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 10, y: 26, width: 300, height: 18 }, lines: [line] };
    const xml = (await textItemRuns(context(plan), item)).join('');
    expect(xml).not.toContain('<w:tab/>');
  });

  it('keeps a display run’s ligature pair unspaced, the others carrying its fit', () => {
    const ctx = context(plan);
    const r = run('The ', 10, 70, { fontString: '400 40px "Lora"' });
    const line = lineOf([r]);
    const out = emitRun(ctx, r, line);
    const pieces = out.pieces ?? [{ rPr: out.rPr, text: out.text }];
    const th = pieces.find((p) => p.text.startsWith('Th'));
    expect(th).toBeDefined();
    expect(th!.rPr).not.toContain('<w:spacing');
    expect(pieces.map((p) => p.text).join('')).toBe('The ');
    // Body text keeps its spacing on every letter.
    const small = run('The ', 10, 20, { fontString: SERIF });
    const body = emitRun(ctx, small, lineOf([small]));
    expect(body.pieces?.some((p) => p.text.startsWith('Th') && !p.rPr.includes('<w:spacing'))).not.toBe(true);
  });

  it('spreads a fit over the letters outside ligature pairs, the gap on the last', () => {
    const props = (s: number): string => `[${s}]`;
    expect(ligaturePieces('The ', -10, 0, props)).toEqual([{ rPr: '[0]', text: 'Th' }, { rPr: '[-5]', text: 'e ' }]);
    expect(ligaturePieces('fit', -3, 4, props)).toEqual([{ rPr: '[0]', text: 'fi' }, { rPr: '[1]', text: 't' }]);
    expect(ligaturePieces('fi', -3, 0, props)).toEqual([{ rPr: '[0]', text: 'fi' }]);
    expect(ligaturePieces('fi', -3, 5, props)).toBeUndefined();
  });
});
