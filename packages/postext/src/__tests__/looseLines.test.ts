import { describe, it, expect } from 'vitest';
import * as postext from '../index';
import type { VDTDocument } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const words = 'The lantern hung from a nail by the door and every evening somebody lit it before the travellers came up the extraordinarily winding road'.split(' ');
const markdown = Array.from({ length: 6 }, (_, i) => words.slice(i).concat(words.slice(0, i)).join(' ') + '.').join('\n\n');

function build(): VDTDocument {
  return postext.buildDocument({ markdown }, {
    page: { width: pt(260), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, dpi: 96 },
    bodyText: { textAlign: 'justify', hyphenation: { enabled: false } },
  });
}

/** A 2D context that records the rectangles filled and the fill style used. */
function recordingContext() {
  const rects: { x: number; y: number; width: number; height: number; fill: string }[] = [];
  const stack: string[] = [];
  const ctx = {
    fillStyle: '#000000',
    save() { stack.push(this.fillStyle); },
    restore() { this.fillStyle = stack.pop() ?? this.fillStyle; },
    fillRect(x: number, y: number, width: number, height: number) { rects.push({ x, y, width, height, fill: this.fillStyle }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, raw: ctx };
}

describe('loose-line overlay helpers', () => {
  it('findLooseLines lists every justified line looser than the threshold, as the Sandbox overlay does', () => {
    const doc = build();
    const expected = doc.blocks.flatMap((block) => block.lines
      .filter((line) => line.justifiedSpaceRatio !== undefined && line.justifiedSpaceRatio > 1.05)
      .map((line) => ({ block, line })));
    expect(expected.length).toBeGreaterThan(0);
    const found = postext.findLooseLines(doc, { threshold: 1.05 });
    expect(found.map((l) => [l.block, l.line])).toEqual(expected.map((e) => [e.block, e.line]));
    for (const l of found) {
      expect(l.ratio).toBe(l.line.justifiedSpaceRatio);
      expect(l.x).toBe(l.block.bbox.x);
      expect(l.width).toBe(l.block.bbox.width);
      expect(l.y).toBe(l.line.bbox.y);
      expect(l.height).toBe(l.line.bbox.height);
    }
    // One page at a time.
    const onFirst = postext.findLooseLines(doc, { threshold: 1.05, pageIndex: 0 });
    expect(onFirst.every((l) => l.block.pageIndex === 0)).toBe(true);
    // The default threshold is the default `debug.looseLineHighlight.threshold` (3).
    expect(postext.findLooseLines(doc)).toEqual(postext.findLooseLines(doc, { threshold: 3 }));
  });

  it('drawLooseLines paints each loose line of the page in page pixels and restores the context', () => {
    const doc = build();
    const page = doc.pages[0]!;
    const { ctx, rects, raw } = recordingContext();
    const drawn = postext.drawLooseLines(ctx, page, doc, { threshold: 1.05, color: 'rgba(255,0,0,0.25)' });
    expect(drawn.length).toBeGreaterThan(0);
    expect(rects).toEqual(drawn.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height, fill: 'rgba(255,0,0,0.25)' })));
    expect(raw.fillStyle).toBe('#000000');
    // Without a colour, the default highlight colour (`debug.looseLineHighlight.color`).
    const second = recordingContext();
    postext.drawLooseLines(second.ctx, page, doc, { threshold: 1.05 });
    expect(new Set(second.rects.map((r) => r.fill))).toEqual(new Set(['#ff000040']));
  });
});
