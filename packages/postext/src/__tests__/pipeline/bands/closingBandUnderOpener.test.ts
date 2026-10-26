import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument } from '../../../index.js';

// A closing band under a page-span opener (#709): the headline right under
// the opener, in the opener's own column, is that column's head. It takes no
// balancing line, so every column under the opener starts where it starts
// with balancing off.

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

const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** A section flag across the page, then three stories of one headline each:
 *  the whole document is one closing page of two columns. */
const page = (a: number, b: number, c: number, enabled: boolean, first = '## First headline'): VDTDocument => {
  const md = ['# Section', '', first, '', para(a, 1), '', para(b, 2), '', '## Second headline', '', para(c, 3), '', para(40, 4), '', '## Third headline', '', para(35, 5)].join('\n');
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' }, optimalLineBreaking: true },
    headings: {
      balancing: { enabled, looseParagraphs: false },
      levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }, { level: 2, fontSize: { value: 12, unit: 'pt' } }],
    },
  };
  return buildDocument({ markdown: md }, config, createMeasurementCache());
};

const textColumns = (doc: VDTDocument): VDTColumn[] => doc.pages[0]!.columns.filter((c) => c.kind !== 'span');
const visible = (c: VDTColumn): VDTBlock[] => c.blocks.filter((b) => !b.hidden);
/** Top of the first line each column shows. */
const heads = (doc: VDTDocument): number[] => textColumns(doc).filter((c) => visible(c).length > 0).map((c) => visible(c)[0]!.lines[0]!.bbox.y);

describe('a closing band under a page-span opener (#709)', () => {
  // Four paragraph mixes in which the first headline took a balancing line.
  for (const [a, b, c] of [[20, 27, 45], [20, 41, 25], [25, 20, 45], [25, 34, 25]] as const) {
    it(`keeps the first headline at its column's head (${a}, ${b}, ${c} words)`, () => {
      const doc = page(a, b, c, true);
      expect(doc.pages).toHaveLength(1);
      const cols = textColumns(doc);
      expect(cols.map((k) => k.trailingCap)).toEqual([true, true]);
      // The opener is the hidden block 0 of the first column, the headline
      // block 1.
      expect(cols[0]!.blocks[0]).toMatchObject({ type: 'heading', headingLevel: 1, hidden: true });
      const headline = cols[0]!.blocks[1]!;
      expect(headline).toMatchObject({ type: 'heading', headingLevel: 2 });
      expect(headline.balancing).toBeUndefined();
      // The headline stands where it stands with balancing off, and the
      // column beside it starts level with it, on its first grid line
      // under the opener.
      const plain = heads(page(a, b, c, false));
      const mine = heads(doc);
      expect(mine[0]).toBeCloseTo(plain[0]!, 2);
      const lines = (mine[1]! - doc.pages[0]!.contentArea.y) / doc.baselineGrid;
      expect(lines).toBeCloseTo(Math.round(lines), 3);
      expect(mine[1]! - mine[0]!).toBeGreaterThanOrEqual(-0.01);
      expect(mine[1]! - mine[0]!).toBeLessThan(doc.baselineGrid);
    });
  }

  it('gives no column head of a closing band the heading lever', () => {
    for (const [a, b, c] of [[20, 27, 45], [30, 34, 45], [45, 20, 25], [60, 48, 25]] as const) {
      const doc = page(a, b, c, true);
      for (const p of doc.pages) {
        const flowsOn = p.index < doc.pages.length - 1;
        for (const col of p.columns) {
          const head = visible(col)[0];
          if (!head || (flowsOn && !col.trailingCap)) continue;
          expect(head.balancing?.levers ?? []).not.toContain('heading');
        }
      }
    }
  });

  it('leaves a box right under the opener at its column\'s head, as before', () => {
    const doc = page(20, 27, 45, true, ':::callout{title="Note"}\nA short note under the flag.\n:::');
    const cols = textColumns(doc);
    const frame = visible(cols[0]!)[0]!;
    expect(frame.type).toBe('callout');
    expect(frame.balancing).toBeUndefined();
    const plain = page(20, 27, 45, false, ':::callout{title="Note"}\nA short note under the flag.\n:::');
    expect(frame.bbox.y).toBeCloseTo(visible(textColumns(plain)[0]!)[0]!.bbox.y, 2);
  });
});
