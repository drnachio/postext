import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument, VDTPage } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 10 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const figure = (id: string, height: number): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 800, height },
  placement: { position: 'top', span: 'column' },
});

const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** A chapter whose closing page opens with a column figure over each of
 *  its columns. Figure a is cited at the foot of page 1 and waits for page
 *  2, where it lands as the page opens; figure b is cited by the short
 *  paragraph that opens page 2, and lands over the second column once that
 *  paragraph is set, after the band opened. `tail` words close the chapter. */
const chapter = (tail: number): VDTDocument => {
  const paras = Array.from({ length: 8 }, (_, i) => para(65, i));
  paras[6] = `${paras[6]} See :ref{id="a"}.`;
  const md = `# One\n\n${paras.join('\n\n')}\n\nSee :ref{id="b"}. ${para(20, 8)}\n\n${para(tail, 9)}\n\n# Two\n\nEnd.`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' } },
    headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  };
  return buildDocument({ markdown: md, resources: [figure('a', 500), figure('b', 500)] }, config, createMeasurementCache());
};

/** Foot of the last line of each text column of `page` holding text. */
const feet = (page: VDTPage): number[] =>
  page.columns
    .filter((c) => c.kind !== 'span' && c.blocks.length > 0)
    .map((c) => Math.max(...c.blocks.flatMap((b) => b.lines.map((l) => l.bbox.y + l.bbox.height))));

describe('a band cap measured under figures heading every column', () => {
  it('cuts the closing band from under them, though one lands after the band opens', () => {
    for (const tail of [80, 160, 240, 320]) {
      const doc = chapter(tail);
      const closing = doc.pages[1]!;
      // Both figures head the closing page, one over each column.
      const heads = (closing.floats ?? []).map((f) => [f.columnIndex, Math.round(f.bbox.y)]);
      expect(heads, `${tail}`).toEqual([[0, Math.round(closing.contentArea.y)], [1, Math.round(closing.contentArea.y)]]);
      expect(doc.pages[2]!.columns[0]!.blocks[0]!.type).toBe('heading');
      const f = feet(closing);
      expect(f.length, `${tail}`).toBe(2);
      // The columns end level, within a line of each other. Measured from
      // the bare top of the page, the cut came as far too high as the
      // figures are tall, the band overflowed and the cap was dropped:
      // the first column then ran to the foot of the page.
      expect(Math.abs(f[0]! - f[1]!), `${tail}`).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
    }
  }, 30_000);
});
