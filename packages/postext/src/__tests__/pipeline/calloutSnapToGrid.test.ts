import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig } from '../../types';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
/** The layout works at 300 dpi. */
const PT_TO_PX = 300 / 72;
const EPS = 0.01;

/** A worksheet style: off-grid margins (6pt below, 3pt above). */
const config = (snapToGrid?: boolean): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: [{
    id: 'field',
    marginTop: pt(3),
    marginBottom: pt(6),
    ...(snapToGrid === undefined ? {} : { snapToGrid }),
  }],
});

const box = (text: string): string => [':::callout{type="field"}', text, ':::'].join('\n');
const md = ['Name and surname.', box('Question one.'), box('Question two.'), box('Question three.'), 'Closing words.'].join('\n\n');

const build = (cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md, resources: [] }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const bottom = (b: VDTBlock): number => b.bbox.y + b.bbox.height;

describe('callout snapToGrid', () => {
  it('snaps the flow after a box to the baseline grid by default', () => {
    const doc = build(config());
    const fs = frames(doc);
    expect(fs.length).toBe(3);
    const top = doc.pages[0]!.contentArea.y;
    for (let i = 0; i + 1 < fs.length; i++) {
      // The next box opens `marginTop` under a grid line at least
      // `marginBottom` below the previous one.
      const flowAt = fs[i + 1]!.bbox.y - 3 * PT_TO_PX;
      const lines = (flowAt - top) / doc.baselineGrid;
      expect(Math.abs(lines - Math.round(lines))).toBeLessThan(EPS);
      expect(flowAt - bottom(fs[i]!)).toBeGreaterThanOrEqual(6 * PT_TO_PX - EPS);
    }
  });

  it('keeps the exact collapsed margin between consecutive off-grid boxes', () => {
    const doc = build(config(false));
    const fs = frames(doc);
    expect(fs.length).toBe(3);
    // max(marginBottom, marginTop) = 6pt, whatever the grid.
    for (let i = 0; i + 1 < fs.length; i++) {
      expect(fs[i + 1]!.bbox.y - bottom(fs[i]!)).toBeCloseTo(6 * PT_TO_PX, 2);
    }
    // The text after the last box sits exactly `marginBottom` below it.
    const closing = doc.blocks.find((b) => b.type === 'paragraph' && b.lines.some((l) => l.text.includes('Closing')))!;
    expect(closing.bbox.y - bottom(fs[2]!)).toBeCloseTo(6 * PT_TO_PX, 2);
  });

  it('collapses with a larger top margin of the next box', () => {
    const cfg = config(false);
    cfg.calloutStyles = [{ ...cfg.calloutStyles![0]!, marginTop: pt(9) }];
    const fs = frames(build(cfg));
    expect(fs[1]!.bbox.y - bottom(fs[0]!)).toBeCloseTo(9 * PT_TO_PX, 2);
  });
});
