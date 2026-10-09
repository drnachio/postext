import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { placeLineSegments, segmentPlainLength, xForPlainInLine } from './geometry';

// Every glyph 7 px wide, so widths are easy to follow.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const config: PostextConfig = {
  page: { width: { value: 120, unit: 'mm' }, height: { value: 200, unit: 'mm' } },
  bodyText: {
    textAlign: 'justify',
    firstLineIndent: { value: 0, unit: 'mm' },
    tabStops: [{ position: { value: 30, unit: 'mm' }, leader: '.' }],
  },
  locale: 'en',
};

type Block = VDTDocument['blocks'][number];

describe('caret and clicks on a line holding a tab stop (#622)', () => {
  const md = 'Soup :tab soup of the day with bread and a glass of the house wine, served at the table every day of the week until late';
  const doc = buildDocument({ markdown: md }, config);
  const block = doc.blocks.find((b): b is Block => b.type === 'paragraph')!;
  const line = block.lines.find((l) => l.tabbed)!;

  it('lays the tab out with a leader on a line of a justified paragraph', () => {
    expect(line).toBeDefined();
    expect(line.isLastLine).toBe(false);
    expect(line.text).toBe('Soup\tsoup of the day');
    expect(line.segments!.some((s) => s.leader === 'text')).toBe(true);
  });

  it('counts no plain character for the leader', () => {
    const leader = line.segments!.find((s) => s.leader !== undefined)!;
    expect(segmentPlainLength(leader, false)).toBe(0);
  });

  it('puts the caret before the word at the stop where it is painted, at the measured widths', () => {
    const segs = line.segments!;
    const after = segs.findIndex((s, i) => i > 0 && s.text === 'soup');
    expect(after).toBeGreaterThan(0);
    // The renderers set a tabbed line as measured: never stretched.
    let x = line.measure ? line.measure.x : line.bbox.x;
    for (let i = 0; i < after; i++) x += segs[i]!.width;
    // "Soup", the tab: the leader holds no character.
    expect(xForPlainInLine(block, line, 'Soup\t'.length)).toBeCloseTo(x, 3);
    const placed = placeLineSegments(block, line, false)!;
    expect(placed.reduce((w, p) => w + p.width, 0)).toBeCloseTo(segs.reduce((w, s) => w + s.width, 0), 3);
  });
});
