import { describe, it, expect } from 'vitest';
import { measureBlock } from '../measure/plain';
import { createMeasurementCache } from '../measure';
import { buildDocument } from '../pipeline/build';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../defaults';
import type { PostextConfig, VDTDocument } from '../index';

// A proportional stub: narrow spaces, as in a text face, and letters of
// three widths — so a word space is well under a letter, as in print.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch === ' ' ? 3 : /[mw]/.test(ch) ? 11 : /[ilj.,]/.test(ch) ? 4 : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const TEXT = 'But we can never enough decry the disorderly sallies of our minds.';
// Threshold 25 spaces = 75 px here: 'minds.' (40 px) and 'our minds.' (64 px)
// are both runts, 'of our minds.' (81 px) is not.
const OPTIONS = { textAlign: 'justify' as const, optimal: true, runtPenalty: 1000, runtMinCharacters: 25, maxStretchRatio: 1.65, minShrinkRatio: 0.7 };

const lastLine = (lines: { text: string }[]) => lines[lines.length - 1]!.text.trim();

describe('graded runt penalty (EF-89)', () => {
  it('prices a runt by how short it is, so the two-word ending wins over the one-word one', () => {
    // The report's paragraph: with a flat penalty both endings cost the same
    // and the tighter line above keeps its word ('…sallies of our' / 'minds.').
    const flat = measureBlock(TEXT, '12px serif', 354, 14, OPTIONS);
    expect(lastLine(flat.lines)).toBe('minds.');
    expect(flat.lastLineRunt).toBe(true);
    const graded = measureBlock(TEXT, '12px serif', 354, 14, { ...OPTIONS, runtGraded: true });
    expect(lastLine(graded.lines)).toBe('our minds.');
    expect(graded.lines.length).toBe(flat.lines.length);
  });

  it('changes nothing where no ending is a runt', () => {
    for (const width of [206, 262, 302, 334, 406]) {
      const flat = measureBlock(TEXT, '12px serif', width, 14, { ...OPTIONS, runtMinCharacters: 20 });
      const graded = measureBlock(TEXT, '12px serif', width, 14, { ...OPTIONS, runtMinCharacters: 20, runtGraded: true });
      expect(graded.lines.map((l) => l.text), `w=${width}`).toEqual(flat.lines.map((l) => l.text));
    }
  });

  it('is off by default and stripped when off', () => {
    expect(resolveBodyTextConfig().gradedRuntPenalty).toBe(false);
    expect(resolveBodyTextConfig({ gradedRuntPenalty: true }).gradedRuntPenalty).toBe(true);
    expect(stripBodyTextDefaults({ gradedRuntPenalty: false })).toBeUndefined();
    expect(stripBodyTextDefaults({ gradedRuntPenalty: true })).toEqual({ gradedRuntPenalty: true });
  });

  it('reaches the paragraphs of a document, cached or not', () => {
    const config = (graded: boolean): PostextConfig => ({
      page: { width: { value: 354 + 144, unit: 'px' }, height: { value: 400, unit: 'px' }, dpi: 96, margins: { top: { value: 72, unit: 'px' }, bottom: { value: 72, unit: 'px' }, left: { value: 72, unit: 'px' }, right: { value: 72, unit: 'px' } } },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: { value: 12, unit: 'px' }, lineHeight: { value: 14, unit: 'px' }, firstLineIndent: { value: 0, unit: 'px' }, minWordSpacing: 0.7, maxWordSpacing: 1.65, runtMinCharacters: 25, tightenRunts: false, gradedRuntPenalty: graded },
      headings: { levels: [] },
    });
    const ending = (doc: VDTDocument) => lastLine(doc.pages[0]!.columns[0]!.blocks[0]!.lines);
    const cache = createMeasurementCache();
    // One cache for both builds: the option keeps their measures apart.
    expect(ending(buildDocument({ markdown: TEXT }, config(false), cache))).toBe('minds.');
    expect(ending(buildDocument({ markdown: TEXT }, config(true), cache))).toBe('our minds.');
    expect(ending(buildDocument({ markdown: TEXT }, config(true)))).toBe('our minds.');
  });
});
