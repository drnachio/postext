import { describe, it, expect } from 'vitest';
import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { MetricsCache, type FaceAdvances } from './metrics.js';
import { emitRun } from './runs.js';
import { SYMBOL_FACE } from './symbols.js';
import type { WriterContext } from './types.js';
import { registerFontCoverage, forgetFontCoverage } from '../../fonts/glyphFallback.js';

// #1460: in the formatted Word export, the characters a run's face lacks
// and the document's symbol font has are set in runs of the symbol font
// (w:rFonts), as the canvas and the PDF set them.

/** A face of 1000 units with `cps` at 500. */
function faceOf(cps: number[]): FaceAdvances {
  const cmap = new Map<number, number>();
  const advances = [0];
  for (const cp of cps) {
    cmap.set(cp, advances.length);
    advances.push(cp === 0x20 || cp === 0xa0 ? 250 : 500);
  }
  return { unitsPerEm: 1000, cmap, advances };
}
const ascii = Array.from({ length: 0x5f }, (_, i) => 0x20 + i).concat(0xa0);
const TEXT = faceOf(ascii);
// The symbol font: ASCII, the union sign and alef.
const SYMBOLS = faceOf([...ascii, 0x222a, 0x2135]);

class Metrics extends MetricsCache {
  constructor(private readonly symbols: boolean) {
    super(undefined);
  }
  override faceAdvances(fontString: string): FaceAdvances | undefined {
    if (/Simbolos/.test(fontString) && !/Lora/.test(fontString)) return this.symbols ? SYMBOLS : undefined;
    return TEXT;
  }
}

const plan: WordFontPlan = {
  faces: [],
  map: new Map([['Simbolos|400|normal', { family: 'Simbolos PTX', bold: false, italic: false }]]),
  warnings: [],
  altNames: new Map(),
};

function context(symbols = true): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan, lang: 'en', metrics: new Metrics(symbols), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: undefined, rasterizeSvg: undefined, media: new Map(),
  };
}

const run = (text: string, font: string): DisplayRun => ({ text, x: 10, width: 60, fontString: font, color: '#000', textStart: 0 });
const lineOf = (r: DisplayRun): DisplayLine => ({ text: r.text, x: r.x, width: r.width, baseline: 30, lineHeight: 14, align: 'left', runs: [r], map: [...r.text].map(() => -1) });

describe('the symbol font in the formatted Word export (#1460)', () => {
  it('sets what the face lacks and the symbol font has in the symbol font', () => {
    const r = run('A ∪ ℵ ⌘', '12px Lora, Simbolos');
    const out = emitRun(context(), r, lineOf(r));
    const pieces = out.pieces ?? [];
    expect(pieces.map((p) => p.text).join('')).toBe(r.text);
    const fontOf = (ch: string) => pieces.find((p) => p.text.includes(ch))!.rPr;
    expect(fontOf('∪')).toContain('w:ascii="Simbolos PTX"');
    expect(fontOf('ℵ')).toContain('w:ascii="Simbolos PTX"');
    // A symbol the symbol font lacks goes to the symbol face, as before.
    expect(fontOf('⌘')).toContain(`w:ascii="${SYMBOL_FACE}"`);
    // Letters and spaces stay in the run's face.
    expect(fontOf('A')).not.toContain('Simbolos');
  });

  it('leaves a run alone without a symbol font', () => {
    const r = run('A ℵ', '12px Lora');
    const out = emitRun(context(), r, lineOf(r));
    expect(out.rPr + (out.pieces ?? []).map((p) => p.rPr).join('')).not.toContain('Simbolos');
  });

  it('reads the coverage the engine reads when the symbol font is not embedded', () => {
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x2135, 0x2135]]);
    try {
      const r = run('A ℵ', '12px Lora, Simbolos');
      const out = emitRun(context(false), r, lineOf(r));
      expect(out.pieces?.find((p) => p.text.includes('ℵ'))?.rPr).toContain('w:ascii="Simbolos"');
    } finally {
      forgetFontCoverage();
    }
  });
});
