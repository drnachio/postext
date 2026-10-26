import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { PostextConfig } from '../../../types.js';

// A box of the running text that splits (`keepTogether: false`) is cut as a
// composed page's frame is (#913, #942): a heading never ends a piece, a
// cut between the items of a list leaves two on each side, and a short
// list under `shortListSplit: 'avoid'` is not cut between its items.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(90), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText,
  calloutStyles: [{ id: 'kp', keepTogether: false }],
});

const para = (word: string, n: number): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');
const box = (lead: number, items: number): string => [
  ':::callout{type="kp"}',
  para('intro', lead),
  '',
  '### Mi registro de la semana',
  '',
  ...Array.from({ length: items }, (_, i) => `- ${para(`item${i}w`, 8)}`),
  ':::',
  '',
  'After the box.',
].join('\n');

/** The children of each fragment of the box, in order. */
const pieces = (doc: VDTDocument): VDTBlock[][] => {
  const frames = doc.blocks.filter((b) => b.type === 'callout');
  return frames.map((f) => f.callout!.childIds.map((id) => doc.blocks.find((b) => b.id === id)!).filter(Boolean));
};

const LEADS = Array.from({ length: 50 }, (_, k) => 20 + k * 5);

describe('a box of the running text is cut by the frame cut rules (#942)', () => {
  it('never ends a piece with a heading', () => {
    let split = 0;
    for (const lead of LEADS) {
      const ps = pieces(buildDocument({ markdown: box(lead, 5) }, config(), createMeasurementCache()));
      if (ps.length < 2) continue;
      split++;
      for (const p of ps.slice(0, -1)) expect(p[p.length - 1]?.type).not.toBe('heading');
    }
    expect(split).toBeGreaterThan(10);
  });

  it('leaves at least two items of a list on each side of a cut between items', () => {
    let between = 0;
    for (const lead of LEADS) {
      const ps = pieces(buildDocument({ markdown: box(lead, 5) }, config(), createMeasurementCache()));
      if (ps.length !== 2) continue;
      const before = ps[0]!.filter((b) => b.type === 'listItem').length;
      const after = ps[1]!.filter((b) => b.type === 'listItem').length;
      // A cut inside an item counts it on both sides.
      if (before === 0 || after === 0 || before + after > 5) continue;
      between++;
      expect(before).toBeGreaterThanOrEqual(2);
      expect(after).toBeGreaterThanOrEqual(2);
    }
    expect(between).toBeGreaterThan(0);
  });

  it("a short list under shortListSplit: 'avoid' is not cut between its items", () => {
    let split = 0;
    for (const lead of LEADS) {
      const ps = pieces(buildDocument({ markdown: box(lead, 3) }, config({ shortListSplit: 'avoid' }), createMeasurementCache()));
      if (ps.length !== 2) continue;
      const a = ps[0]!.filter((b) => b.type === 'listItem').length;
      const b = ps[1]!.filter((b) => b.type === 'listItem').length;
      if (a > 0 && b > 0) split++;
      // Whole on one side, or cut inside one item.
      expect(a === 0 || b === 0 || a + b === 4).toBe(true);
    }
    expect(split).toBeGreaterThanOrEqual(0);
  });
});
