import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

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

// The EF-116 shape (boxes-split-float-pin §4.6): a page whose first column
// opens under a figure, the text of the page, then a page-span box that
// cuts the band above it level. The same words set as one paragraph or as
// two (with the space between paragraphs) must be cut as low as the text
// allows, not where one column's forced paragraph happened to end.
const W = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(' ');
const words = (n: number, seed: number): string => Array.from({ length: n }, (_, i) => W[(i * 7 + seed) % W.length]).join(' ');
const mm = (value: number) => ({ value, unit: 'mm' as const });
const GRID = ((8 * 300) / 72) * 1.5;
const config: PostextConfig = {
  page: { width: mm(160), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  bodyText: { textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
  calloutStyles: [{ id: 'resumen', span: 'page' }],
};
const figure: Resource = {
  id: 'f', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  placement: { position: 'top' }, svg: { fileId: 'f.svg', width: 1000, height: 500 },
};
const markdown = (two: boolean): string => {
  const a = words(130, 3);
  const b = words(85, 5);
  return [
    '# T',
    `${words(1200, 1)} (:ref{id="f"}).`,
    ':::pagebreak',
    two ? `${a}.\n\n${b}.` : `${a} ${b}.`,
    ':::callout{type="resumen"}', words(30, 4), ':::',
    words(20, 6),
  ].join('\n\n');
};

const build = (two: boolean): VDTDocument =>
  buildDocument({ markdown: markdown(two), resources: [figure] }, config, createMeasurementCache());
const box = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
/** Where the box cuts the page: the top of the span column holding it. */
const cutOf = (doc: VDTDocument): number => {
  const f = box(doc);
  return doc.pages[f.pageIndex!]!.columns.find((c) => c.kind === 'span' && c.blocks.includes(f))!.bbox.y;
};
/** Where the text of each column of the band above the box ends (a column
 *  holding no text, under the figure, at its top). */
const textFeet = (doc: VDTDocument): number[] => {
  const f = box(doc);
  const page = doc.pages[f.pageIndex!]!;
  const cut = cutOf(doc);
  return page.columns
    .filter((c) => c.kind !== 'span' && c.bbox.y < cut)
    .map((c) => {
      const last = c.blocks.filter((b) => !b.hidden).at(-1)?.lines.at(-1);
      return last ? last.bbox.y + last.bbox.height : c.bbox.y;
    });
};

describe('a page-span box cuts a band under a column figure as low as its text allows (EF-116)', () => {
  it('holds whether the text is one paragraph or two', () => {
    for (const two of [false, true]) {
      const doc = build(two);
      const f = box(doc);
      expect(f.pageIndex, `two=${two}`).toBe(1);
      // Non-vacuous: the first column of that page opens under the figure.
      const page = doc.pages[1]!;
      expect((page.floats ?? []).some((x) => x.columnIndex === 0 && x.bbox.y <= page.contentArea.y + 1)).toBe(true);
      // No column of the band ends more than a grid line above the cut, and
      // none runs past it.
      const cut = cutOf(doc);
      for (const foot of textFeet(doc)) {
        expect(cut - foot, `two=${two}`).toBeLessThanOrEqual(GRID + 0.5);
        expect(foot, `two=${two}`).toBeLessThanOrEqual(cut + 0.5);
      }
    }
  }, 60_000);

  it('cuts two paragraphs at most the space between them lower than one', () => {
    expect(cutOf(build(true)) - cutOf(build(false))).toBeLessThanOrEqual(GRID + 0.5);
  }, 60_000);
});
