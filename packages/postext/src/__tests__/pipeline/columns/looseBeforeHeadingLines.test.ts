import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { collectColumnGaps } from '../../../pipeline/columns/columnBalancing.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';

// #707: a short column tries its loose paragraphs before its heading takes a
// third line. One page, one heading, two long paragraphs and a box that
// does not fit under them: the column ends three or four lines short.

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
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const paragraph = (n: number): string => SENTENCE.repeat(n).trim();
const pt = (value: number) => ({ value, unit: 'pt' as const });

const markdown = [
  paragraph(1), '', '## Una sola sección', '', paragraph(7), '', paragraph(8), '',
  `:::callout{title="Nota" keepTogether=true}\n${paragraph(3)}\n:::`, '', paragraph(8),
].join('\n');

const build = (
  height: number,
  textAlign: 'justify' | 'left',
  balancing: NonNullable<PostextConfig['headings']>['balancing'],
): VDTDocument => buildDocument(
  { markdown },
  {
    page: { dpi: 72, width: pt(360), height: pt(height), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign },
    headings: { balancing },
  },
  createMeasurementCache(),
);

const firstColumn = (doc: VDTDocument): VDTBlock[] => doc.pages[0]!.columns[0]!.blocks;
const gapOf = (doc: VDTDocument): number =>
  collectColumnGaps(doc, new Set()).filter((g) => g.pageIndex === 0).reduce((n, g) => n + g.gapLines, 0);
const linesAbove = (doc: VDTDocument): number => {
  const head = firstColumn(doc).find((b) => b.type === 'heading')!;
  return Math.round((head.balancing?.spaceAbove ?? 0) / doc.baselineGrid);
};
const loose = (doc: VDTDocument): number => firstColumn(doc).filter((b) => b.balancing?.levers.includes('looseParagraph')).length;

describe('loose paragraphs before a heading\'s third line (#707)', () => {
  // [page height, lines the column ends short without balancing]
  for (const [height, gap] of [[796, 3], [808, 4]] as const) {
    it(`closes a gap of ${gap} lines with two above the heading and ${gap - 2} loose paragraph${gap === 4 ? 's' : ''}`, () => {
      expect(gapOf(build(height, 'justify', { enabled: false }))).toBe(gap);
      const doc = build(height, 'justify', {});
      expect(gapOf(doc)).toBe(0);
      expect(linesAbove(doc)).toBe(2);
      expect(loose(doc)).toBe(gap - 2);
      // The order of postext 1.27: every line above the heading.
      const legacy = build(height, 'justify', { maxLinesBeforeLoose: 4 });
      expect(gapOf(legacy)).toBe(0);
      expect(linesAbove(legacy)).toBe(gap);
      expect(loose(legacy)).toBe(0);
    });
  }

  // Ragged text has no loose paragraph to offer: the heading takes the
  // lines, as before.
  for (const [height, gap] of [[820, 3], [832, 4]] as const) {
    it(`gives a heading over ragged text its ${gap} lines`, () => {
      expect(gapOf(build(height, 'left', { enabled: false }))).toBe(gap);
      const doc = build(height, 'left', {});
      expect(gapOf(doc)).toBe(0);
      expect(linesAbove(doc)).toBe(gap);
      expect(loose(doc)).toBe(0);
      expect(JSON.stringify(doc.pages)).toBe(JSON.stringify(build(height, 'left', { maxLinesBeforeLoose: 4 }).pages));
    });
  }

  it('gives the heading its lines at once with the loose lever off', () => {
    const doc = build(808, 'justify', { looseParagraphs: false });
    expect(gapOf(doc)).toBe(0);
    expect(linesAbove(doc)).toBe(4);
  });
});
