import { describe, it, expect } from 'vitest';
import type { DisplayItem, DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { CHIP_PLACEHOLDER } from '../../parse/inlineFormatting.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { MetricsCache, type FaceAdvances } from './metrics.js';
import { chunkBox, emitGroups, italicRoom, planChunks, planLines } from './paragraphs.js';
import { HOLDER, emitRun, wordText } from './runs.js';
import { SYMBOL_FACE } from './symbols.js';
import { measuredMarker } from './text.js';
import type { WriterContext } from './types.js';

// A face of 1000 units: letters 500, spaces 250.
const FACE: FaceAdvances = (() => {
  const cmap = new Map<number, number>();
  const advances = [0];
  const add = (cp: number, adv: number): void => {
    cmap.set(cp, advances.length);
    advances.push(adv);
  };
  for (let c = 0x21; c < 0x7f; c++) add(c, 500);
  add(0x20, 250);
  add(0xa0, 250);
  return { unitsPerEm: 1000, cmap, advances };
})();

class FakeMetrics extends MetricsCache {
  constructor() {
    super(undefined);
  }
  override faceAdvances(): FaceAdvances | undefined {
    return FACE;
  }
}

const plan: WordFontPlan = { faces: [], map: new Map(), warnings: [], altNames: new Map() };

function context(): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan, lang: 'en', metrics: new FakeMetrics(), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const run = (text: string, x: number, width: number, font = '12px "Lora"', over: Partial<DisplayRun> = {}): DisplayRun => ({ text, x, width, fontString: font, color: '#000', textStart: 0, ...over });
function lineOf(runs: DisplayRun[], over: Partial<DisplayLine> = {}): DisplayLine {
  const text = runs.map((r) => r.text).join('');
  const x = runs[0]!.x;
  const end = Math.max(...runs.map((r) => r.x + r.width));
  return { text, x, width: end - x, baseline: 30, lineHeight: 14, align: 'left', runs, map: [...text].map(() => -1), ...over };
}
type TextItem = Extract<DisplayItem, { kind: 'text' }>;
const item = (role: TextItem['role'], lines: DisplayLine[]): TextItem => ({ kind: 'text', role, bbox: { x: lines[0]!.x, y: 10, width: lines[0]!.width, height: 30 }, lines, source: { blockKey: 'b', map: [], generated: true } });

/** `w:spacing` values of the runs in `xml`. */
const spacings = (xml: string): number[] => [...xml.matchAll(/<w:spacing w:val="(-?\d+)"\/>/g)].map((m) => Number(m[1]));

describe('formatted Word display lines (#1444)', () => {
  it('sets a list marker at its face\'s widths, not letter-spaced to an estimate', () => {
    const ctx = context();
    // The display list gives a marker's runs 0.55 em a character, wider
    // than the face sets them: "ii" (12 px) took 13.2 px, ")" 6.6 px.
    const marker = item('marker', [lineOf([run('ii', 100, 13.2), run(')', 112, 6.6)])]);
    const fixed = measuredMarker(ctx, marker);
    expect(fixed.lines[0]!.runs.map((r) => r.width)).toEqual([12, 6]);
    expect(fixed.lines[0]!.width).toBe(18);
    const line = fixed.lines[0]!;
    const plans = planLines(ctx, [line]);
    const [chunk] = planChunks([line], plans);
    const box = chunkBox(ctx, [line], chunk!, plans);
    const out = emitGroups(ctx, fixed, chunk!.groups, box.x, box.x + box.width, { offsets: [0] });
    // No letter spacing beyond the twip the run fit rounds away.
    expect(spacings(out.xml).every((s) => Math.abs(s) <= 1)).toBe(true);
    // Other roles keep the engine's widths.
    expect(measuredMarker(ctx, item('body', marker.lines))).toEqual(item('body', marker.lines));
  });

  it('gives an italic display line room for its overhang on both sides', () => {
    const ctx = context();
    const italic = lineOf([run('The Awakening', 50, 300, 'italic 48px "Cormorant"')]);
    expect(italicRoom([italic])).toBe(12);
    expect(italicRoom([lineOf([run('Upright', 50, 100, '48px "Cormorant"')])])).toBe(0);
    const plans = planLines(ctx, [italic]);
    const [chunk] = planChunks([italic], plans);
    const display = chunkBox(ctx, [italic], chunk!, plans, true);
    expect(display.x).toBe(50 - 12);
    expect(display.width).toBe(300 + 24);
    // A body line keeps the 2 pt slack.
    const body = chunkBox(ctx, [italic], chunk!, plans);
    expect(body.width).toBe(304);
  });

  it('writes an empty chip\'s placeholder as a no-break space, one for one', () => {
    expect(wordText(`end${CHIP_PLACEHOLDER}`)).toBe(`end${HOLDER}`);
    expect(wordText(`a\tb`)).toBe('a b');
  });

  it('sets a symbol the embedded face lacks in a symbol face', () => {
    const ctx = context();
    const r = run('\u2318 Z', 10, 30);
    const out = emitRun(ctx, r, lineOf([r]));
    expect(out.text).toBe('\u2318 Z');
    expect(out.pieces?.map((p) => p.text)).toEqual(['\u2318', ' Z']);
    expect(out.pieces![0]!.rPr).toContain(`w:ascii="${SYMBOL_FACE}"`);
    expect(out.pieces![1]!.rPr).not.toContain(SYMBOL_FACE);
    // Letters the face lacks are left to the renderer's own fallback.
    expect(emitRun(ctx, run('\u00e9t\u00e9', 10, 30), lineOf([run('\u00e9t\u00e9', 10, 30)])).rPr).not.toContain(SYMBOL_FACE);
  });
});
