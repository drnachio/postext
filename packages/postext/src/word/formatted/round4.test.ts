import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync as exists, readFileSync as readFile } from 'node:fs';
import type { DisplayItem, DisplayLine, DisplayPage, DisplayRun } from '../../paint/displayList/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { ligaturePieces, ligatureSpans } from './ligatures.js';
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
const cormorantPath = new URL('../../../../../apps/web/public/fonts/CormorantGaramond.ttf', import.meta.url);

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
    // A chip closing the line: the right stop takes in the padding its last
    // letter carries, so the chip's letters end where the engine set them
    // (chip at 60–77 px, letter 64–73: the stop at 77 - 10 px from the box).
    const tag = run('D', 60, 17, { padStart: 4, padEnd: 4, inline: { kind: 'chip', widthPx: 17, heightPx: 14, box: { dx: 0, width: 17, ascent: 10, descent: 4 } } });
    const two = lineOf([run('Pick', 10, 26), run(' ', 36, 4, { space: true }), { ...chip, x: 40, width: 17 }, run(' ', 57, 3, { space: true }), tag]);
    const closing = emitGroups(ctx, { ...item, lines: [two], source: { blockKey: 'b', map: two.map } }, planChunks([two], planLines(ctx, [two]))[0]!.groups, 10, 310, { offsets: [0] });
    expect(closing.xml).toContain('<w:tabs><w:tab w:val="right" w:pos="1340"/></w:tabs>');
  });

  it('keeps a plain space after a chip when the next word starts too close for a tab', async () => {
    // The engine set the chip's letter narrower than the face does.
    const chip = run('C', 40, 7, { inline: { kind: 'chip', widthPx: 7, heightPx: 14, box: { dx: 0, width: 7, ascent: 10, descent: 4 } } });
    const line = lineOf([run('Pick', 10, 26), run(' ', 36, 4, { space: true }), chip, run(' ', 47, 0.3, { space: true }), run('rebel', 47.3, 28)]);
    const item: TextItem = { kind: 'text', role: 'body', bbox: { x: 10, y: 26, width: 300, height: 18 }, lines: [line] };
    const xml = (await textItemRuns(context(plan), item)).join('');
    expect(xml).not.toContain('<w:tab/>');
  });

  it('keeps a display run’s ligature unspaced, the others carrying its fit', () => {
    const ctx = context(plan);
    const r = run('fine ', 10, 90, { fontString: '400 40px "Lora"' });
    const out = emitRun(ctx, r, lineOf([r]));
    const pieces = out.pieces ?? [{ rPr: out.rPr, text: out.text }];
    const fi = pieces.find((p) => p.text.startsWith('fi'));
    expect(fi).toBeDefined();
    expect(fi!.rPr).not.toContain('<w:spacing');
    expect(pieces.map((p) => p.text).join('')).toBe('fine ');
    // Body text keeps its spacing on every letter.
    const small = run('fine ', 10, 24, { fontString: SERIF });
    const body = emitRun(ctx, small, lineOf([small]));
    expect(body.pieces?.some((p) => p.text.startsWith('fi') && !p.rPr.includes('<w:spacing'))).not.toBe(true);
    // A pair the face has no ligature for is spaced like any other.
    const th = run('The ', 10, 70, { fontString: '400 40px "Lora"' });
    const plain = emitRun(ctx, th, lineOf([th]));
    expect((plain.pieces ?? []).some((p) => p.text.startsWith('Th') && !p.rPr.includes('<w:spacing'))).toBe(false);
  });

  it.runIf(existsSync(cormorantPath))('finds the ligatures a face’s liga feature forms, longest first', () => {
    const ctx = context({
      ...plan,
      faces: [...plan.faces, { family: 'Cormorant PTX', slot: 'regular', bytes: new Uint8Array(readFileSync(cormorantPath)) }],
      map: new Map([...plan.map, ['Cormorant Garamond|400|normal', { family: 'Cormorant PTX', bold: false, italic: false }]]),
    });
    const font = '400 40px "Cormorant Garamond"';
    expect(ligatureSpans(ctx.metrics.faceAdvances(font), 'The office')).toEqual([{ start: 0, end: 2 }, { start: 5, end: 8 }]);
    expect(ligatureSpans(ctx.metrics.faceAdvances(SERIF), 'The')).toEqual([]);
    const r = run('The ', 10, 64, { fontString: font });
    const pieces = emitRun(ctx, r, lineOf([r])).pieces ?? [];
    expect(pieces.find((p) => p.text.startsWith('Th'))?.rPr).not.toContain('<w:spacing');
  });

  it('spreads a fit over the letters outside ligatures, the gap on the last', () => {
    const props = (s: number): string => `[${s}]`;
    const pair = [{ start: 0, end: 2 }];
    expect(ligaturePieces('The ', pair, -10, 0, props)).toEqual([{ rPr: '[0]', text: 'Th' }, { rPr: '[-5]', text: 'e ' }]);
    expect(ligaturePieces('fit', pair, -3, 4, props)).toEqual([{ rPr: '[0]', text: 'fi' }, { rPr: '[1]', text: 't' }]);
    expect(ligaturePieces('fi', pair, -3, 0, props)).toEqual([{ rPr: '[0]', text: 'fi' }]);
    expect(ligaturePieces('fi', pair, -3, 5, props)).toBeUndefined();
    expect(ligaturePieces('office', [{ start: 1, end: 4 }], 6, 0, props)).toEqual([{ rPr: '[2]', text: 'o' }, { rPr: '[0]', text: 'ffi' }, { rPr: '[2]', text: 'ce' }]);
  });
});

describe('vertical text and scores in the formatted export, round four (#1444)', () => {
  const MINCHO = '400 10px "Shippori Mincho B1"';
  const vline = (runs: DisplayRun[], baseline = 40): DisplayLine => {
    const text = runs.map((r) => r.text).join('');
    return { text, x: 0, width: 10 * text.length, baseline, lineHeight: 17, align: 'left', runs, map: [...text].map((_, i) => i), vertical: true };
  };

  it('keeps a vertical ruby’s base in the line and draws its reading where the engine placed it', () => {
    const ruby = { text: 'だけ', fontString: '400 5px "Shippori Mincho B1"', position: 'over' as const, raise: 7.5, runs: [{ text: 'だ', dx: 0, dy: -7.5, fontString: '400 5px "Shippori Mincho B1"' }, { text: 'け', dx: 5, dy: -7.5, fontString: '400 5px "Shippori Mincho B1"' }] };
    const base = run('丈', 20, 10, { fontString: MINCHO, ruby });
    const line = vline([run('一篇', 0, 20, { fontString: MINCHO }), base, run('を', 30, 10, { fontString: MINCHO })]);
    const out = emitRun(context(), base, line);
    expect(out.xml ?? '').not.toContain('<w:ruby>');
    expect(out.text).toBe('丈');
    expect(out.annotations?.map((a) => [a.text, a.x, a.baseline, a.vertical])).toEqual([['だ', 20, 32.5, true], ['け', 25, 32.5, true]]);
    // A ruby the engine gave no placed reading stays a Word ruby, as does
    // one on a horizontal line.
    const bare = { ...base, ruby: { text: 'だけ', fontString: ruby.fontString, position: 'over' as const } };
    expect(emitRun(context(), bare, vline([bare])).xml).toContain('<w:ruby>');
    expect(emitRun(context(), base, { ...line, vertical: false }).xml).toContain('<w:ruby>');
  });

  it('sets a lone vertical line at 1.87 em, a vertical column at its own pitch', async () => {
    const title: TextItem = { kind: 'text', role: 'heading', bbox: { x: 0, y: 0, width: 40, height: 20 }, rotate: 90, lines: [vline([run('目次', 0, 40, { fontString: '400 20px "Shippori Mincho B1"' })], 16)] };
    const xml = (await textItemRuns(context(), title)).join('');
    expect(xml).toContain('vert="eaVert"');
    expect(xml).toContain('w:line="748" w:lineRule="exact"');
    const column: TextItem = { ...title, lines: [vline([run('一', 0, 10, { fontString: MINCHO })], 16), vline([run('二', 0, 10, { fontString: MINCHO })], 33)] };
    expect((await textItemRuns(context(), column)).join('')).toContain('w:line="340" w:lineRule="exact"');
  });

  it('stands an inline score wholly on its baseline, as the painters draw it', () => {
    const score = run(' ', 10, 120, { inline: { kind: 'score', svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', widthPx: 120, heightPx: 40, ascentPx: 40 } });
    const out = emitRun(context(), score, lineOf([score], { baseline: 60 }));
    expect(out.drawing?.rect).toEqual({ x: 10, y: 20, width: 120, height: 40 });
  });
});
