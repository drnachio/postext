import { describe, it, expect } from 'vitest';
import { measureRichBlock, initHyphenator } from '../measure';
import type { InlineSpan } from '../parse';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '14px A';
const spans: InlineSpan[] = [
  { text: 'Baum, F. (2016). ', bold: false, italic: false },
  { text: 'The New Public Health', bold: false, italic: true },
  { text: ' (5ª ed.). Oxford: Oxford University Press.', bold: false, italic: false },
];

describe('word-spacing limit versus runt avoidance', () => {
  it('prefers a short (or hyphenated) last line over a line stretched past maxWordSpacing', () => {
    initHyphenator('es');
    // Two-line measure: the whole entry is 84 chars (588px); at 520px the
    // last line is short whichever way it breaks, and avoiding the runt used
    // to cost a first line at ~2.6× word spacing.
    const block = measureRichBlock(spans, FONT, FONT, FONT, FONT, 520, 20, {
      textAlign: 'justify', optimal: true, hyphenate: true,
      maxStretchRatio: 2, minShrinkRatio: 0.6, runtPenalty: 1000, runtMinCharacters: 20,
      firstLineIndentPx: 20, hangingIndent: true,
    });
    expect(block.lines.length).toBe(2);
    expect(block.lines[0]!.justifiedSpaceRatio!).toBeLessThanOrEqual(2);
  });
});
