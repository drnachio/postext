import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, TextAlign, VDTDocument, VDTColumn } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const sentence = 'The heap needs about a cubic metre of mixed material before it holds its heat, and few of us fill that much in a season, so the waste goes into one bay at a time.';

/** The EF-157 page: a one-and-a-half layout with text in both columns (a
 *  wide main column and a side column 30 % of the width). */
const config = (textAlign: TextAlign, optimalLineBreaking = true, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'oneAndHalf', sideColumnRole: 'text', sideColumnPercent: 30, gutterWidth: pt(10) },
  bodyText: { fontSize: pt(10), lineHeight: pt(13), textAlign, optimalLineBreaking },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

/** Width of a line's words (its spaces stretch or shrink when justified). */
const inkWidth = (line: { segments?: { kind: string; width: number }[]; bbox: { width: number } }): number =>
  line.segments ? line.segments.filter((s) => s.kind !== 'space').reduce((a, s) => a + s.width, 0) : line.bbox.width;

/** Every line of every column stays inside its column. */
const overflowing = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const b of col.blocks) {
        for (const l of b.lines) {
          const right = l.bbox.x + inkWidth(l);
          if (right > col.bbox.x + col.bbox.width + 0.5) out.push(`p${page.index + 1} c${col.index} ${b.id}: ${(right - col.bbox.x).toFixed(1)} > ${col.bbox.width.toFixed(1)}`);
        }
      }
    }
  }
  return out;
};

const words = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))))
    .join(' ').replace(/-\s+/g, '').split(/\s+/).filter(Boolean);

const columnsWithText = (doc: VDTDocument): VDTColumn[] => doc.pages.flatMap((p) => p.columns.filter((c) => c.blocks.length > 0));

describe('a paragraph that runs on into a column of another width is broken again for it (EF-157)', () => {
  for (const textAlign of ['left', 'justify'] as const) {
    for (const optimal of [true, false]) {
      it(`${textAlign}, ${optimal ? 'Knuth–Plass' : 'line by line'}: wide to narrow to wide`, () => {
        // One paragraph long enough to run through the main column, the
        // side column and on into the next page's main column.
        const markdown = Array.from({ length: 32 }, () => sentence).join(' ');
        const doc = buildDocument({ markdown }, config(textAlign, optimal), createMeasurementCache());
        const cols = columnsWithText(doc);
        expect(cols.length).toBeGreaterThanOrEqual(3);
        expect(overflowing(doc)).toEqual([]);
        // The text is all there, in order.
        expect(words(doc)).toEqual(markdown.split(/\s+/));
        // The part in the side column is set for it, and the part after it,
        // back in a main column, for the main column again.
        const [first, side, back] = cols;
        expect(side!.bbox.width).toBeLessThan(first!.bbox.width - 100);
        const widest = (c: VDTColumn) => Math.max(...c.blocks.flatMap((b) => b.lines.map(inkWidth)));
        expect(widest(side!)).toBeLessThanOrEqual(side!.bbox.width + 0.5);
        expect(back!.bbox.width).toBeCloseTo(first!.bbox.width, 1);
        expect(widest(back!)).toBeGreaterThan(side!.bbox.width + 50);
      });
    }
  }

  it('sets a paragraph moved whole into the side column for the side column', () => {
    // The first paragraph ends a few lines short of the main column's foot;
    // the second, longer than that room and kept whole by the orphan rule,
    // opens the side column.
    const markdown = `${Array.from({ length: 9 }, () => sentence).join(' ')}\n\n*Brief* ${Array.from({ length: 6 }, () => sentence).join(' ')}`;
    const doc = buildDocument({ markdown }, config('left'), createMeasurementCache());
    expect(overflowing(doc)).toEqual([]);
    expect(words(doc)).toEqual(markdown.replace(/\*/g, '').split(/\s+/));
  });

  it('levels the closing page by area when its columns differ in width', () => {
    const markdown = `${Array.from({ length: 9 }, () => sentence).join(' ')}\n\n${Array.from({ length: 6 }, () => sentence).join(' ')}`;
    const doc = buildDocument({ markdown }, config('left'), createMeasurementCache());
    expect(doc.pages).toHaveLength(1);
    const [main, side] = doc.pages[0]!.columns;
    const lines = (c: VDTColumn) => c.blocks.reduce((n, b) => n + b.lines.length, 0);
    // Both columns hold text and end close together. The cut is spread by
    // area: spread by lines (9 of the 18 the main column held), the text
    // that goes on into the side column takes more than twice the lines
    // there, the cut overflows, and the page was left with the side column
    // empty. The side column ends two lines higher here: a line lower cut
    // would leave one line of the second paragraph at the main column's
    // foot, which the orphan rule refuses.
    expect(lines(side!)).toBeGreaterThan(0);
    expect(Math.abs(lines(main!) - lines(side!))).toBeLessThanOrEqual(2);
    expect(overflowing(doc)).toEqual([]);
  });
});

describe('a split box that runs on into a column of another width keeps all its text', () => {
  const tokens = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`);
  const boxWords = (doc: VDTDocument): string[] => words(doc).filter((w) => /^w\d+$/.test(w));
  for (const textAlign of ['left', 'justify'] as const) {
    for (const n of [800, 1500]) {
      it(`${textAlign}, ${n} words: wide to narrow to wide`, () => {
        const text = tokens(n);
        const markdown = `:::callout\n${text.join(' ')}\n:::`;
        const doc = buildDocument({ markdown }, config(textAlign), createMeasurementCache());
        const widths = new Set(columnsWithText(doc).map((c) => Math.round(c.bbox.width)));
        expect(widths.size).toBeGreaterThan(1);
        expect(boxWords(doc)).toEqual(text);
        expect(overflowing(doc)).toEqual([]);
      });
    }
  }

  it('narrow to wide: a box that opens in the side column', () => {
    const text = tokens(600);
    const markdown = `${Array.from({ length: 16 }, () => sentence).join(' ')}\n\n:::callout\n${text.join(' ')}\n:::`;
    const doc = buildDocument({ markdown }, config('left'), createMeasurementCache());
    expect(boxWords(doc)).toEqual(text);
    expect(overflowing(doc)).toEqual([]);
  });
});
