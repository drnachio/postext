import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument } from '../../index';

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
const SENT = 'The lantern of the lighthouse must stay lit all night to guide the ships that cross the bay. ';
const filler = (n: number): string => SENT.repeat(n).trim();

const config: PostextConfig = {
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

/** A box that closes a column of a page the text flows on from, with text
 *  above it in its column: the room left between its foot and the column's
 *  last grid slot. */
const closingBoxes = (doc: VDTDocument): { page: number; room: number; frame: VDTBlock }[] => {
  const out: { page: number; room: number; frame: VDTBlock }[] = [];
  const lastContent = Math.max(...doc.pages.filter((p) => p.columns.some((c) => c.blocks.length > 0)).map((p) => p.index));
  for (const page of doc.pages) {
    if (page.index >= lastContent) continue;
    page.columns.forEach((col: VDTColumn) => {
      const visible = col.blocks.filter((b) => !b.hidden);
      const last = visible[visible.length - 1];
      if (!last || last.containerId === undefined) return;
      const frameAt = visible.findIndex((b) => b.type === 'callout' && b.containerId === last.containerId);
      if (frameAt < 1 || (visible[frameAt]!.callout?.part ?? 0) > 0) return;
      if (!visible.slice(frameAt).every((b) => b.containerId === last.containerId)) return;
      const frame = visible[frameAt]!;
      const slot = col.bbox.y + Math.floor((col.bbox.height + 0.01) / doc.baselineGrid) * doc.baselineGrid;
      out.push({ page: page.index, room: slot - (frame.bbox.y + frame.bbox.height), frame });
    });
  }
  return out;
};

describe('a box closing its column takes the room under it on its own (EF-70)', () => {
  it('less than a line of room: the box moves down onto the last grid slot', () => {
    let subLine = 0;
    for (let before = 10; before <= 22; before++) {
      const md = [filler(before), '', ':::callout{title="Note"}', filler(2), ':::', '', filler(12), '', filler(30), '', filler(30)].join('\n');
      const doc = buildDocument({ markdown: md }, config, createMeasurementCache());
      for (const box of closingBoxes(doc)) {
        // The lever skips a gap under a tenth of a line.
        expect(box.room, `before=${before} p${box.page}`).toBeLessThanOrEqual(doc.baselineGrid * 0.1 + 0.01);
        const rec = box.frame.balancing;
        if (rec?.levers.includes('trailingCallout') && rec.spaceAbove < doc.baselineGrid - 0.01) subLine++;
      }
    }
    // Some of these boxes only closed a fraction of a line: a move the
    // gap-line score does not count, kept on its own.
    expect(subLine).toBeGreaterThan(0);
  }, 60_000);
});
