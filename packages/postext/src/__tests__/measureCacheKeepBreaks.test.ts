import { describe, it, expect } from 'vitest';
import { cachedMeasureBlock, cachedMeasureRichBlock, createMeasurementCache, measureBlock, measureRichBlock } from '../index';
import type { MeasuredBlock, MeasureBlockOptions } from '../index';
import type { InlineSpan } from '../parse';

// `MeasureBlockOptions.keepBreaks` changes the lines a text is broken into,
// but it is not part of the measurement cache's key. Passed to the exported
// cached measurers, it stored the kept-break lines under the key of the
// plain measurement, and every later call for that text (the engine's own,
// when it shares the cache) got them back.

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

const words = 'the quick brown fox jumps over lazy dogs while typesetting engines measure paragraphs carefully and consistently across columns pages chapters'.split(' ');
const PARA = Array.from({ length: 90 }, (_, i) => words[(i * 7 + 3) % words.length]!).join(' ');
const FONT = '12px serif';
const OPTIONS: MeasureBlockOptions = { textAlign: 'justify', optimal: true, hyphenate: true, maxStretchRatio: 2.5 };
const text = (m: MeasuredBlock): string[] => m.lines.map((l) => l.text);

/** The first three breaks of a looser setting of the paragraph: kept, they
 *  give lines the plain setting does not have. */
function otherBreaks(measure: (o: MeasureBlockOptions) => MeasuredBlock): NonNullable<MeasureBlockOptions['keepBreaks']> {
  const natural = measure(OPTIONS);
  for (const extra of [{ looseness: 1 }, { looseness: -1 }, { maxStretchRatio: 1.2 }, { hyphenate: false }]) {
    const other = measure({ ...OPTIONS, ...extra });
    if (other.breaks && other.breaks.at.slice(0, 3).join() !== natural.breaks!.at.slice(0, 3).join()) {
      return { path: other.breaks.path, at: other.breaks.at.slice(0, 3) };
    }
  }
  throw new Error('no other setting found');
}

describe('cached measurers and kept breaks', () => {
  it('measures a plain text with kept breaks afresh, and leaves the cache as it was', () => {
    const natural = measureBlock(PARA, FONT, 170, 14, OPTIONS);
    const keepBreaks = otherBreaks((o) => measureBlock(PARA, FONT, 170, 14, o));
    const cache = createMeasurementCache();
    const kept = cachedMeasureBlock(PARA, FONT, 170, 14, { ...OPTIONS, keepBreaks }, cache);
    expect(text(kept)).not.toEqual(text(natural));
    expect(text(kept)).toEqual(text(measureBlock(PARA, FONT, 170, 14, { ...OPTIONS, keepBreaks })));
    expect(cache._blocks.size).toBe(0);
    expect(text(cachedMeasureBlock(PARA, FONT, 170, 14, OPTIONS, cache))).toEqual(text(natural));
  });

  it('does the same for a rich text', () => {
    const spans: InlineSpan[] = [{ text: PARA, bold: false, italic: false }];
    const rich = (o: MeasureBlockOptions) => measureRichBlock(spans, FONT, FONT, FONT, FONT, 170, 14, o);
    const natural = rich(OPTIONS);
    const keepBreaks = otherBreaks(rich);
    const cache = createMeasurementCache();
    const kept = cachedMeasureRichBlock(spans, FONT, FONT, FONT, FONT, 170, 14, { ...OPTIONS, keepBreaks }, cache);
    expect(text(kept)).not.toEqual(text(natural));
    expect(cache._blocks.size).toBe(0);
    expect(text(cachedMeasureRichBlock(spans, FONT, FONT, FONT, FONT, 170, 14, OPTIONS, cache))).toEqual(text(natural));
  });
});
