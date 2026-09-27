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

const band: Resource = {
  id: 'band',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Band.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'band.png', format: 'png', width: 1600, height: 600 },
  placement: { position: 'top', span: 'page' },
};

const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** Chapter One: seven paragraphs fill page 1, the page-wide figure is set
 *  at the end of that flow (so page 2, the chapter's closing page, opens
 *  with it) and two more paragraphs close the chapter under it. */
const chapter = (base: number, extra: number, stretchAfterFloats?: boolean): VDTDocument => {
  const paras = Array.from({ length: 9 }, (_, i) => para((i < 7 ? base : 40) + (i === 8 ? extra * 3 : 0), i));
  const md = `# One\n\n${paras.slice(0, 7).join('\n\n')}\n\n::resource{id="band"}\n\n${paras.slice(7).join('\n\n')}\n\n# Two\n\nEnd.`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' } },
    headings: {
      ...(stretchAfterFloats === undefined ? {} : { balancing: { stretchAfterFloats } }),
      levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
    },
  };
  return buildDocument({ markdown: md, resources: [band] }, config, createMeasurementCache());
};

/** Top of the first line of each text column of `page`. */
const heads = (page: VDTPage): number[] =>
  page.columns
    .filter((c) => c.kind !== 'span' && c.blocks.length > 0)
    .map((c) => Math.min(...c.blocks.flatMap((b) => b.lines.map((l) => l.bbox.y))));

describe('a chapter closing page keeps its column heads level under a float (EF-70)', () => {
  it('does not push a column down under the float to line the feet up', () => {
    for (const [base, extra] of [[65, 2], [65, 3], [70, 2], [70, 5]] as const) {
      const doc = chapter(base, extra);
      const closing = doc.pages[1]!;
      expect(closing.floats?.length, `${base}/${extra}`).toBe(1);
      // Page 3 opens chapter Two: page 2 is chapter One's closing page.
      expect(doc.pages[2]!.columns[0]!.blocks[0]!.type).toBe('heading');
      const [a, b] = heads(closing);
      expect(a, `${base}/${extra}`).toBeCloseTo(b!, 1);
      for (const c of closing.columns) {
        for (const blk of c.blocks) expect(blk.balancing?.levers ?? []).not.toContain('afterFloat');
      }
    }
  });

  it('matches the layout with the after-float lever turned off', () => {
    const on = chapter(65, 2);
    const off = chapter(65, 2, false);
    expect(heads(on.pages[1]!)).toEqual(heads(off.pages[1]!));
  });
});

const colFigure: Resource = {
  id: 'cf',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Column figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'cf.png', format: 'png', width: 800, height: 500 },
  placement: { position: 'top', span: 'column' },
};

/** A two-page chapter whose closing page opens with a column figure (cited
 *  near the foot of page 1) over the first column; `tail` words close it. */
const columnChapter = (tail: number, stretchAfterFloats?: boolean): VDTDocument => {
  const paras = Array.from({ length: 9 }, (_, i) => para(i === 8 ? tail : 65, i));
  paras[6] = `${paras[6]} See :ref{id="cf"}.`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' } },
    headings: {
      ...(stretchAfterFloats === undefined ? {} : { balancing: { stretchAfterFloats } }),
      levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
    },
  };
  return buildDocument({ markdown: `# One\n\n${paras.join('\n\n')}\n\n# Two\n\nEnd.`, resources: [colFigure] }, config, createMeasurementCache());
};

describe('a column figure heading a column of a closing page gets no room under it either (EF-70)', () => {
  it('sets the text right under the figure, as with the lever turned off', () => {
    for (const tail of [40, 80, 100, 120, 160]) {
      const doc = columnChapter(tail);
      const closing = doc.pages[1]!;
      const fig = closing.floats?.[0];
      expect(fig?.columnIndex, `${tail}`).toBe(0);
      const col = closing.columns[0]!;
      expect(col.bbox.y).toBeGreaterThan(fig!.bbox.y + fig!.bbox.height);
      expect(heads(closing)).toEqual(heads(columnChapter(tail, false).pages[1]!));
      // A paragraph that cannot start in the room the level cut leaves
      // under the figure goes on to the column beside it (EF-116): the
      // column then holds the figure alone.
      if (col.blocks.length === 0) continue;
      expect(col.blocks[0]!.balancing?.levers ?? []).not.toContain('afterFloat');
      // The column under the figure opens at its top: no line is added.
      expect(heads(closing)[0]).toBeCloseTo(col.bbox.y, 0);
    }
  }, 30_000);
});

/** Chapter One as above, with a crosshead in its closing text: `before`
 *  words ahead of it decide which column of the closing page it opens. */
const withHeading = (before: number, stretchAfterFloats?: boolean): VDTDocument => {
  const paras = Array.from({ length: 7 }, (_, i) => para(65, i));
  const tail = [para(before, 11), '## References', para(40, 12), para(30, 13)];
  const md = `# One\n\n${paras.join('\n\n')}\n\n::resource{id="band"}\n\n${tail.join('\n\n')}\n\n# Two\n\nEnd.`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' } },
    headings: {
      ...(stretchAfterFloats === undefined ? {} : { balancing: { stretchAfterFloats } }),
      levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
    },
  };
  return buildDocument({ markdown: md, resources: [band] }, config, createMeasurementCache());
};

describe('a heading that opens a column under a float on a closing page stays at its head (EF-79)', () => {
  it('gets no balancing room, so the column heads stay level', () => {
    let opened = 0;
    for (const stretchAfterFloats of [undefined, false]) {
      for (const before of [120, 140, 160, 180]) {
        const doc = withHeading(before, stretchAfterFloats);
        const closing = doc.pages[1]!;
        expect(closing.floats?.length, `${before}`).toBe(1);
        expect(doc.pages[2]!.columns[0]!.blocks[0]!.type).toBe('heading');
        const [a, b] = heads(closing);
        expect(a, `${before}/${stretchAfterFloats}`).toBeCloseTo(b!, 1);
        for (const c of closing.columns) {
          const first = c.blocks[0];
          if (first?.type !== 'heading') continue;
          opened++;
          expect(first.balancing, `${before}/${stretchAfterFloats}`).toBeUndefined();
        }
      }
    }
    // Non-vacuous: the crosshead opens the second column in every variant.
    expect(opened).toBe(8);
  }, 30_000);
});
