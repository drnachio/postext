import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';

// #708: under a figure across both columns, on a page that flows on, a
// column moves a line down only with its neighbour or to end flush.

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
  id: 'band', typeId: 'figure', kind: 'bitmap', caption: 'Band.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'band.png', format: 'png', width: 1600, height: 600 },
  placement: { position: 'top', span: 'page' },
};
const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** Page 1 of seven paragraphs, the figure at the head of page 2, text on
 *  to page 3. `k` shuffles the paragraph lengths. */
const build = (k: number, balancing: NonNullable<PostextConfig['headings']>['balancing'] = {}): VDTDocument => {
  const paras = Array.from({ length: 22 }, (_, i) => para(i < 7 ? 60 : 30 + ((i * k) % 37), i));
  const md = `# One\n\n${paras.slice(0, 7).join('\n\n')}\n\n::resource{id="band"}\n\n${paras.slice(7).join('\n\n')}`;
  const config: PostextConfig = {
    page: { sizePreset: '17x24', dpi: 150 },
    layout: { layoutType: 'double' },
    bodyText: { fontSize: { value: 10, unit: 'pt' }, avoidWidows: true, avoidOrphans: true, orphanMinLines: 3, widowMinLines: 3 },
    headings: { balancing: { looseParagraphs: false, ...balancing }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  };
  return buildDocument({ markdown: md, resources: [band] }, config, createMeasurementCache());
};

/** Of each text column of page 2: lines from the float's foot to its first
 *  line, whole lines it ends short of its foot, and its first block's lever. */
const columns = (doc: VDTDocument) => {
  const page = doc.pages[1]!;
  const G = doc.baselineGrid;
  const float = page.floats![0]!;
  return page.columns.filter((c) => c.kind !== 'span').map((c) => {
    const first = c.blocks[0]!;
    const last = c.blocks[c.blocks.length - 1]!;
    const tail = last.lines[last.lines.length - 1]!;
    return {
      head: Math.round(((first.lines[0]!.bbox.y - (float.bbox.y + float.bbox.height)) / G) * 100) / 100,
      short: Math.floor((c.bbox.y + c.bbox.height - (tail.bbox.y + tail.bbox.height)) / G + 0.01),
      lever: first.balancing?.levers.join('+') ?? '-',
    };
  });
};

describe('the after-float lever under a float over both columns (#708)', () => {
  it('keeps the heads level where one column would move alone and stay short (case A)', () => {
    // Without the lever: the first column ends two lines short, the second flush.
    const off = columns(build(6, { stretchAfterFloats: false }));
    expect(off.map((c) => c.short)).toEqual([2, 0]);
    expect(off[0]!.head).toBeCloseTo(off[1]!.head, 2);
    // As up to 1.27: the first column starts a line lower and ends a line short.
    const always = columns(build(6, { stretchAfterWideFloats: 'always' }));
    expect(always.map((c) => c.lever)).toEqual(['afterFloat', '-']);
    expect(always[0]!.head - always[1]!.head).toBeCloseTo(1, 2);
    expect(always.map((c) => c.short)).toEqual([1, 0]);
    // By default: no line under the float, both heads where they were.
    const flush = columns(build(6));
    expect(flush.map((c) => c.lever)).toEqual(['-', '-']);
    expect(flush.map((c) => c.head)).toEqual(off.map((c) => c.head));
    expect(flush.map((c) => c.short)).toEqual([2, 0]);
  });

  it('moves both columns together as before (case B)', () => {
    const off = columns(build(7, { stretchAfterFloats: false }));
    expect(off.map((c) => c.short)).toEqual([4, 1]);
    const flush = build(7);
    const cols = columns(flush);
    expect(cols.map((c) => c.lever)).toEqual(['afterFloat', 'afterFloat']);
    expect(cols[0]!.head).toBeCloseTo(cols[1]!.head, 2);
    expect(cols[0]!.head - off[0]!.head).toBeCloseTo(1, 2);
    expect(cols.map((c) => c.short)).toEqual([3, 0]);
    // The layout of postext 1.27.
    expect(JSON.stringify(flush.pages)).toBe(JSON.stringify(build(7, { stretchAfterWideFloats: 'always' }).pages));
  });
});
