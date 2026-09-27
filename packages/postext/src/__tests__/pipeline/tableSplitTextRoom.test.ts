import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

/**
 * Where the first part of a split table ends (EF-63, documented in the
 * configuration docs, "Tables taller than the page"): alone in its column it
 * runs to the foot; in a column that already holds another float band it
 * leaves at least three body lines of text under it.
 */

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }], balancing: { enabled: false } },
};
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const table: Resource = {
  id: 't1',
  typeId: 'table',
  kind: 'table',
  caption: 'A long table.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: 'Key', isHeader: true }, { content: 'Value', isHeader: true }],
        ...Array.from({ length: 40 }, (_, i) => [{ content: `k${i}` }, { content: `v${i}` }]),
      ],
    },
  },
};
const band: Resource = {
  id: 'f1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Band.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'b.png', format: 'png', width: 1000, height: 300 },
  placement: { position: 'top', span: 'page' },
};

const build = (withBand: boolean): VDTDocument => {
  const md = `${filler(2)}\n\n${withBand ? 'A band :ref{id="f1"} and ' : ''}the table :ref{id="t1"} are cited here.\n\n${filler(30, 50)}`;
  return buildDocument({ markdown: md, resources: withBand ? [band, table] : [table] }, PAGE, createMeasurementCache());
};

/** Each table part with the column it heads: the text lines under it. */
const parts = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? [])
    .filter((f) => f.resourceBlock?.resource.id === 't1')
    .map((f) => {
      const col = p.columns.find((c) => c.kind !== 'span' && Math.abs(c.bbox.x - f.bbox.x) < 1)!;
      const bottom = f.bbox.y + f.bbox.height;
      const linesUnder = col.blocks.filter((b) => b.bbox.y >= bottom - 0.5).reduce((n, b) => n + b.lines.length, 0);
      const pageBand = (p.floats ?? []).some((o) => o.resourceBlock?.resource.id === 'f1');
      return { page: p.index, linesUnder, colFoot: col.bbox.y + col.bbox.height, bottom, pageBand };
    }));

describe('the first part of a split table and the text under it (EF-63)', () => {
  it('runs to the foot of a column it has to itself', () => {
    const all = parts(build(false));
    expect(all.length).toBeGreaterThan(1);
    const first = all[0]!;
    expect(first.linesUnder).toBe(0);
    // Less than three lines were left: the part takes the column whole.
    expect(first.colFoot - first.bottom).toBeLessThan(3 * 50);
    expect(first.colFoot - first.bottom).toBeGreaterThan(0);
  });

  it('leaves room for three body lines under it in a column that holds another float band', () => {
    const doc = build(true);
    const shared = parts(doc).filter((p) => p.pageBand);
    expect(shared.length).toBeGreaterThan(0);
    for (const p of shared) {
      expect(p.colFoot - p.bottom).toBeGreaterThanOrEqual(3 * doc.baselineGrid - 0.5);
      expect(p.linesUnder).toBeGreaterThan(0);
    }
  });
});
