import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTDocument } from '../../../index.js';

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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const TWO_COL: PostextConfig = {
  page: { width: mm(160), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  bodyText: { hyphenation: { enabled: false } },
};

const build = (md: string): VDTDocument => buildDocument({ markdown: md }, TWO_COL, createMeasurementCache());

/** Lines of body text in each column of the first page. */
const textLines = (doc: VDTDocument): number[] =>
  doc.pages[0]!.columns.map((col) => col.blocks.filter((b) => b.footnoteNote === undefined).reduce((n, b) => n + b.lines.length, 0));

describe('a closing band cut level with a note at a column foot (#673)', () => {
  // The note of a column a band cap cut is set under the cut, at the true
  // foot of the column: its height takes nothing from the lines above the
  // cut unless it reaches above it.
  // `[10, 2]` and `[14]`: the paragraph that cites the note runs to the cut.
  for (const paragraphs of [[6, 4, 5], [3, 3, 3, 3], [10, 2], [14], [4, 9]]) {
    it(`ends level with a note cited in the first column (${paragraphs.join('+')} sentences)`, () => {
      const md = [
        ...paragraphs.map((n, i) => (i === 0 ? `Primera cita.[^n] ${filler(n)}` : filler(n))),
        `[^n]: ${filler(3)}`,
      ].join('\n\n');
      const plain = textLines(build(md.replace('[^n] ', ' ').replace(/\n\n\[\^n\]:.*$/, '')));
      const noted = build(md);
      expect(noted.pages).toHaveLength(1);
      const note = noted.blocks.find((b) => b.footnoteNote === 'n')!;
      expect(note.columnIndex).toBe(0);
      const lines = textLines(noted);
      expect(Math.abs(lines[0]! - lines[1]!)).toBeLessThanOrEqual(Math.max(1, Math.abs(plain[0]! - plain[1]!)));
    });
  }

  it('still charges the note whole in a column no cap cut', () => {
    // Enough text for two pages: the first column of page 1 runs to the
    // page's foot, and its note takes its lines from it.
    const md = [`Primera cita.[^n] ${filler(150)}`, `[^n]: ${filler(3)}`].join('\n\n');
    const doc = build(md);
    expect(doc.pages.length).toBeGreaterThan(1);
    const [first, second] = doc.pages[0]!.columns;
    const note = doc.blocks.find((b) => b.footnoteNote === 'n')!;
    expect(note.pageIndex).toBe(0);
    expect(note.columnIndex).toBe(0);
    const lines = textLines(doc);
    expect(lines[1]! - lines[0]!).toBeGreaterThanOrEqual(note.lines.length);
    expect(first!.bandCapped ?? false).toBe(false);
    expect(second!.bandCapped ?? false).toBe(false);
  });
});
