import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 8 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const px = (value: number) => ({ value, unit: 'px' as const });
const words = 'rain is measured as a depth the height the water would stand if none of it ran off sank in or dried'.split(' ');
const text = (n: number, seed = 0) => `${Array.from({ length: n }, (_, i) => words[(i * 5 + seed) % words.length]).join(' ')}.`;

/** Blocks whose box runs past the foot of the column that holds them: the
 *  renderers clip a column to its box, so their last lines never show. */
const overflowing = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  for (const p of doc.pages) {
    p.columns.forEach((c, ci) => {
      const foot = c.bbox.y + c.bbox.height;
      for (const b of c.blocks) {
        if (b.bbox.y + b.bbox.height > foot + 0.5) out.push(`p${p.index}c${ci} ${b.type} ${b.lines.length} lines`);
      }
    });
  }
  return out;
};

const linesOf = (doc: VDTDocument, contentIndex: number): number =>
  doc.pages.reduce((n, p) => n + p.columns.reduce((m, c) => m + c.blocks
    .filter((b) => b.contentIndex === contentIndex)
    .reduce((k, b) => k + b.lines.length, 0), 0), 0);

/** A small screen page (340 × 330 px at 96 dpi, 17/27 px text): nine lines of
 *  content, like the screen edition of print-and-screen-editions. */
const screen = (over: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: { width: px(340), height: px(330), dpi: 96, margins: { top: px(40), bottom: px(40), left: px(40), right: px(40) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: px(17), lineHeight: px(27), avoidWidows: true, avoidOrphans: true, ...over },
  headings: { levels: [] },
});

describe('a paragraph taller than the page never overflows a column (EF-97)', () => {
  it('leaves a column a float cut down to a line or two for the next page', () => {
    // The figure lands at the head of page 2 and leaves room for one line (a
    // 140 px figure) or two (120 px) under it; the paragraph after it is
    // three pages long. It used to be placed whole in that sliver, over the
    // figure's page foot, and ran off the page.
    for (const h of [120, 130, 140, 150]) {
      const fig: Resource = {
        id: 'fig', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f.png', format: 'png', width: 260, height: h },
        placement: { position: 'top', span: 'column' },
      };
      const md = `${text(20)} See :ref{id="fig"}.\n\n${text(12, 3)}\n\n${text(200, 1)}\n\n${text(30, 2)}`;
      const doc = buildDocument({ markdown: md, resources: [fig] }, screen(), createMeasurementCache());
      expect(doc.pages[1]!.floats?.length, `h=${h}`).toBe(1);
      expect(overflowing(doc), `h=${h}`).toEqual([]);
      // Every line of the long paragraph is still set.
      const whole = buildDocument({ markdown: text(200, 1) }, screen(), createMeasurementCache());
      expect(linesOf(doc, 2), `h=${h}`).toBe(linesOf(whole, 0));
    }
  });

  it('breaks where the column ends when no break satisfies the widow rule', () => {
    // Two lines to a page and a widow minimum of three: no split of the
    // paragraph keeps three lines at a page foot, so every page takes the
    // two it holds rather than one page taking all of them.
    const config = screen({ widowMinLines: 3 });
    config.page = { ...config.page, height: px(40 + 54 + 40) };
    const doc = buildDocument({ markdown: text(60) }, config, createMeasurementCache());
    expect(overflowing(doc)).toEqual([]);
    const whole = buildDocument({ markdown: text(60) }, screen(), createMeasurementCache());
    expect(linesOf(doc, 0)).toBe(linesOf(whole, 0));
    expect(doc.pages.length).toBe(Math.ceil(linesOf(whole, 0) / 2));
  });
});
